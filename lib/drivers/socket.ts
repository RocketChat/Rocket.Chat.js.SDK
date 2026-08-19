/// <reference path="../../types/websocket.d.ts" />
/**
 * @module Socket
 * The DDP layer inside a Driver: it owns the Transport, performs the DDP
 * handshake, runs the Liveness chain and holds the DDP subscriptions.
 */

import WebSocket from 'universal-websocket-client'

import { SDKEventEmitter } from '../emitter'
import { logger as Logger } from '../log'
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
	ILogger
} from '../../interfaces'

import { IStream } from './definitions'
import { DDPError, toError } from './ddpError'
import { sha256 } from 'js-sha256'

function hostToWS (host: string, ssl = false) {
  host = host.replace(/^(https?:\/\/)?/, '')
  return `ws${ssl ? 's' : ''}://${host}`
}

const userDisconnectCloseCode = 4000;
const socketOpen = 1;
const socketClosed = 3;

const socketDeadlineMs = 2000;

const abandonedByReopen = '[ddp] connection reopened before the response arrived'
const abandonedByClose = '[ddp] connection closed before the response arrived'
const abandonedBySocketChange = '[ddp] connection replaced before the message was written'
const abandonedBeforeOpen = '[ddp] connection closed before it opened'
const deadlineExpired = '[ddp] no response arrived before the deadline'

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

/**
 * The wait for a DDP response ended by its Deadline, carrying the id so a caller
 * can name what the server may still have acted on. See ADR-0003 and ADR-0006.
 */
