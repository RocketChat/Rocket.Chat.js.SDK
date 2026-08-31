/// <reference path="../../types/websocket.d.ts" />
/**
 * @module Socket
 * The DDP layer inside a Driver: it owns the Transport, performs the DDP
 * handshake, runs the Liveness chain and holds the DDP subscriptions. Which
 * Connection work it is allowed to do belongs to the Connection it composes.
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
import {
  abandonedWaitMessages,
  AbandonedWait,
  DDPRequests,
  FailedConnectionAttempt
} from './ddpRequests'
import {
  closeTransportIntentionally,
  Connection,
  ConnectionAttempt,
  intentionalCloseCode,
  Transport,
  transportClosedState,
  transportOpenState
} from './connection'
import { DDPSubscriptions } from './ddpSubscriptions'
import { sha256 } from 'js-sha256'

function hostToWS (host: string, ssl = false) {
  host = host.replace(/^(https?:\/\/)?/, '')
  return `ws${ssl ? 's' : ''}://${host}`
}

const socketDeadlineMs = 2000;

const endedByOwnershipChange = (error: Error) => error instanceof AbandonedWait;

interface Latch<T> {
  settle: (value: T) => void
  refuse: (error: Error) => void
  whenSettled: (cleanup: () => void) => void
}

/**
 * One wait that ends exactly once, either from its wiring or on its deadline.
 * `wire` attaches the listeners the wait ends on and registers what to undo.
 */
const latchedByDeadline = <T>(
  deadlineMs: number,
  onDeadline: (latch: Latch<T>) => void,
  wire: (latch: Latch<T>) => void
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let settled = false
    let cleanup = () => {}

    const finish = (announce: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(deadline as any)
      cleanup()
      announce()
    }

    const latch: Latch<T> = {
      settle: (value) => finish(() => resolve(value)),
      refuse: (error) => finish(() => reject(error)),
      whenSettled: (undo) => { cleanup = undo }
    }

    const deadline = setTimeout(() => onDeadline(latch), deadlineMs)
    wire(latch)
  })

export class Socket extends SDKEventEmitter {
  sent = 0
  host: string
  lastPing = Date.now()
  config: ISocketConfig
  pingTimeout?: NodeJS.Timer | number
  session?: string
  logger: ILogger
  private requests: DDPRequests
  private readonly ddpSubscriptions: DDPSubscriptions
  private readonly connectionWork: Connection
  private readonly waitsForOpen = new Set<(error: Error) => void>()

