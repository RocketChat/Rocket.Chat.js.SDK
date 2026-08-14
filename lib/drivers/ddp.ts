/// <reference path="../../types/websocket.d.ts" />
/**
 * @module DDPDriver
 * Handles low-level websocket ddp connections and event subscriptions
 */

import WebSocket from 'universal-websocket-client'

import { SDKEventEmitter } from '../emitter'
import { logger as Logger } from '../log'
import { ISocket, IDriver } from './index'
import * as settings from '../settings';

import {
  ISocketOptions,
  ISocketConfig,
  ISubscription,
  ICredentials,
  ILoginResult,
  ICredentialsPass,
  isLoginPass,
  ICredentialsOAuth,
  isLoginOAuth,
  ICredentialsAuthenticated,
  isLoginAuthenticated,
  isLoginResult,
  ISocketMessageCallback,
	ICallback,
	ILogger
} from '../../interfaces'

import { DDPError, toError } from './ddpError'
import { hostToWS } from '../util'
import { sha256 } from 'js-sha256'

const userDisconnectCloseCode = 4000;
const socketOpen = 1;
const socketClosed = 3;

const abandonedByReopen = '[ddp] connection reopened before the response arrived'
const abandonedByClose = '[ddp] connection closed before the response arrived'
const abandonedBySocketChange = '[ddp] connection replaced before the message was written'

class AbandonedWait extends Error {
  constructor (message?: string) {
    super(message)
    Object.setPrototypeOf(this, AbandonedWait.prototype)
  }
}

/**
 * An `AbandonedWait` for a request whose frame was already written, carrying the
 * id so a caller can name what the server may have acted on. See ADR-0006.
 */
class AbandonedRequest extends AbandonedWait {
  constructor (public id: string, message: string) {
    super(message)
    Object.setPrototypeOf(this, AbandonedRequest.prototype)
  }
}

/** Websocket handler class, manages connections and subscriptions by DDP */
export class Socket extends SDKEventEmitter {
  sent = 0
  host: string
  lastPing = Date.now()
  subscriptions: { [id: string]: ISubscription } = {}
  config: ISocketConfig
  openTimeout?: NodeJS.Timer | number
  pingTimeout?: NodeJS.Timer | number
  connection?: WebSocket
  session?: string
  logger: ILogger
  reopenPromise?: Promise<void>
  private subscriptionRequests: { [id: string]: Promise<void> } = {}

  /** Create a websocket handler */
  constructor (
    options: ISocketOptions | any = {},
    public resume: ILoginResult | null = null
  ) {
    super()
    this.logger = options.logger || Logger
    const timeout = options.timeout || 10000
    this.config = {
      host: options.host || 'http://localhost:3000',
      useSsl: options.useSsl || false,
      reopen: options.reopen || 10000,
      ping: options.ping || timeout,
      timeout
    }

    this.host = `${hostToWS(this.config.host, this.config.useSsl)}/websocket`

    this.on('ping', () => {
      this.lastPing = Date.now()
      this.send({ msg: 'pong' }).then(this.logger.debug, this.logger.error)
    })

    this.on('result', (data: any) => this.emit(data.id, { id: data.id, result: data.result, error: data.error }))
    this.on('ready', (data: any) => this.emit(data.subs[0], data))
  }

  /**
   * Create a new WebSocket, tear down any previous one, and wire up handlers.
   * Emits 'connecting' exactly once per actual new socket.
   */
  private createConnection = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      let connection: WebSocket

