/**
 * @module DDPDriver
 * Handles low-level websocket ddp connections and event subscriptions
 */

import WebSocket from 'universal-websocket-client'
import { EventEmitter } from 'tiny-events'

import { logger as Logger } from '../log'
import { ISocket, IDriver } from './index'
import * as settings from '../settings';

EventEmitter.prototype.removeAllListeners = function (event?: string | any): any {
  if (event) {
    this._listeners[event] = []
  } else {
    this._listeners = {}
  }
  return [] as any
}

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

import { hostToWS } from '../util'
import { sha256 } from 'js-sha256'

/** Websocket handler class, manages connections and subscriptions by DDP */
export class Socket extends EventEmitter {
  sent = 0
  host: string
  lastPing = Date.now()
  subscriptions: { [id: string]: ISubscription } = {}
  handlers: ISocketMessageHandler[] = []
  config: ISocketOptions | any
  openTimeout?: NodeJS.Timer | number
  reopenInterval?: NodeJS.Timer | number
  pingTimeout?: NodeJS.Timer | number
  connection?: WebSocket
  session?: string
  logger: ILogger

  /** Create a websocket handler */
  constructor (
    options?: ISocketOptions | any,
    public resume: ILoginResult | null = null
  ) {
    super()
    this.logger = options.logger || Logger
    this.config = {
      host: options.host || 'http://localhost:3000',
      useSsl: options.useSsl || false,
      reopen: options.reopen || 10000,
      ping: options.timeout || 30000
    }

    this.host = `${hostToWS(this.config.host, this.config.useSsl)}/websocket`

    this.on('ping', () => {
      this.send({ msg: 'pong' }).then(this.logger.debug, this.logger.error)
    })

    this.on('result', (data: any) => this.emit(data.id, { id: data.id, result: data.result, error: data.error }))
    this.on('ready', (data: any) => this.emit(data.subs[0], data))
  }

  /**
   * Open websocket connection, with optional retry interval.
   * Stores connection, setting up handlers for open/close/message events.
   * Resumes login if given token.
   */
  open = (ms: number = this.config.reopen) => {
    return new Promise(async (resolve, reject) => {
      let connection: WebSocket

      this.reopenInterval && clearInterval(this.reopenInterval as any)
      this.reopenInterval = setInterval(() => {
        return !this.alive() && this.reopen()
      }, ms)

      try {
        connection = new WebSocket(this.host, null, { headers: settings.customHeaders })
        connection.onerror = reject
      } catch (err) {
        this.logger.error(err)
        return reject(err)
      }
      this.connection = connection
      this.connection.onmessage = this.onMessage.bind(this)
      this.connection.onclose = this.onClose.bind(this)
      this.connection.onopen = this.onOpen.bind(this, resolve)
    })
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
    if (this.resume) await this.login(this.resume)
    return callback(this.connection)
  }

  /** Emit close event so it can be used for promise resolve in close() */
  onClose = (e: any) => {
    try {
      if (e?.reason !== 'disconnect') {
        this.reopen()
      }
      this.logger.info(`[ddp] Close (${e?.code}) ${e?.reason}`)
    } catch (error) {
      this.logger.error(error)
    }
    this.emit('close', e)
  }

  /**
   * Find and call matching handlers for incoming message data.
   * Handlers match on collection, id and/or msg attribute in that order.
   * Any matched handlers are removed once called.
   * All collection events are emitted with their `msg` as the event name.
   */
  onMessage = (e: any) => {
    this.lastPing = Date.now()
    void this.ping()
    const data = (e.data) ? JSON.parse(e.data) : undefined
  
    this.logger.debug(data) // 👈  very useful for debugging missing responses
    if (!data) return this.logger.error(`[ddp] JSON parse error: ${e.message}`)
    this.logger.debug(`[ddp] messages received: ${e.data}`)
    if (data.collection) this.emit(data.collection, data)
    if (data.msg) this.emit(data.msg, data)
    if (data.id) this.emit(data.id, data)
  }

  /** Disconnect the DDP from server and clear all subscriptions. */
  close = async () => {
    this.unsubscribeAll().catch(e => this.logger.debug(e))

    this.reopenInterval && clearInterval(this.reopenInterval as any)
    this.openTimeout && clearTimeout(this.openTimeout as any)
    this.pingTimeout && clearTimeout(this.pingTimeout as any)

    if (this.connected) {
      await new Promise((resolve) => {
        if (this.connection) {
          this.once('close', resolve)
          this.connection.close(1000, 'disconnect')
        }
      })
      .catch(this.logger.error)
    }

    return Promise.resolve()
  }

