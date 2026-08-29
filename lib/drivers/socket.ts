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
  IRealtimeCredentials,
  ILoginResult,
  ICredentialsPass,
  isLoginPass,
  isLoginOAuth,
  ICredentialsAuthenticated,
  isLoginAuthenticated,
  isLoginResult,
  ISocketMessageCallback,
	ILogger
} from '../../interfaces'

import { IStream, RecordedDDPSubscription } from './definitions'
import { AbandonedWait, DDPRequests } from './ddpRequests'
import { DDPSubscriptions } from './ddpSubscriptions'
import { sha256 } from 'js-sha256'

function hostToWS (host: string, ssl = false) {
  host = host.replace(/^(https?:\/\/)?/, '')
  return `ws${ssl ? 's' : ''}://${host}`
}

const userDisconnectCloseCode = 4000;
const socketOpen = 1;
const socketClosed = 3;

const socketDeadlineMs = 2000;

export class Socket extends SDKEventEmitter {
  sent = 0
  host: string
  lastPing = Date.now()
  config: ISocketConfig
  openTimeout?: NodeJS.Timer | number
  pingTimeout?: NodeJS.Timer | number
  connection?: WebSocket
  session?: string
  logger: ILogger
  reopenPromise?: Promise<void>
  private loginConfirmed = false
  private settleReopen?: () => void
  private pendingOpenRejects = new WeakMap<WebSocket, (err: Error) => void>()
  private requests: DDPRequests
  private readonly ddpSubscriptions: DDPSubscriptions