      try {
        connection = new WebSocket(this.host, null, { headers: settings.customHeaders })
        connection.onerror = reject
      } catch (err) {
        this.logger.error(err)
        return reject(err)
      }
      // Tear down the previous connection before replacing it.
      // Callers only reach here when the existing socket isn't healthy, so
      // detaching its handlers and closing it stops a stale or still-connecting
      // socket from later firing onClose and clobbering the live connection.
      if (this.connection) {
        try {
          this.connection.onopen = null as any
          this.connection.onmessage = null as any
          this.connection.onerror = null as any
          this.connection.onclose = null as any
          this.connection.close(userDisconnectCloseCode)
        } catch (err) {
          this.logger.debug(`[ddp] open: previous connection teardown failed: ${(err as Error).message}`)
        }
      }
      this.connection = connection
      this.connection.onmessage = this.onMessage.bind(this)
      this.connection.onclose = (ev: any) => this.onClose(ev, connection) // pass closing socket so onClose can compare identity
      this.connection.onopen = this.onOpen.bind(this, resolve, reject)
      this.emit('connecting')
    })
  }

  /**
   * Open websocket connection.
   * Stores connection, setting up handlers for open/close/message events.
   * Resumes login if given token.
   */
  open = async (): Promise<any> => {
    if (this.connected) {
      return undefined
    }

    if (this.reopenPromise) {
      await this.reopenPromise
      return this.connection
    }

    await this.createConnection()
    return this.connection
  }

  /** Send handshake message to confirm connection, start pinging. */
  onOpen = async (resolve: Function, reject: Function) => {
    this.lastPing = Date.now()

    // `onopen` is a websocket callback, so a throw here has nowhere to go.
    let connected
    try {
      connected = await this.send({
        msg: 'connect',
        version: '1',
        support: ['1', 'pre2', 'pre1']
      })
    } catch (err) {
      this.logger.error(`[ddp] the handshake did not complete: ${(err as Error).message}`)
      return reject(err)
    }
    this.session = connected.session
    this.ping().catch((err) => this.logger.error(`[ddp] Unable to ping server: ${err.message}`))
    this.emit('open')
    return resolve(this.connection)
  }

  /** Emit close event so it can be used for promise resolve in close() */
  onClose = (e: any, closedConnection?: WebSocket) => {
    // Ignore close events from a socket we've already replaced (an
    // orphan). Only the current connection's close should flip app state or trigger a
    // reopen; otherwise a zombie socket's late close clobbers the live connection and
    // the app falsely shows "Waiting for network".
    if (closedConnection && closedConnection !== this.connection) {
      return
    }
    this.emit('close', e)
    try {
      if (e?.code !== userDisconnectCloseCode) {
        this.reopen()
      }
      this.logger.info(`[ddp] Close (${e?.code})`)
    } catch (error) {
      this.logger.error(error)
    }
  }

  /**
   * Dispatch incoming message data as events. A frame is emitted once under each
   * of `collection`, `msg` and `id` that it carries, so a subscriber can listen
   * on whichever of the three it knows. Any frame at all also counts as a sign of
   * life and moves `lastPing`.
   */
  onMessage = (e: any) => {
    if (!e.data) return

    // The caller is the websocket's `onmessage`, which has nowhere to put a
    // throw — a malformed frame is logged and dropped.
    let data
    try {
      data = JSON.parse(e.data)
    } catch (err) {
      return this.logger.error(
        `[ddp] JSON parse error on frame: ${e.data} — ${(err as Error).message}`
      )
    }

    // A frame that parses to a falsy value — `null`, `0`, `""` — carries
    // nothing to dispatch on.
    if (!data) return this.logger.debug(`[ddp] empty frame dropped: ${e.data}`)

    this.lastPing = Date.now()

    this.logger.debug(data) // 👈  very useful for debugging missing responses
    this.logger.debug(`[ddp] messages received: ${e.data}`)
    if (data.collection) this.emit(data.collection, data)
    if (data.msg) this.emit(data.msg, data)
    if (data.id) this.emit(data.id, data)
  }

  /** Disconnect the DDP from server and clear all subscriptions. */
  close = async () => {
    this.unsubscribeAll().catch(e => this.logger.debug(e))

    this.openTimeout && clearTimeout(this.openTimeout as any)
    this.pingTimeout && clearTimeout(this.pingTimeout as any)

    if (this.connection && this.connection.readyState !== socketClosed) {
      const connection = this.connection
      await new Promise((resolve) => {
        this.once('close', resolve)
        connection.close(userDisconnectCloseCode)
      })
      .catch(this.logger.error)
    }

    this.forgetAllSubscriptions()

    return Promise.resolve()
  }

  /** Drop one DDP subscription. */
  forgetSubscription = (id: string) => {
    delete this.subscriptions[id]
  }

  /** Drop every DDP subscription, one key at a time, in the same object. */
  forgetAllSubscriptions = () => {
    Object.keys(this.subscriptions).forEach((id) => this.forgetSubscription(id))
  }

  // Call open directly, so it skips openTimeout
  checkAndReopen = () => {
    if (!this.connected) {
      if (this.openTimeout) {
        clearTimeout(this.openTimeout as any)
        delete this.openTimeout
      }
      this.open().catch((err) => this.logger.error(`[ddp] Reopen error: ${(err as Error).message}`))
    }
  }

  private reopenUnlessAbandoned = (err: unknown) => {
    if (!(err instanceof AbandonedWait)) this.reopen()
  }

  /** Clear connection and try to connect again. */
  reopen = () => {
    if (this.openTimeout) return
    this.openTimeout = setTimeout(async() => {
      delete this.openTimeout

      try {
        await this.open()
      } catch (err) {
        this.logger.error(`[ddp] Reopen error: ${(err as Error).message}`);
        this.reopenUnlessAbandoned(err);
      }
    }, this.config.reopen);
  }

  /**
   * Force an immediate reconnect. Shared across concurrent callers so only one
   * new WebSocket is created. Emits 'disconnected' to unblock in-flight sends,
   * then creates the connection directly so a concurrent open() cannot tear it
   * down. Unhandled creation errors are swallowed because cleanup already runs
   * via the open/timeout paths.
   *
   * Past the deadline the promise resolves and `reopenPromise` is cleared even
   * though the connection may still be down.
   */
  reopenNow = (): Promise<void> => {
    if (this.reopenPromise) {
      return this.reopenPromise
    }

    this.reopenPromise = new Promise<void>(resolve => {
      this.openTimeout && clearTimeout(this.openTimeout as any)
      this.lastPing = 0
      this.emit('disconnected')

      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        this.off('open', cleanup)
        if (timeout) clearTimeout(timeout as any)
        delete this.reopenPromise
        resolve()
      }

      this.once('open', cleanup)

      this.createConnection().catch(() => {})

      const timeout = setTimeout(() => cleanup(), this.config.timeout)
    })

    return this.reopenPromise
  }

  /**
   * Bounded liveness check for a socket in the gray zone. Returns true only if
   * the socket is open and the server answers the ping within the deadline.
   */
  probe = (timeoutMs = 2000): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      const connection = this.connection
      if (!connection || connection.readyState !== socketOpen) {
        return resolve(false)
      }

      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        this.off('pong', onPong)
        if (timeout) clearTimeout(timeout as any)
      }

      const onPong = () => {
        cleanup()
        resolve(true)
      }

      this.once('pong', onPong)

      const timeout = setTimeout(() => {
        cleanup()
        resolve(false)
      }, timeoutMs)

      try {
        connection.send(JSON.stringify({ msg: 'ping' }))
      } catch {
        cleanup()
        resolve(false)
      }
    })
  }

  get transportOpen () {
    return !!(this.connection && this.connection.readyState === socketOpen)
  }

  get connected () {
    return this.transportOpen && this.alive()
  }

  get loggedIn () {
    return (this.connected && !!this.resume)
  }

  /**
   * Wait for the socket to open, bounded by the reopen interval. Rejects on the
   * deadline so a send issued while the socket is down fails the caller rather
   * than hanging for the life of the process.
   *
   * The default is twice `config.reopen`, not `config.reopen`: `reopen()` only
   * *schedules* the retry at that interval, so a deadline of exactly `reopen`
   * expires as the reconnect begins and every send issued at a drop fails.
   */
  private waitForOpen = (timeoutMs = this.config.reopen * 2): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.off('open', onOpen)
        clearTimeout(timeout as any)
      }

      const onOpen = () => {
        cleanup()
        resolve()
      }

      this.once('open', onOpen)

      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('[ddp] timed out waiting for the connection to open'))
      }, timeoutMs)
    })
  }

  /**
   * Send an object to the server via Socket. Adds handler to collection to
   * allow awaiting response matching an expected object. Most responses are
   * identified by their message event name and the ID they were sent with, but
   * some responses don't return the ID fallback to just matching on event name.
   * Data often includes an error attribute if something went wrong, but certain
   * types of calls send back a different `msg` value instead, e.g. `nosub`.
   * @param obj       Object to be sent
   * @param msg       The `data.msg` value to wait for in response
   * @param errorMsg  An alternate `data.msg` value indicating an error response
   */
  send = async (obj: any): Promise<any> => {
    // Outside the promise executor: a `throw` from an async executor is dropped
    // on the floor as an unhandled rejection instead of rejecting the send.
    if (!this.connection) throw new Error('[ddp] sending without open connection')
    // A message belongs to the connection that was current when it was sent. It
    // is never written to a successor: the DDP session, and any Login on it, is
    // the old connection's.
    const connection = this.connection
    // Transport open, not `connected`: `connected` folds in the Liveness chain,
    // and a quiet-but-open socket will not emit `open` again.
    if (!this.transportOpen) {
      await this.waitForOpen()
      if (this.connection !== connection) throw new AbandonedWait(abandonedBySocketChange)
      // The wait resolves a microtask before the listeners below are attached, so
      // a connection lost in that window would be missed by all three of them.
      // `readyState` rather than `connected`: in that window the events have not
      // been delivered, so only the transport knows whether the connection went away.
      if (connection.readyState !== socketOpen) throw new AbandonedWait(abandonedByClose)
    }

    return new Promise<any>((resolve, reject) => {
      const id = obj.id || `ddp-${ this.sent }`
      this.sent += 1
      const data = { ...obj, ...(/connect|ping|pong/.test(obj.msg) ? {} : { id }) }
      const stringdata = JSON.stringify(data)
      const listener = (data.msg === 'ping' && 'pong') || (data.msg === 'connect' && 'connected') || data.id
      this.logger.debug(`[ddp] sending message: ${stringdata}`)

      try {
        connection.send(stringdata)
      } catch (err) {
        this.logger.error(`[ddp] the transport failed to write the message: ${stringdata}`);
        return reject(err)
      }

      // Before any listener is attached: a DDP message with no response to wait for —
      // `pong` — would otherwise strand a `disconnected` listener forever.
      if (!listener) {
        return resolve(undefined)
      }

      // The DDP response can only arrive on the connection this message went out
      // on, so every event that ends that connection ends this wait.
      const abandonListeners = [
        { event: 'disconnected', message: abandonedByReopen },
        { event: 'connecting', message: abandonedByReopen },
        { event: 'close', message: abandonedByClose }
      ].map(({ event, message }) => ({
        event,
        onAbandon: () => {
          removeListeners()
          reject(new AbandonedRequest(id, message))
        }
      }))

      const removeListeners = () => {
        this.off(listener, onResponse)
        abandonListeners.forEach(({ event, onAbandon }) => this.off(event, onAbandon))
      }

      const onResponse = (result: any) => {
        removeListeners()
        return (result.error ? reject(toError(result.error)) : resolve({ ...(/connect|ping|pong/.test(obj.msg) ? {} : { id }) , ...result }))
      }

      abandonListeners.forEach(({ event, onAbandon }) => this.once(event, onAbandon))
      this.once(listener, onResponse)
    })
  }

  /** Send ping, record time, re-open if nothing comes back, repeat */
  ping = async () => {
    this.pingTimeout && clearTimeout(this.pingTimeout as any)
    this.pingTimeout = setTimeout(() => {
      // The ping goes out on an open socket, so its send never waits on
      // `open` — it waits on a pong reply that a dead socket never
      // sends, and without a deadline of its own the chain stops here and
      // `reopen` is never reached. The deadline lives in `ping` rather than in
      // `send`, so no other caller inherits a reply timeout.
      let deadline: NodeJS.Timer | number | undefined
      const answered = new Promise<void>((_, expire) => {
        deadline = setTimeout(
          () => expire(new Error('[ddp] ping went unanswered')),
          this.config.ping
        )
      })

      Promise.race([this.send({ msg: 'ping' }), answered])
        .then(() => this.ping())
        .catch(this.reopenUnlessAbandoned)
        .finally(() => clearTimeout(deadline as any))
    }, this.config.ping)
  }

  /** Check if ping-pong to server is within tolerance of 1 missed ping */
  alive = () => {
    if (!this.lastPing) return false
    return (Date.now() - this.lastPing <= this.config.ping * 2)
  }

  /**
   * Calls a method on the server and returns a promise resolved
   * with the result of the method.
   * @param method    The name of the method to be called
   * @param params    An array with the parameters to be sent
   */
  call = async (method: string, ...params: any[]) => {
    const response = await this.send({ msg: 'method', method, params })
      .catch((err) => {
        this.logger.error(`[ddp] Call error: ${err.message}`)
        throw err
      })
    return (response.result) ? response.result : response
  }

  /**
   * Login to server and resubscribe to all subs, resolve with user information.
   * @param credentials User credentials (username/password, oauth or token)
   */
  login = async (credentials: any) => {
    const params = this.loginParams(credentials)
    this.resume = (await this.call('login', params) as ILoginResult)
    this.subscribeAll().catch(console.log)
    this.emit('login', this.resume)
    return this.resume
  }

  /** Take variety of login credentials object types for accepted params */
  loginParams = (
    credentials:
      ICredentialsPass |
      ICredentialsOAuth |
      ICredentialsAuthenticated |
      ILoginResult |
      ICredentials
  ) => {
    if (
      isLoginPass(credentials) ||
      isLoginOAuth(credentials) ||
      isLoginAuthenticated(credentials)
    ) {
      return credentials
    }
    if (isLoginResult(credentials)) {
      const params: ICredentialsAuthenticated = {
        resume: credentials.token
      }
      return params
    }
    const params: ICredentialsPass = {
      user: { username: credentials.username },
      password: {
        digest: sha256(credentials.password),
        algorithm: 'sha-256'
      }
    }
    return params
  }

  /** Logout the current User from the server via Socket. */
  logout = () => {
    this.resume = null
    return this.unsubscribeAll()
			.then(() => this.call('logout'))
  }

  /** Register a callback to trigger on message events in subscription */
  onEvent = (id: string, callback: ISocketMessageCallback) => {
    this.on(id, callback)
  }

  /**
   * Hold a `sub` or `unsub` until the one before it on the same id has its DDP
   * response.
   *
   * A `sub` and an `unsub` for one DDP subscription carry the same id, and
   * `send` matches a DDP response to its request by id alone, so two of them in
   * flight at once leave the first response settling both — the `nosub` that
   * ends the DDP subscription also settles the `sub`, and the `ready` that
   * establishes it also settles the `unsub`. The server takes one message from
   * a session at a time and answers in that order, so waiting for the response
   * is enough to keep one request per id on the wire.
   *
   * Nothing bounds the wait but the request before it. A send that loses its
   * connection is abandoned rather than left pending, so a chain always drains.
   */
  private queueSubscriptionRequest = <T>(id: string | undefined, request: () => Promise<T>): Promise<T> => {
    if (!id) return request()

    // The tail is registered here rather than when the frame goes out, so a
    // third request queues behind the second rather than behind the first.
    const waiting = this.subscriptionRequests[id]
    const sending = waiting ? waiting.then(request) : request()
    const settled = sending.then(() => undefined, () => undefined)

    this.subscriptionRequests[id] = settled
    settled.then(() => {
      if (this.subscriptionRequests[id] === settled) delete this.subscriptionRequests[id]
    })

    return sending
  }

  /**
   * Subscribe to a stream on server via socket and returns a promise resolved
   * with the subscription object when the subscription is ready.
   *
   * Sole owner of `subscriptions`: the entry is written when the server
   * acknowledged the `sub`, or when its answer was abandoned after the frame went
   * out. A refused `sub`, and one that never reached the wire, leave nothing
   * behind. See ADR-0006.
   * @param name      Stream name to subscribe to
   * @param params    Params sent to the subscription request
   */
  subscribe = (name: string, params: any[], callback ?: ISocketMessageCallback, id?: string) => {
    this.logger.info(`[ddp] Subscribe to ${name}, param: ${JSON.stringify(params)}`)
    return this.queueSubscriptionRequest(id, () => this.send({ msg: 'sub', id, name, params }))
      .then((result) => {
        const confirmedId = (result.subs) ? result.subs[0] : undefined
        if (confirmedId) return this.rememberSubscription(confirmedId, name, params, callback)
      })
      .catch((err) => {
        this.logger.error(`[ddp] Subscribe error: ${err.message}`)
        if (err instanceof AbandonedRequest) {
          this.rememberSubscription(err.id, name, params, callback)
        }
        return undefined
      })
  }

  /** Write the entry that instructs `subscribeAll` to establish this stream. */
  private rememberSubscription = (
    id: string,
    name: string,
    params: any[],
    callback?: ISocketMessageCallback
  ) => {
    const unsubscribe = this.unsubscribe.bind(this, id)
    const onEvent = this.onEvent.bind(this, name)
    const subscription = { id, name, params, unsubscribe, onEvent }
    if (callback) subscription.onEvent(callback)
    this.subscriptions[id] = subscription
    return subscription
  }

  /** Subscribe to all pre-configured streams (e.g. on login resume) */
  subscribeAll = () => {
    const subscriptions = Object.keys(this.subscriptions || {}).map((key) => {
      const { name, params, id } = this.subscriptions[key]
      return this.subscribe(name, params, undefined, id)
    })
    return Promise.all(subscriptions)
  }

  /** Unsubscribe to server stream, resolve with unsubscribe request result */
  unsubscribe = (id: any) => {
    if (!this.subscriptions[id]) return Promise.reject(new Error(`[ddp] No subscription to unsubscribe from: ${id}`))
    return this.queueSubscriptionRequest(id, () => this.send({ msg: 'unsub', id }))
      .then((data: any) => {
        this.forgetSubscription(id)
        return data.result || data.subs
      })
      .catch((err) => {
        if (err instanceof DDPError) this.forgetSubscription(id)
        this.logger.error(`[ddp] Unsubscribe error: ${err.message}`)
        throw err
      })
  }

  /** Unsubscribe from all active subscriptions, ignoring any the server refuses */
  unsubscribeAll = () => {
    const unsubAll = Object.keys(this.subscriptions).map((id) => {
      return this.subscriptions[id].unsubscribe().catch(() => undefined)
    })
    return Promise.all(unsubAll).then(() => undefined)
  }
}