class ExpiredWait extends Error {
  constructor (public id: string) {
    super(deadlineExpired)
    Object.setPrototypeOf(this, ExpiredWait.prototype)
  }
}

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
  private settleReopen?: () => void
  private pendingOpenRejects = new WeakMap<WebSocket, (err: Error) => void>()
  private driverClosedConnection?: WebSocket
  private pingInFlightConnection?: WebSocket
  private openAwaitedConnections = new WeakSet<WebSocket>()
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
  private createConnection = (awaitedByOpen = false): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      let connection: WebSocket

      try {
        connection = new WebSocket(this.host, null, { headers: settings.customHeaders })
        this.pendingOpenRejects.set(connection, reject)
        if (awaitedByOpen) this.openAwaitedConnections.add(connection)
        connection.onerror = (err: any) => {
          this.forgetPendingOpen(connection)
          reject(err)
        }
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
          this.detach(this.connection)
          this.connection.close(userDisconnectCloseCode)
        } catch (err) {
          this.logger.debug(`[ddp] open: previous connection teardown failed: ${(err as Error).message}`)
        }
      }
      this.connection = connection
      this.connection.onmessage = this.onMessage.bind(this)
      this.connection.onclose = (ev: any) => this.onClose(ev, connection) // pass closing socket so onClose can compare identity
      this.connection.onopen = this.onOpen.bind(this, resolve, reject, connection)
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
      if (this.connected) {
        return this.connection
      }
    }

    await this.createConnection(true)
    return this.connection
  }

  /** Send handshake message to confirm connection, start pinging. */
  onOpen = async (resolve: Function, reject: Function, openedConnection?: WebSocket) => {
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
      this.reopenUnlessAbandoned(err)
      return reject(err)
    } finally {
      this.forgetPendingOpen(openedConnection)
    }
    this.session = connected.session
    this.armLivenessChain()
    this.emit('open')
    return resolve(this.connection)
  }

  onClose = (e: any, closedConnection?: WebSocket) => {
    // A detached socket's late close would clobber the live connection.
    if (closedConnection && closedConnection !== this.connection) {
      return
    }
    const closedByDriver = closedConnection !== undefined &&
      closedConnection === this.driverClosedConnection
    this.emit('close', e)
    try {
      if (e?.code !== userDisconnectCloseCode || !closedByDriver) {
        this.reopen()
      }
      this.logger.info(`[ddp] Close (${e?.code})${e?.reason ? `: ${e.reason}` : ''}`)
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

  private forgetPendingOpen = (connection?: WebSocket) => {
    if (!connection) return
    this.pendingOpenRejects.delete(connection)
    this.openAwaitedConnections.delete(connection)
  }

  /**
   * Closing the socket is a separate obligation, left to the caller.
   *
   * An open of this socket that is still pending is abandoned on a microtask,
   * so a handshake rejection already in flight settles it first.
   */
  private detach = (connection: WebSocket) => {
    const rejectPendingOpen = this.pendingOpenRejects.get(connection)
    this.forgetPendingOpen(connection)
    Promise.resolve().then(() => rejectPendingOpen?.(new AbandonedWait(abandonedBeforeOpen)))
    connection.onopen = null as any
    connection.onmessage = null as any
    connection.onerror = null as any
    connection.onclose = null as any
  }

  private replaced = (connection?: WebSocket) =>
    this.connection !== undefined && this.connection !== connection

  /**
   * The wait ends on this socket's `onclose` rather than on the driver's
   * `close` event: a close emitted for the connection that replaced this one
   * says nothing about the socket being closed here.
   */
  private waitForClose = (connection: WebSocket, deadlineMs: number) =>
    new Promise<void>((resolve) => {
      let settled = false
      const driverOnClose = connection.onclose

      const settle = () => {
        if (settled) return
        settled = true
        clearTimeout(deadline as any)
        resolve()
      }

      const onTransportClose = (e: any) => {
        driverOnClose?.(e)
        settle()
      }

      const answerCloseOurselves = (reason: string) => {
        // Null rather than restore: a transport close that lands after this
        // would otherwise re-enter onClose, emit a second close and arm a
        // reopen for a socket the driver is already letting go.
        if (connection.onclose === onTransportClose) connection.onclose = null as any
        this.onClose({ code: userDisconnectCloseCode, reason, wasClean: false }, connection)
        settle()
      }

      connection.onclose = onTransportClose
      this.driverClosedConnection = connection
      const deadline = setTimeout(
        () => answerCloseOurselves('the transport did not answer the close'),
        deadlineMs
      )

      try {
        connection.close(userDisconnectCloseCode)
      } catch (err) {
        this.logger.debug(`[ddp] close: the transport refused to close: ${(err as Error).message}`)
        answerCloseOurselves('the transport refused to close')
      }
    })

  /**
   * Disconnect the DDP from server and forget every subscription locally: the
   * close ends them on the server, so no `unsub` is sent. See ADR-0003.
   */
  close = async (): Promise<void> => {
    this.cancelAnyReopen()

    let connection = this.connection

    while (connection) {
      await this.letGoOfConnection(connection)

      if (!this.replaced(connection)) break
      if (this.supersededByWatchedConnection(this.connection)) return
      connection = this.connection
    }

    this.cancelLivenessChain()
    this.lastPing = 0
    delete this.connection
    this.forgetAllSubscriptions()
  }

  private letGoOfConnection = async (connection: WebSocket) => {
    if (connection.readyState !== socketClosed) {
      await this.waitForClose(connection, socketDeadlineMs)
    }

    delete this.driverClosedConnection
    this.cancelAnyReopen()
    this.detach(connection)
  }

  private supersededByWatchedConnection = (connection?: WebSocket) =>
    connection !== undefined &&
    (this.livenessChainArmed() || this.awaitedByOpen(connection))

  private awaitedByOpen = (connection: WebSocket) =>
    this.openAwaitedConnections.has(connection)

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
      this.cancelScheduledReopen()
      this.open().catch((err) => {
        this.logger.error(`[ddp] Reopen error: ${(err as Error).message}`)
        this.reopenUnlessAbandoned(err)
      })
    }
  }

  private reopenUnlessAbandoned = (err: unknown) => {
    if (!(err instanceof AbandonedWait)) this.reopen()
  }

  private cancelAnyReopen = () => {
    this.settleReopen?.()
    this.cancelScheduledReopen()
  }

  private cancelScheduledReopen = () => {
    if (!this.openTimeout) return
    clearTimeout(this.openTimeout as any)
    delete this.openTimeout
  }

  /** Clear connection and try to connect again. */
  reopen = () => {
    if (this.openTimeout) return
    this.openTimeout = setTimeout(this.fireScheduledReopen, this.config.reopen)
  }

  private fireScheduledReopen = () => {
    delete this.openTimeout
    this.reopenNow()
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
      this.cancelScheduledReopen()
      this.cancelScheduledPing()
      this.lastPing = 0
      try {
        this.emit('disconnected')
      } catch (err) {
        this.logger.error(`[ddp] Disconnected listener error: ${(err as Error).message}`)
      }

      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        this.off('open', cleanup)
        if (timeout) clearTimeout(timeout as any)
        delete this.reopenPromise
        delete this.settleReopen
        this.rearmLivenessChain()
        resolve()
      }

      this.settleReopen = cleanup
      this.once('open', cleanup)

      this.createConnection().catch(() => {})

      const timeout = setTimeout(cleanup, this.config.timeout)
    })

    return this.reopenPromise
  }

  /**
   * Bounded liveness check for a socket in the gray zone. Returns true only if
   * the socket is open and the server answers the ping within the deadline.
   */
  probe = (deadlineMs = socketDeadlineMs): Promise<boolean> => {
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
      }, deadlineMs)

      try {
        connection.send(JSON.stringify({ msg: 'ping' }))
      } catch {
        cleanup()
        resolve(false)
      }
    })
  }

  private livenessChainArmed = () =>
    !!this.pingTimeout ||
    (this.pingInFlightConnection !== undefined && this.pingInFlightConnection === this.connection)

  private rearmLivenessChain = () => {
    if (!this.livenessChainArmed()) this.reopen()
  }

  private cancelLivenessChain = () => {
    delete this.pingInFlightConnection
    this.cancelScheduledPing()
  }

  private cancelScheduledPing = () => {
    if (!this.pingTimeout) return
    clearTimeout(this.pingTimeout as any)
    delete this.pingTimeout
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
  private waitForOpen = (deadlineMs = this.config.reopen * 2): Promise<void> => {
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
      }, deadlineMs)
    })
  }

  /**
   * Send an object to the server via Socket. Adds handler to collection to
   * allow awaiting response matching an expected object. Most responses are
   * identified by their message event name and the ID they were sent with, but
   * some responses don't return the ID fallback to just matching on event name.
   * Data often includes an error attribute if something went wrong, but certain
   * types of calls send back a different `msg` value instead, e.g. `nosub`.
   * @param obj        Object to be sent
   * @param deadlineMs How long to wait for the DDP response before rejecting
   */
  send = async (obj: any, deadlineMs = this.config.timeout): Promise<any> => {
    // Outside the promise executor: a `throw` from an async executor is dropped
    // on the floor as an unhandled rejection instead of rejecting the send.
    if (!this.connection) throw new Error('[ddp] sending without open connection')
    // A message belongs to the connection that was current when it was sent. It
    // is never written to a successor: the DDP session, and any Login on it, is
    // the old connection's.
    const connection = this.connection
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

      let deadlineTimer: NodeJS.Timer | number | undefined

      const removeListeners = () => {
        clearTimeout(deadlineTimer as any)
        this.off(listener, onResponse)
        abandonListeners.forEach(({ event, onAbandon }) => this.off(event, onAbandon))
      }

      deadlineTimer = setTimeout(() => {
        removeListeners()
        reject(new ExpiredWait(id))
      }, deadlineMs)

      const onResponse = (result: any) => {
        removeListeners()
        return (result.error ? reject(toError(result.error)) : resolve({ ...(/connect|ping|pong/.test(obj.msg) ? {} : { id }) , ...result }))
      }

      abandonListeners.forEach(({ event, onAbandon }) => this.once(event, onAbandon))
      this.once(listener, onResponse)
    })
  }

  private armLivenessChain = (pingedConnection = this.connection) => {
    if (pingedConnection !== this.connection) return
    if (this.transportOpen) {
      this.cancelScheduledReopen()
    }
    this.scheduleNextPing()
  }

  private scheduleNextPing = () => {
    this.cancelLivenessChain()
    this.pingTimeout = setTimeout(() => {
      delete this.pingTimeout
      const pingedConnection = this.connection
      this.pingInFlightConnection = pingedConnection

      this.send({ msg: 'ping' }, this.config.ping)
        .then(() => this.armLivenessChain(pingedConnection))
        .catch(this.reopenUnlessAbandoned)
        .finally(() => {
          if (this.pingInFlightConnection === pingedConnection) {
            delete this.pingInFlightConnection
          }
        })
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
   * The wait is bounded by the request before it, which each send bounds in
   * turn with its own deadline, so a chain always drains.
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
   * out on a connection that is still installed. A refused `sub`, one that never
   * reached the wire, and one whose connection is gone leave nothing behind, and
   * a resubscribe under an existing id that the server refuses forgets that
   * entry. See ADR-0004 and ADR-0006.
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
        if (err instanceof AbandonedRequest || err instanceof ExpiredWait) {
          this.rememberSubscription(err.id, name, params, callback)
        } else if (id && err instanceof DDPError) {
          this.forgetSubscription(id)
        }
        return undefined
      })
  }

  /**
   * Write the entry that instructs `subscribeAll` to establish this stream.
   * A stream only belongs to an installed connection, so with none there is
   * nothing for a later login to re-establish. A close forgets these entries
   * locally and sends no `unsub`: closing the connection ends the streams on
   * the server.
   */
  private rememberSubscription = (
    id: string,
    name: string,
    params: any[],
    callback?: ISocketMessageCallback
  ) => {
    if (!this.connection) return
    const unsubscribe = this.unsubscribe.bind(this, id)
    const onEvent = this.onEvent.bind(this, name)
    const subscription = { id, name, params, unsubscribe, onEvent }
    if (callback) subscription.onEvent(callback)
    this.subscriptions[id] = subscription
    return subscription
  }

  /**
   * The DDP subscriptions on this Socket for one stream name, matched on the
   * params given. `subscriptions` is keyed by DDP subscription id, so a caller
   * that knows a stream by name and params reads it through here.
   */
  findSubscriptions = ({ name, params = [] }: IStream): ISubscription[] =>
    Object.keys(this.subscriptions || {})
      .map((id) => this.subscriptions[id])
      .filter((sub) => (
        sub &&
        sub.name === name &&
        params.every((param, index) => sub.params?.[index] === param)
      ))

  /**
   * Re-send the given streams on the current connection under the ids they were
   * first sent with, and resolve on whether the server acked every one of them.
   *
   * Nothing goes out until every stream asked for is recorded here, so the
   * deadline expiring first resolves false.
   */
  resubscribeWhenRecorded = (
    streams: IStream[],
    timeoutMs = this.config.timeout
  ): Promise<boolean> => {
    const recordedPerStream = () => streams.map((stream) => this.findSubscriptions(stream))
    const resubscribe = (subs: ISubscription[]) => Promise.all(
      subs.map((sub) => this.subscribe(sub.name, sub.params, undefined, sub.id))
    )
      .then((results) => {
        const unacknowledged = subs.filter((_, index) => !results[index])
        unacknowledged.forEach((sub) => this.logger.error(
          `[ddp] Subscribe not acknowledged: ${sub.params?.[0]}`
        ))
        return unacknowledged.length === 0
      })
      .catch(() => false)

    return new Promise<boolean>((resolve) => {
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
        const perStream = recordedPerStream()
        if (!perStream.every((subs) => subs.length > 0)) return
        inFlight = true
        const recorded = perStream.reduce((all, subs) => all.concat(subs), [] as ISubscription[])
        resubscribe(recorded).then((value) => {
          inFlight = false
          finish(value)
        })
      }
      const deadline = setTimeout(() => finish(false), timeoutMs)
      const poll = setInterval(attempt, 100)
      attempt()
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
