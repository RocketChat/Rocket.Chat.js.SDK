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
  ISocketMessageHandler,
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

const abandonedBeforeResponse = '[ddp] connection reopened before the response arrived'

interface IResponseWaiter {
  receive: (response: any) => void
  abandon: (reason: Error) => void
}

/** The three outgoing DDP messages the protocol matches by `msg` alone. */
const carriesNoId = (msg: string) => /connect|ping|pong/.test(msg)

/**
 * The correlation key the response to an outgoing DDP message will arrive on,
 * or `undefined` for one that is answered by nothing.
 */
const requestCorrelationKey = (request: any): string | undefined =>
  (request.msg === 'ping' && 'pong') ||
  (request.msg === 'connect' && 'connected') ||
  request.id

/**
 * The correlation key an incoming DDP message settles, or `undefined` for one
 * that answers no request. These five `msg` values are the DDP responses.
 */
const responseCorrelationKey = (data: any): string | undefined => {
  switch (data.msg) {
    case 'result':
    case 'nosub':
      return data.id
    case 'ready':
      return data.subs && data.subs[0]
    case 'connected':
    case 'pong':
      return data.msg
    default:
      return undefined
  }
}

/** A DDP response in the shape the caller waiting on it is resolved with. */
const awaitedResponse = (data: any) =>
  data.msg === 'result'
    ? { id: data.id, result: data.result, error: data.error }
    : data

/**
 * The callers waiting on a DDP response, held by correlation key. A key can
 * carry more than one waiter, and one response settles all of them.
 */
export class PendingResponses {
  private waiters: { [key: string]: IResponseWaiter[] } = {}

  register = (key: string, waiter: IResponseWaiter) => {
    this.waiters[key] = (this.waiters[key] || []).concat(waiter)
  }

  deliver = (key: string | undefined, response: any) => {
    if (!key) return
    const waiting = this.waiters[key]
    if (!waiting) return
    delete this.waiters[key]
    waiting.forEach((waiter) => waiter.receive(response))
  }

  abandonAll = (reason: string) => {
    const waiting = Object.keys(this.waiters).map((key) => this.waiters[key])
    this.waiters = {}
    waiting.forEach((waiters) =>
      waiters.forEach((waiter) => waiter.abandon(new Error(reason)))
    )
  }
}

/** Websocket handler class, manages connections and subscriptions by DDP */
export class Socket extends SDKEventEmitter {
  sent = 0
  host: string
  lastPing = Date.now()
  subscriptions: { [id: string]: ISubscription } = {}
  handlers: ISocketMessageHandler[] = []
  config: ISocketOptions | any
  openTimeout?: NodeJS.Timer | number
  pingTimeout?: NodeJS.Timer | number
  connection?: WebSocket
  session?: string
  logger: ILogger
  reopenPromise?: Promise<void>
  pending = new PendingResponses()