export class DDPDriver extends SDKEventEmitter implements ISocket, IDriver {
  logger: ILogger
  config: ISocketOptions
	/**
	 * Event Emitter for listening to connection (echoes selection of DDP events)
	 * @example
	 *  import { driver } from '@rocket.chat/sdk'
	 *  driver.connect()
	 *  driver.events.on('connected', () => console.log('driver connected'))
	 */
	// events = new EventEmitter()

	/**
	 * An Websocket instance for interacting with Rocket.Chat.
	 * Variable not initialised until `connect` called.
	 */
  ddp: Socket

	/**
	 * Websocket subscriptions, exported for direct polling by adapters
	 * Variable not initialised until `prepMeteorSubscriptions` called.
	 * @deprecated Use `ddp.Socket` instance subscriptions instead.
	 */
  subscriptions: { [id: string]: ISubscription } = {}

	/** Save messages subscription to ensure only one created */
  messages: ISubscription | undefined

	/** Current user object populated from resolved login */
  userId: string = ''

	/** Array of joined room IDs (for reactive queries) */
  joinedIds: string[] = []

  // `integrationId` is destructured only to keep it out of `...moreConfigs`,
  // which is spread into `this.config`.
  constructor ({ host = 'localhost:3000', integrationId: _integrationId, config, logger = Logger, ...moreConfigs }: any = {}) {
    super()

    const options = {
      ...config,
      ...moreConfigs,
      host: host.replace(/(^\w+:|^)\/\//, '')
			// reopen: number
			// ping: number
			// close: number
			// integration: string
    }
    this.ddp = new Socket({ ...options, logger })
    this.ddp.on('open', () => this.emit('connected'))
    this.config = { ...options, timeout: this.ddp.config.timeout }
    this.logger = logger
  }

	/**
	 * Initialise socket instance with given options or defaults.
	 * Proxies the DDP module socket connection. Resolves with socket when open.
	 * Accepts callback following error-first-pattern.
	 * Error returned or promise rejected on timeout.
	 * @example <caption>Using promise</caption>
	 *  import { driver } from '@rocket.chat/sdk'
	 *  driver.connect()
	 *    .then(() => console.log('connected'))
	 *    .catch((err) => console.error(err))
	 */
  connect = (c: any = {}): Promise<any> => {
    if (this.connected) {
      return Promise.resolve(this)
    }
    return new Promise((resolve, reject) => {
      this.logger.info('[driver] Connecting', { ...this.config, ...c })
      this.subscriptions = this.ddp.subscriptions

      const onConnected = () => {
        this.logger.info('[driver] Connected')
        resolve(this as IDriver)
      }

      this.ddp.open().catch((err: Error) => {
        this.logger.error(`[driver] Failed to connect: ${err.message}`)
        this.off('connected', onConnected)
        reject(err)
      })

      this.once('connected', onConnected)
    })
  }

  get connected (): boolean {
    return !!this.ddp.connected
  }

  disconnect = (): Promise<any> => {
    return this.ddp.close()
  }

  checkAndReopen = (): void => {
    return this.ddp.checkAndReopen()
  }

  reopenNow = (): Promise<void> => {
    return this.ddp.reopenNow()
  }

  probe = (timeoutMs?: number): Promise<boolean> => {
    return this.ddp.probe(timeoutMs)
  }

  get lastPing (): number {
    return this.ddp.lastPing
  }

  get pingInterval (): number {
    return this.ddp.config.ping
  }

  subscribe = (topic: string, eventname: string, ...args: any[]): Promise<ISubscription | undefined> => {
    this.logger.info(`[DDP driver] Subscribing to ${topic} | ${JSON.stringify(args)}`)
    return this.ddp.subscribe(topic, [eventname, { 'useCollection': false, 'args': args }])
  }

  subscribeRaw = (...args: any[]): Promise<ISubscription | undefined> => {
    this.logger.info(`[DDP driver] Raw Subscribing to ${JSON.stringify(args)}`)
    return this.ddp.subscribe(...args as [string, any[]])
  }

  subscribeNotifyAll = (): Promise< any> => {
    const topic = 'stream-notify-all'
    return Promise.all([
      'roles-change',
      'updateEmojiCustom',
      'deleteEmojiCustom',
      'updateAvatar',
      'public-settings-changed',
      'permissions-changed'
    ].map(event => this.subscribe(topic, event, false)))
  }

  subscribeLoggedNotify = (): Promise<any> => {
    const topic = 'stream-notify-logged'
    return Promise.all([
      'Users:NameChanged',
      'Users:Deleted',
      'updateAvatar',
      'updateEmojiCustom',
      'deleteEmojiCustom',
      'roles-change'
    ].map(event => this.subscribe(topic, event, false)))
  }

  subscribeNotifyUser = (): Promise<any> => {
    const topic = 'stream-notify-user'
    return Promise.all([
      'message',
      'otr',
      'webrtc',
      'notification',
      'rooms-changed',
      'subscriptions-changed',
      'uiInteraction',
      'e2ekeyRequest',
      'userData',
      'video-conference',
      'media-signal',
      'media-calls'
    ].map(event => this.subscribe(topic, `${this.userId}/${event}`, false)))
  }

  /**
   * Re-send the user's media-signal and media-calls subscriptions on the current
   * socket and resolve when the server acks them with `ready`. This gives the app
   * an observable readiness signal after a forced reconnect.
   *
   * If the subscriptions are not yet present (e.g. immediately after reopenNow),
   * it polls the socket subscription map until they appear or the deadline expires.
   */
  waitForNotifyUserMediaSubs = (timeoutMs = this.ddp.config.timeout): Promise<boolean> => {
    if (!this.userId) {
      return Promise.resolve(false)
    }
    const topic = 'stream-notify-user'
    const names = ['media-signal', 'media-calls']
    const userId = this.userId
    const findSubs = () => Object.keys(this.ddp.subscriptions || {})
      .map(id => this.ddp.subscriptions[id])
      .filter((sub: any) => (
        sub &&
        sub.name === topic &&
        names.some(name => sub.params?.[0] === `${userId}/${name}`)
      ))
    // Go through the raw socket: the driver's subscribe() wrapper reshapes its
    // arguments and would drop the subscription id, making the server treat the
    // resubscribe as a brand new subscription.
    const resubscribe = (subs: any[]) => Promise.all(
      subs.map((sub: any) => this.ddp.subscribe(topic, sub.params, undefined, sub.id))
    )
      .then(results => {
        const unacknowledged = subs.filter((_: any, index: number) => !results[index])
        unacknowledged.forEach((sub: any) => this.logger.error(
          `[ddp] Subscribe not acknowledged: ${sub.params?.[0]}`
        ))
        return unacknowledged.length === 0
      })
      .catch(() => false)
    return new Promise<boolean>(resolve => {
      let settled = false
      let inFlight = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        clearInterval(poll)
        clearTimeout(deadline)
        resolve(value)
      }
      const attempt = () => {
        if (inFlight) return
        const subs = findSubs()
        const allPresent = names.every(name => subs.some((sub: any) => sub.params?.[0] === `${userId}/${name}`))
        if (allPresent) {
          inFlight = true
          resubscribe(subs).then(value => {
            inFlight = false
            finish(value)
          })
        }
      }
      const deadline = setTimeout(() => finish(false), timeoutMs)
      const poll = setInterval(attempt, 100)
      attempt()
    })
  }

