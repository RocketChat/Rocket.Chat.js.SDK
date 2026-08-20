/**
 * @module Driver
 * The realtime layer behind a Client, speaking DDP over the Socket it owns.
 */

import { SDKEventEmitter } from '../emitter'
import { logger as Logger } from '../log'
import { Socket } from './socket'
import type { ISocket, IDriver, IStream } from './definitions'

import {
  ISocketOptions,
  ISubscription,
  IRealtimeCredentials,
  ILoginResult,
  ICallback,
  ILogger
} from '../../interfaces'

export class Driver extends SDKEventEmitter implements ISocket, IDriver {
  logger: ILogger
  config: ISocketOptions
  private readonly socket: Socket

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
    this.socket = new Socket({ ...options, logger })
    this.socket.on('open', () => this.emit('connected'))
    this.config = { ...options, timeout: this.socket.config.timeout }
    this.logger = logger
  }

	/**
	 * Resolves with the Driver once its Socket is open.
	 * @example <caption>Using promise</caption>
	 *  import { driver } from '@rocket.chat/sdk'
	 *  driver.connect()
	 *    .then(() => console.log('connected'))
	 *    .catch((err) => console.error(err))
	 */
  connect = async (): Promise<IDriver> => {
    if (this.connected) {
      return this
    }
    this.logger.info('[driver] Connecting', this.config)
    try {
      await this.socket.open()
    } catch (err) {
      this.logger.error(`[driver] Failed to connect: ${(err as Error).message}`)
      throw err
    }
    this.logger.info('[driver] Connected')
    return this
  }

  get connected (): boolean {
    return !!this.socket.connected
  }

  disconnect = (): Promise<any> => {
    return this.socket.close()
  }

  checkAndReopen = (): void => {
    return this.socket.checkAndReopen()
  }

  reopenNow = (): Promise<void> => {
    return this.socket.reopenNow()
  }

  probe = (deadlineMs?: number): Promise<boolean> => {
    return this.socket.probe(deadlineMs)
  }

  get lastPing (): number {
    return this.socket.lastPing
  }

  get pingInterval (): number {
    return this.socket.config.ping
  }

  subscribe = (topic: string, eventname: string, ...args: any[]): Promise<ISubscription | undefined> => {
    this.logger.info(`[DDP driver] Subscribing to ${topic} | ${JSON.stringify(args)}`)
    return this.socket.subscribe(topic, [eventname, { 'useCollection': false, 'args': args }])
  }

  subscribeRaw = (name: string, params: any[]): Promise<ISubscription | undefined> => {
    this.logger.info(`[DDP driver] Raw Subscribing to ${JSON.stringify([name, params])}`)
    return this.socket.subscribe(name, params)
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
   * Socket and resolve when the server acks them with `ready`. This gives the app
   * an observable readiness signal after a forced reconnect.
   *
   * The Socket owns both the waiting and the re-sending: it always sends, where
   * this Driver's own `subscribe` wraps the params and so asks for a different
   * stream entirely.
   */
  waitForNotifyUserMediaSubs = (timeoutMs = this.socket.config.timeout): Promise<boolean> => {
    if (!this.userId) {
      return Promise.resolve(false)
    }
    const topic = 'stream-notify-user'
    const userId = this.userId
    return this.resubscribeWhenRecorded(
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
  login = async (credentials: IRealtimeCredentials, _args: any): Promise<any> => {
    if (!this.socket || !this.socket.connected) {
      await this.connect()
    }
    this.logger.info(`[DDP driver] Login with ${JSON.stringify(credentials)}`)
    const login: ILoginResult = await this.socket.login(credentials)
    this.userId = login.id
    return login
  }
  logout = async () => {
    if (this.socket && this.socket.connected) {
      await this.socket.logout()
    }

  }

  unsubscribe = (subscription: ISubscription) => {
    return this.socket.unsubscribe(subscription.id)
  }

  resubscribeWhenRecorded = (streams: IStream[], timeoutMs?: number): Promise<boolean> => {
    return this.socket.resubscribeWhenRecorded(streams, timeoutMs)
  }

  unsubscribeAll = (): Promise<void> => {
    return this.socket.unsubscribeAll()
  }

  onStreamData = (event: string, cb: ICallback): Promise<any> => {
    function listener (message: any) {
      cb((message))
    }
    return Promise.resolve(this.socket.on(event, listener))
      .then(() => ({
        stop: () => this.socket.off(event, listener)
      }))
  }

  onMessage = (cb: ICallback): void => {
    this.socket.on('stream-room-messages', ({ fields: { args: [message] } }: any) => cb(this.ejsonMessage(message)))
  }

  onTyping = (cb: ICallback): Promise<any > => {
    return this.socket.on('stream-notify-room', ({ fields: { args: [username, isTyping] } }: any) => {
      cb(username, isTyping)
    }) as any
  }

  notifyVisitorTyping = (rid: string, username: string, typing: boolean, token: string) => {
    return this.socket.call('stream-notify-room', `${ rid }/typing`, username, typing, { token })
  }

  ejsonMessage = (message: any) => {
    if (message.ts) {
      message.ts = new Date(message.ts.$date)
    }
    return message
  }

  methodCall = (method: string, ...args: any[]): Promise<any> => {
    return this.socket.call(method, ...args)
  }
}
