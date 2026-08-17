/**
 * @module Driver
 * The realtime transport behind a Client, speaking DDP over the Socket it owns.
 */

import { SDKEventEmitter } from '../emitter'
import { logger as Logger } from '../log'
import { Socket } from './socket'
import type { ISocket, IDriver } from './definitions'

import {
  ISocketOptions,
  ISubscription,
  ICredentials,
  ILoginResult,
  ICallback,
  ILogger
} from '../../interfaces'

export class Driver extends SDKEventEmitter implements ISocket, IDriver {
  logger: ILogger
  config: ISocketOptions
  ddp: Socket

	/** Save messages subscription to ensure only one created */
  messages: ISubscription | undefined

	/** Current user object populated from resolved login */
  userId: string = ''

	/** Array of joined room IDs (for reactive queries) */
  joinedIds: string[] = []

  constructor ({ host = 'localhost:3000', config, logger = Logger, ...moreConfigs }: any = {}) {
    super()

    const options = {
      ...config,
      ...moreConfigs,
      host: host.replace(/(^\w+:|^)\/\//, '')
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

  probe = (deadlineMs?: number): Promise<boolean> => {
    return this.ddp.probe(deadlineMs)
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
   * The socket owns both the waiting and the re-sending: the re-send goes out under
   * the ids the streams were first sent with, which this driver's own `subscribe`
   * would drop.
   */
  waitForNotifyUserMediaSubs = (timeoutMs = this.ddp.config.timeout): Promise<boolean> => {
    if (!this.userId) {
      return Promise.resolve(false)
    }
    const topic = 'stream-notify-user'
    const userId = this.userId
    return this.ddp.resubscribeWhenPresent(
      ['media-signal', 'media-calls'].map(name => ({ name: topic, params: [`${userId}/${name}`] })),
      timeoutMs
    )
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