  subscribeRoom = (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]> => {
    const topic = 'stream-notify-room'
    return Promise.all([
      this.subscribe('stream-room-messages', rid, ...args),
      this.subscribe(topic, `${rid}/typing`, ...args),
      this.subscribe(topic, `${rid}/deleteMessage`, ...args)
    ])
  }

	/** Login to Rocket.Chat via DDP */
  login = async (credentials: ICredentials, _args: any): Promise<any> => {
    if (!this.ddp || !this.ddp.connected) {
      await this.connect()
    }
    this.logger.info(`[DDP driver] Login with ${JSON.stringify(credentials)}`)
    const login: ILoginResult = await this.ddp.login(credentials)
    this.userId = login.id
    return login
  }
  logout = async () => {
    if (this.ddp && this.ddp.connected) {
      await this.ddp.logout()
    }

  }
	/** Unsubscribe from Meteor stream. Proxy for socket unsubscribe. */
  unsubscribe = (subscription: ISubscription) => {
    return this.ddp.unsubscribe(subscription.id)
  }

	/** Unsubscribe from all subscriptions. Proxy for socket unsubscribeAll */
  unsubscribeAll = (): Promise<void> => {
    return this.ddp.unsubscribeAll()
  }

  onStreamData = (event: string, cb: ICallback): Promise<any> => {
    function listener (message: any) {
      cb((message))
    }
    return Promise.resolve(this.ddp.on(event, listener))
      .then(() => ({
        stop: () => this.ddp.off(event, listener)
      }))
  }

  onMessage = (cb: ICallback): void => {
    this.ddp.on('stream-room-messages', ({ fields: { args: [message] } }: any) => cb(this.ejsonMessage(message)))
  }

  onTyping = (cb: ICallback): Promise<any > => {
    return this.ddp.on('stream-notify-room', ({ fields: { args: [username, isTyping] } }: any) => {
      cb(username, isTyping)
    }) as any
  }

  notifyVisitorTyping = (rid: string, username: string, typing: boolean, token: string) => {
    return this.ddp.call('stream-notify-room', `${ rid }/typing`, username, typing, { token })
  }

  ejsonMessage = (message: any) => {
    if (message.ts) {
      message.ts = new Date(message.ts.$date)
    }
    return message
  }

  methodCall = (method: string, ...args: any[]): Promise<any> => {
    return this.ddp.call(method, ...args)
  }
}