  get subscriptions (): { [id: string]: RecordedDDPSubscription } {
    return this.ddpSubscriptions.records
  }

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
    this.requests = new DDPRequests({
      emitter: this,
      getLogger: () => this.logger,
      nextId: (id) => {
        const nextId = id || `ddp-${this.sent}`
        this.sent += 1
        return nextId
      },
      deadlineMs: this.config.timeout
    })
    this.ddpSubscriptions = new DDPSubscriptions({
      getLogger: () => this.logger,
      send: (message) => this.send(message),
      onEvent: (name, listener) => this.onEvent(name, listener),
      hasConnection: () => !!this.connection,
      deadlineMs: this.config.timeout
    })

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
        this.pendingOpenRejects.set(connection, reject)
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
      this.loginConfirmed = false
      this.connection.onmessage = this.onMessage.bind(this)
      this.connection.onclose = (ev: any) => this.onClose(ev, connection) // pass closing socket so onClose can compare identity
      this.connection.onopen = this.onOpen.bind(this, resolve, reject)
      this.emit('connecting')
    })
  }

  /**
   * Open websocket connection.
   * Stores connection, setting up handlers for open/close/message events.
   */
  open = async (): Promise<any> => {
    if (this.connected) {
      return undefined
    }

    if (this.reopenPromise) {
      await this.reopenPromise
      if (!this.connected) {
        await this.createConnection()
      }
      return this.connection
    }

    await this.createConnection()
    return this.connection
  }

  /** Not awaited: a websocket callback has nowhere to put a throw. */
  private resumeLoginInBackground = () => {
    if (!this.resume) return
    this.login(this.resume).catch((err) =>
      this.logger.error(`[ddp] Resume did not complete: ${(err as Error).message}`)
    )
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
    resolve(this.connection)
    this.resumeLoginInBackground()
  }

  onClose = (e: any, closedConnection?: WebSocket) => {
    // A detached socket's late close would clobber the live connection.
    if (closedConnection && closedConnection !== this.connection) {
      return
    }
    this.loginConfirmed = false
    this.emit('close', e)
    try {
      if (e?.code !== userDisconnectCloseCode) {
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

  /**
   * Closing the socket is a separate obligation, left to the caller.
   *
   * An open of this socket that is still pending is abandoned on a microtask,
   * so a handshake rejection already in flight settles it first.
   */
  private detach = (connection: WebSocket) => {
    const rejectPendingOpen = this.pendingOpenRejects.get(connection)
    this.pendingOpenRejects.delete(connection)
    Promise.resolve().then(() => rejectPendingOpen?.(AbandonedWait.connectionClosedBeforeOpen()))
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
   * Close the Transport and forget every DDP subscription locally.
   * See ADR-0009.
   */
  close = async (): Promise<void> => {
    this.settleReopen?.()

    const connection = this.connection

    if (connection && connection.readyState !== socketClosed) {
      await this.waitForClose(connection, socketDeadlineMs)
    }

    if (this.replaced(connection)) return

    this.cancelScheduledReopen()
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout as any)
      delete this.pingTimeout
    }
    this.lastPing = 0

    if (connection) {
      this.detach(connection)
      delete this.connection
    }

    this.ddpSubscriptions.forgetAllSubscriptions()
  }

  // Call open directly, so it skips openTimeout
  checkAndReopen = () => {
    if (!this.connected) {
      this.cancelScheduledReopen()
      this.open().catch((err) => this.logger.error(`[ddp] Reopen error: ${(err as Error).message}`))
    }
  }

  private reopenUnlessAbandoned = (err: unknown) => {
    if (!(err instanceof AbandonedWait)) this.reopen()
  }

  private cancelScheduledReopen = () => {
    if (!this.openTimeout) return
    clearTimeout(this.openTimeout as any)
    delete this.openTimeout
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
      this.cancelScheduledReopen()
      this.lastPing = 0
      this.emit('disconnected')

      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        this.off('open', cleanup)
        if (timeout) clearTimeout(timeout as any)
        delete this.reopenPromise
        delete this.settleReopen
        resolve()
      }

      this.settleReopen = cleanup
      this.once('open', cleanup)

      this.createConnection().catch(() => {})

      const timeout = setTimeout(() => {
        cleanup()
        this.reopen()
      }, this.config.timeout)
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

  get transportOpen () {
    return !!(this.connection && this.connection.readyState === socketOpen)
  }

  get connected () {
    return this.transportOpen && this.alive()
  }

  get loggedIn () {
    return (this.connected && this.loginConfirmed)
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
      if (this.connection !== connection) throw AbandonedWait.connectionReplacedBeforeWrite()
      // The wait resolves a microtask before the listeners below are attached, so
      // a connection lost in that window would be missed by all three of them.
      // `readyState` rather than `connected`: in that window the events have not
      // been delivered, so only the transport knows whether the connection went away.
      if (connection.readyState !== socketOpen) throw AbandonedWait.responseClosed()
    }

    return this.requests.send(obj, connection.send.bind(connection), deadlineMs)
  }

  private reopenAndKeepPinging = (err: unknown) => {
    this.reopenUnlessAbandoned(err)
    if (this.connection) this.ping()
  }

  /** Send ping, record time, re-open if nothing comes back, repeat */
  ping = async () => {
    if (this.pingTimeout) clearTimeout(this.pingTimeout as any)
    this.pingTimeout = setTimeout(() => {
      this.send({ msg: 'ping' }, this.config.ping)
        .then(() => this.ping())
        .catch(this.reopenAndKeepPinging)
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
  login = async (credentials: IRealtimeCredentials) => {
    const params = this.loginParams(credentials)
    this.resume = (await this.call('login', params) as ILoginResult)
    this.loginConfirmed = true
    this.subscribeAll().catch((err) => {
      this.logger.error(`[ddp] Resubscribe after login failed: ${err.message}`)
      this.emit('resubscribe-error', err)
    })
    this.emit('login', this.resume)
    return this.resume
  }

  /** Take variety of login credentials object types for accepted params */
  loginParams = (credentials: IRealtimeCredentials) => {
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
    this.loginConfirmed = false
    return this.unsubscribeAll()
			.then(() => this.call('logout'))
  }

  /** Register a callback to trigger on message events in subscription */
  onEvent = (id: string, callback: ISocketMessageCallback) => {
    this.on(id, callback)
  }

  subscribe = (name: string, params: any[], callback ?: ISocketMessageCallback) =>
    this.ddpSubscriptions.subscribe(name, params, callback)

  findSubscriptions = (stream: IStream): RecordedDDPSubscription[] =>
    this.ddpSubscriptions.findSubscriptions(stream)

  resubscribeWhenRecorded = (streams: IStream[], timeoutMs?: number): Promise<boolean> =>
    this.ddpSubscriptions.resubscribeWhenRecorded(streams, timeoutMs)

  subscribeAll = () => this.ddpSubscriptions.subscribeAll()

  unsubscribe = (id: any) => this.ddpSubscriptions.unsubscribe(id)

  unsubscribeAll = () => this.ddpSubscriptions.unsubscribeAll()
}