  /** Create a websocket handler */
  constructor (
    options: ISocketOptions | any = {},
    public resume: ILoginResult | null = null
  ) {
    super()
    this.logger = options.logger || Logger
    this.config = {
      host: options.host || 'http://localhost:3000',
      useSsl: options.useSsl || false,
      reopen: options.reopen || 10000,
      ping: options.ping || options.timeout || 10000
    }

    this.host = `${hostToWS(this.config.host, this.config.useSsl)}/websocket`

    this.on('ping', () => {
      this.lastPing = Date.now()
      this.send({ msg: 'pong' }).then(this.logger.debug, this.logger.error)
    })

    this.on('disconnected', () => this.pending.abandonAll(abandonedBeforeResponse))
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
      this.connection.onopen = this.onOpen.bind(this, resolve)
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
  onOpen = async (callback: Function) => {
    this.lastPing = Date.now()

    const connected = await this.send({
      msg: 'connect',
      version: '1',
      support: ['1', 'pre2', 'pre1']
    })
    this.session = connected.session
    this.ping().catch((err) => this.logger.error(`[ddp] Unable to ping server: ${err.message}`))
    this.emit('open')
    return callback(this.connection)
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
   * Fan an incoming DDP message out to its consumers, then hand it to the
   * caller waiting on it. Consumers subscribe by collection or by `msg`; a
   * waiting caller is found by correlation key, on a separate register.
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
    this.pending.deliver(responseCorrelationKey(data), awaitedResponse(data))
  }

  /** Disconnect the DDP from server and clear all subscriptions. */
  close = async () => {
    this.unsubscribeAll().catch(e => this.logger.debug(e))

    this.openTimeout && clearTimeout(this.openTimeout as any)
    this.pingTimeout && clearTimeout(this.pingTimeout as any)

    if (this.connection && this.connection.readyState !== 3) {
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
      this.open()
    }
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
        this.reopen();
      }
    }, this.config.reopen);
  }

  /**
   * Force an immediate reconnect. Shared across concurrent callers so only one
   * new WebSocket is created. Emits 'disconnected' to unblock in-flight sends,
   * then creates the connection directly so a concurrent open() cannot tear it
   * down. Unhandled creation errors are swallowed because cleanup already runs
   * via the open/timeout paths.
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

      const timeout = setTimeout(() => cleanup(), 10000)
    })

    return this.reopenPromise
  }

  /**
   * Bounded liveness check for a socket in the gray zone. Returns true only if
   * the socket is open and the server answers the ping within the deadline.
   */
  probe = (timeoutMs = 2000): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      if (!this.connection || this.connection.readyState !== 1) {
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
        this.connection.send(JSON.stringify({ msg: 'ping' }))
      } catch {
        cleanup()
        resolve(false)
      }
    })
  }

  /** Check if websocket connected and ready. */
  get connected () {
    return !!(
      this.connection &&
      this.connection.readyState === 1 &&
      this.alive()
    )
  }

  /** Check if connected and logged in */
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
   * Send a DDP message to the server and resolve with the DDP response that
   * answers it. Most responses correlate on the id the request was sent with;
   * the handshake and the ping have no id and correlate on the `msg` of their
   * reply instead.
   * @param obj  The DDP message to be sent
   */
  send = async (obj: any): Promise<any> => {
    // Outside the promise executor: a `throw` from an async executor is dropped
    // on the floor as an unhandled rejection instead of rejecting the send.
    if (!this.connection) throw new Error('[ddp] sending without open connection')
    if (!this.connected) await this.waitForOpen()

    return new Promise<any>((resolve, reject) => {
      const id = obj.id || `ddp-${ this.sent }`
      this.sent += 1
      const data = { ...obj, ...(carriesNoId(obj.msg) ? {} : { id }) }
      const stringdata = JSON.stringify(data)
      const key = requestCorrelationKey(data)
      this.logger.debug(`[ddp] sending message: ${stringdata}`)

      try {
        // Read fresh rather than captured above the wait: a reopen while the send
        // waited on `open` will have replaced the connection.
        this.connection!.send(stringdata)
      } catch (err) {
        this.logger.error(`[ddp] the transport failed to write the message: ${stringdata}`);
        return reject(err)
      }

      if (!key) {
        return resolve(undefined)
      }

      this.pending.register(key, {
        receive: (response: any) => (
          response.error
            ? reject(toError(response.error))
            : resolve({ ...(carriesNoId(obj.msg) ? {} : { id }), ...response })
        ),
        abandon: reject
      })
    })
  }

  /** Send ping, record time, re-open if nothing comes back, repeat */
  ping = async () => {
    this.pingTimeout && clearTimeout(this.pingTimeout as any)
    this.pingTimeout = setTimeout(() => {
      // The ping goes out while `connected` is still true, so its send never
      // waits on `open` — it waits on a pong reply that a dead socket never
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
        .catch(() => this.reopen())
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

  /** Register a callback to trigger on every DDP message from a stream */
  onEvent = (name: string, callback: ISocketMessageCallback) => {
    this.on(name, callback)
  }

  /**
   * Subscribe to a stream on server via socket and returns a promise resolved
   * with the subscription object when the subscription is ready.
   *
   * Sole owner of `subscriptions`: the entry is written on the server's
   * acknowledgement, so a refused or unanswered `sub` leaves nothing behind.
   * @param name      Stream name to subscribe to
   * @param params    Params sent to the subscription request
   */
  subscribe = (name: string, params: any[], callback ?: ISocketMessageCallback, id?: string) => {
    this.logger.info(`[ddp] Subscribe to ${name}, param: ${JSON.stringify(params)}`)
    return this.send({ msg: 'sub', id, name, params })
      .then((result) => {
        const id = (result.subs) ? result.subs[0] : undefined
        if (id) {
          const unsubscribe = this.unsubscribe.bind(this, id)
          const onEvent = this.onEvent.bind(this, name)
          const subscription = { id, name, params, unsubscribe, onEvent }
          if (callback) subscription.onEvent(callback)
          this.subscriptions[id] = subscription
          return subscription
        }
      })
      .catch((err) => {
        this.logger.error(`[ddp] Subscribe error: ${err.message}`)
        // throw err
        return undefined
      })
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
    return this.send({ msg: 'unsub', id })
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

    this.config = {
      ...config,
      ...moreConfigs,
      host: host.replace(/(^\w+:|^)\/\//, ''),
      timeout: moreConfigs.timeout ?? config?.timeout ?? 10000
			// reopen: number
			// ping: number
			// close: number
			// integration: string
    }
    this.ddp = new Socket({ ...this.config, logger })
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
    const config: ISocketOptions = { ...this.config, ...c } // override defaults

    return new Promise((resolve, reject) => {
      this.logger.info('[driver] Connecting', config)
      this.subscriptions = this.ddp.subscriptions
      this.ddp.open().catch((err: Error) => {
        this.logger.error(`[driver] Failed to connect: ${err.message}`)
        reject(err)
      })

      this.ddp.on('open', () => this.emit('connected')) // echo ddp event

      this.once('connected', () => {
        this.logger.info('[driver] Connected')
        resolve(this as IDriver)
      })
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
   * it polls the socket subscription map until they appear or the timeout expires.
   */
  waitForNotifyUserMediaSubs = (timeoutMs = 8000): Promise<boolean> => {
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
      .then(() => true)
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