  /** Clear connection and try to connect again. */
  reopen = async () => {
    if (this.openTimeout) return
    this.openTimeout = setTimeout(() => { delete this.openTimeout }, this.config.reopen);

    await this.open()
      .catch((err) => {
        this.logger.error(`[ddp] Reopen error: ${err.message}`);
        this.reopen();
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
    return new Promise(async(resolve, reject) => {
      if (!this.connection) throw new Error('[ddp] sending without open connection')
      if (!this.connected) await new Promise(resolve => this.on('open', resolve))

      const id = obj.id || `ddp-${ this.sent }`
      this.sent += 1
      const data = { ...obj, ...(/connect|ping|pong/.test(obj.msg) ? {} : { id }) }
      const stringdata = JSON.stringify(data)
      this.logger.debug(`[ddp] sending message: ${stringdata}`)

      if (/^sub$/.test(obj.msg)) {
        const { name, params } = obj;
        this.subscriptions[id] = { id, name, params, unsubscribe: this.unsubscribe.bind(this, id) };
      }

      try {
        this.connection.send(stringdata)
      } catch {
        this.logger.error('[ddp] send without open connection');
      }

      this.once('disconnected', reject)
      const listener = (data.msg === 'ping' && 'pong') || (data.msg === 'connect' && 'connected') || data.id
      if (!listener) {
        return resolve()
      }
      this.once(listener, (result: any) => {
        this.off('disconnect', reject)
        return (result.error ? reject(result.error) : resolve({ ...(/connect|ping|pong/.test(obj.msg) ? {} : { id }) , ...result }))
      })
    })
  }

  /** Send ping, record time, re-open if nothing comes back, repeat */
  ping = async () => {
    this.pingTimeout && clearTimeout(this.pingTimeout as any)
    this.pingTimeout = setTimeout(() => {
      this.send({ msg: 'ping' })
        .then(() => this.ping())
        .catch(() => this.reopen())
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
    await this.subscribeAll()
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
   * Subscribe to a stream on server via socket and returns a promise resolved
   * with the subscription object when the subscription is ready.
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
    if (!this.subscriptions[id]) return Promise.reject(id)
    delete this.subscriptions[id]
    return this.send({ msg: 'unsub', id })
      .then((data: any) => data.result || data.subs)
      .catch((err) => {
        if (!err.msg && err.msg !== 'nosub') {
          this.logger.error(`[ddp] Unsubscribe error: ${err.message}`)
          throw err
        }
      })
  }

  /** Unsubscribe from all active subscriptions and reset collection */
  unsubscribeAll = () => {
    const unsubAll = Object.keys(this.subscriptions).map((id) => {
      return this.subscriptions[id].unsubscribe()
    })
    return Promise.all(unsubAll)
      .then(() => this.subscriptions = {})
  }
}

export class DDPDriver extends EventEmitter implements ISocket, IDriver {
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

  constructor ({ host = 'localhost:3000', integrationId, config, logger = Logger, ...moreConfigs }: any = {}) {
    super()

    this.config = {
      ...config,
      ...moreConfigs,
      host: host.replace(/(^\w+:|^)\/\//, ''),
      timeout: 20000
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

      let cancelled = false
      const rejectionTimeout = setTimeout(() => {
        this.logger.info(`[driver] Timeout (${config.timeout})`)
        const err = new Error('Socket connection timeout')
        cancelled = true
        reject(err)
      }, config.timeout)

			// if to avoid condition where timeout happens before listener to 'connected' is added
			// and this listener is not removed (because it was added after the removal)
      if (!cancelled) {
        this.once('connected', () => {
          this.logger.info('[driver] Connected')
          if (cancelled) return this.ddp.close() // cancel if already rejected
          clearTimeout(rejectionTimeout)
          resolve(this as IDriver)
        })
      }
    })
  }

  get connected (): boolean {
    return !!this.ddp.connected
  }

  disconnect = (): Promise<any> => {
    return this.ddp.close()
  }

  subscribe = (topic: string, eventname: string, ...args: any[]): Promise<ISubscription> => {
    this.logger.info(`[DDP driver] Subscribing to ${topic} | ${JSON.stringify(args)}`)
    return this.ddp.subscribe(topic, [eventname, { 'useCollection': false, 'args': args }])
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
      'uiInteraction'
    ].map(event => this.subscribe(topic, `${this.userId}/${event}`, false)))
  }

  subscribeRoom = (rid: string, ...args: any[]): Promise<ISubscription[]> => {
    const topic = 'stream-notify-room'
    return Promise.all([
      this.subscribe('stream-room-messages', rid, ...args),
      this.subscribe(topic, `${rid}/typing`, ...args),
      this.subscribe(topic, `${rid}/deleteMessage`, ...args)
    ])
  }

	/** Login to Rocket.Chat via DDP */
  login = async (credentials: ICredentials, args: any): Promise<any> => {
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
  unsubscribeAll = (): Promise<any> => {
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