  get connection (): Transport | undefined {
    return this.connectionWork.attachedTransport
  }

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
      }
    })
    this.ddpSubscriptions = new DDPSubscriptions({
      getLogger: () => this.logger,
      send: (message) => this.send(message),
      onEvent: (name, listener) => this.onEvent(name, listener),
      closesTaken: () => this.connectionWork.closesTaken,
      deadlineMs: this.config.timeout
    })
    this.connectionWork = new Connection({
      getLogger: () => this.logger,
      reopenDelayMs: this.config.reopen,
      deadlineMs: this.config.timeout,
      hasUsableTransport: () => this.connected,
      constructTransport: (attempt) => this.constructTransport(attempt),
      awaitTransportClose: (transport) => this.letTransportClose(transport),
      abandonWrittenWaits: (message) => this.requests.abandonAll(message),
      refuseEveryWait: () => this.refuseEveryWait(),
      forgetConnection: () => this.forgetConnection(),
      emit: (event, ...args) => this.emit(event, ...args)
    })

    this.host = `${hostToWS(this.config.host, this.config.useSsl)}/websocket`

    this.on('ping', () => {
      this.lastPing = Date.now()
      this.send({ msg: 'pong' }).then(this.logger.debug, this.logger.error)
    })

    this.on('result', (data: any) => this.emit(data.id, { id: data.id, result: data.result, error: data.error }))
    this.on('ready', (data: any) => this.emit(data.subs[0], data))
  }

  private constructTransport = (attempt: ConnectionAttempt): Transport => {
    let transport: Transport
    try {
      transport = new WebSocket(this.host, null, { headers: settings.customHeaders })
    } catch (err) {
      this.logger.error(err)
      throw err
    }

    transport.onmessage = this.onMessage.bind(this)
    transport.onerror = () =>
      this.connectionWork.fail(attempt, FailedConnectionAttempt.transportFailed())
    transport.onclose = (ev: any) => this.onClose(ev, transport)
    transport.onopen = () => this.handshake(attempt, transport)
    return transport
  }

  private handshake = async (attempt: ConnectionAttempt, transport: Transport) => {
    this.lastPing = Date.now()

    let connected
    try {
      connected = await this.send({
        msg: 'connect',
        version: '1',
        support: ['1', 'pre2', 'pre1']
      })
    } catch (err) {
      this.logger.error(`[ddp] the handshake did not complete: ${(err as Error).message}`)
      return this.connectionWork.fail(attempt, err)
    }

    if (!this.connectionWork.isCurrent(attempt) || this.connection !== transport) return

    this.session = connected.session
    this.ping().catch((err) => this.logger.error(`[ddp] Unable to ping server: ${err.message}`))
    this.connectionWork.succeed(attempt)
  }

  private onClose = (e: any, closedTransport: Transport) => {
    this.logger.info(`[ddp] Close (${e?.code})${e?.reason ? `: ${e.reason}` : ''}`)
    this.connectionWork.transportLost(closedTransport, e, e?.code !== intentionalCloseCode)
  }

  /**
   * Dispatch incoming message data as events. A frame is emitted once under each
   * of `collection`, `msg` and `id` that it carries, so a subscriber can listen
   * on whichever of the three it knows. Any frame at all also counts as a sign of
   * life and moves `lastPing`.
   */
  private parseFrame = (raw: any) => {
    let frame
    try {
      frame = JSON.parse(raw)
    } catch (err) {
      this.logger.error(`[ddp] JSON parse error on frame: ${raw} — ${(err as Error).message}`)
      return undefined
    }
    if (!frame) {
      this.logger.debug(`[ddp] empty frame dropped: ${raw}`)
      return undefined
    }
    return frame
  }

  onMessage = (e: any) => {
    if (!e.data) return

    const data = this.parseFrame(e.data)
    if (!data) return

    this.lastPing = Date.now()

    this.logger.debug(`[ddp] messages received: ${e.data}`)
    if (data.collection) this.emit(data.collection, data)
    if (data.msg) this.emit(data.msg, data)
    if (data.id) this.emit(data.id, data)
  }

  /** End every wait a Close ends: those for an open, and those for a response. */
  private refuseEveryWait = () => {
    const refused = [...this.waitsForOpen]
    this.waitsForOpen.clear()
    refused.forEach((reject) => reject(AbandonedWait.responseClosed()))
    this.requests.abandonAll(abandonedWaitMessages.responseClosed)
  }

  private forgetConnection = () => {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout as any)
      delete this.pingTimeout
    }
    this.lastPing = 0
    delete this.session
    this.ddpSubscriptions.forgetAllSubscriptions()
  }

  private letTransportClose = async (transport: Transport) => {
    if (transport.readyState === transportClosedState) return
    await this.waitForClose(transport, socketDeadlineMs)
  }

  /**
   * The wait ends on this Transport's `onclose` rather than on the Socket's
   * `close` event: a close emitted for the connection that replaced this one
   * says nothing about the Transport being closed here.
   */
  private waitForClose = (transport: Transport, deadlineMs: number) => {
    const socketOnClose = transport.onclose
    let onTransportClose: (e: any) => void

    const answerCloseOurselves = (latch: Latch<void>, reason: string) => {
      // Null rather than restore: a transport close that lands after this
      // would otherwise re-enter onClose and emit a second close for a
      // connection the Socket is already letting go.
      if (transport.onclose === onTransportClose) transport.onclose = null as any
      this.onClose({ code: intentionalCloseCode, reason, wasClean: false }, transport)
      latch.settle()
    }

    return latchedByDeadline<void>(
      deadlineMs,
      (latch) => answerCloseOurselves(latch, 'the transport did not answer the close'),
      (latch) => {
        onTransportClose = (e: any) => {
          socketOnClose?.(e)
          latch.settle()
        }
        transport.onclose = onTransportClose

        if (!closeTransportIntentionally(transport, this.logger)) {
          answerCloseOurselves(latch, 'the transport refused to close')
        }
      }
    )
  }

  open = (): Promise<void> => this.connectionWork.open()

  reopen = () => this.connectionWork.reopen()

  reopenNow = (): Promise<void> => this.connectionWork.reopenNow()

  close = (): Promise<void> => this.connectionWork.close()

  /**
   * Bounded liveness check for a socket in the gray zone. Returns true only if
   * the socket is open and the server answers the ping within the deadline.
   */
  probe = (deadlineMs = socketDeadlineMs): Promise<boolean> => {
    const transport = this.connection
    if (!this.transportOpen || !transport || this.connectionWork.closing) {
      return Promise.resolve(false)
    }

    return latchedByDeadline<boolean>(
      deadlineMs,
      (latch) => latch.settle(false),
      (latch) => {
        const onPong = () => latch.settle(true)
        latch.whenSettled(() => this.off('pong', onPong))
        this.once('pong', onPong)

        try {
          transport.send(JSON.stringify({ msg: 'ping' }))
        } catch {
          latch.settle(false)
        }
      }
    )
  }

  get transportOpen () {
    return !!(this.connection && this.connection.readyState === transportOpenState)
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
   * than hanging for the life of the process. Close ownership refuses the wait
   * outright, because nothing will open while a close holds the Socket.
   *
   * The default is twice `config.reopen`, not `config.reopen`: a Reopen only
   * *schedules* the retry at that interval, so a deadline of exactly `reopen`
   * expires as the reconnect begins, before the attempt it waits on can open.
   */
  private waitForOpen = (deadlineMs = this.config.reopen * 2): Promise<void> =>
    latchedByDeadline<void>(
      deadlineMs,
      (latch) => latch.refuse(new Error('[ddp] timed out waiting for the connection to open')),
      (latch) => {
        const onOpen = () => latch.settle()
        const refuse = (error: Error) => latch.refuse(error)

        latch.whenSettled(() => {
          this.off('open', onOpen)
          this.waitsForOpen.delete(refuse)
        })

        this.once('open', onOpen)
        this.waitsForOpen.add(refuse)
      }
    )

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
    if (this.connectionWork.closing) throw AbandonedWait.responseClosed()
    // A message belongs to the connection that was current when it was sent. It
    // is never written to a successor: the DDP session, and any Login on it, is
    // the old connection's.
    const connection = this.connection
    if (!this.transportOpen) {
      await this.waitForOpen()
      if (this.connection !== connection) throw AbandonedWait.connectionReplacedBeforeWrite()
      if (this.connectionWork.closing) throw AbandonedWait.responseClosed()
      // The wait resolves a microtask before the listeners below are attached, so
      // a connection lost in that window would be missed by all three of them.
      // `readyState` rather than `connected`: in that window the events have not
      // been delivered, so only the transport knows whether the connection went away.
      if (connection.readyState !== transportOpenState) throw AbandonedWait.responseClosed()
    }

    return this.requests.send(obj, connection.send.bind(connection), deadlineMs)
  }

  private recoverAndKeepPinging = (error: Error) => {
    if (endedByOwnershipChange(error)) return
    this.reopen()
    if (this.connection) this.ping()
  }

  /** Send ping, record time, re-open if nothing comes back, repeat */
  ping = async () => {
    if (this.pingTimeout) clearTimeout(this.pingTimeout as any)
    this.pingTimeout = setTimeout(() => {
      this.send({ msg: 'ping' }, this.config.ping)
        .then(() => this.ping())
        .catch(this.recoverAndKeepPinging)
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

  /**
   * Logout the current User from the server via Socket.
   *
   * A Logout needs a connection to write on. Without one it is a no-op, unless a
   * Close is what took the connection away, which the caller hears about rather
   * than reading a silent success.
   */
  logout = () => {
    if (this.connectionWork.closing) return Promise.reject(AbandonedWait.responseClosed())
    if (!this.connection) {
      return this.connectionWork.closesTaken
        ? Promise.reject(AbandonedWait.responseClosed())
        : Promise.resolve(undefined)
    }
    this.resume = null
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
