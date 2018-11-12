import { logger } from '../log'
import { IDriver } from '../drivers'
import Rocketchat from './Rocketchat'
import mem from 'mem'
import {
	ISocketOptions,
	IRespondOptions,
	ICallback,
	IMessageCallback,
	ISubscriptionEvent,
	IMessage,
	ISubscription,
	ICredentials,
	IMessageReceipt
} from '../../interfaces'
import { RID } from '../api/RocketChat'

const MY_MESSAGES = '__my_messages__'
const TOPIC_MESSAGES = 'stream-room-messages'

export default class BotClient extends Rocketchat {
  integrationId: string
  lastReadTime: Date = new Date(-8640000000000000)
  joinedIds: string[] = []
  messages: ISubscription | null = null

  constructor ({ allPublic = false, integrationId, cachedMethods = ['channelInfo','privateInfo','getRoomIdByNameOrId', 'getRoomId', 'getRoomName','getRoomNameById','getDirectMessageRoomId' ], ...config }: any) {
    super({ ...config, allPublic })
    this.integrationId = integrationId

    cachedMethods.forEach((name: string) => {
      if ((this as any)[name]) {
        (this as any)[name] = mem((this as any)[name].bind(this), { maxAge: 60 * 60 * 1000 }).bind(this)
      }
    })
  }

  async login (credentials: ICredentials) {
    await super.login(credentials)
    return this.currentLogin && (await this.socket as IDriver).login({ token: this.currentLogin.authToken } as any, {})
  }
	/**
	 * Initialise socket instance with given options or defaults.
	 * Proxies the DDP module socket connection. Resolves with socket when open.
	 * Accepts callback following error-first-pattern.
	 * Error returned or promise rejected on timeout.
	 * @example <caption>Use with callback</caption>
	 *  import driver from '@rocket.chat/sdk/bot'
	 *  driver.connect({}, (err) => {
	 *    if (err) throw err
	 *    else console.log('connected')
	 *  })
	 * @example <caption>Using promise</caption>
	 *  import driver from '@rocket.chat/sdk/bot'
	 *  driver.connect()
	 *    .then(() => console.log('connected'))
	 *    .catch((err) => console.error(err))
	 */
  async connect (options: ISocketOptions, callback?: ICallback): Promise<any> {
    try {
      const result = await super.connect(options)
      if (callback) {
        callback(null, (await this.socket))
      }
      return result

    } catch (error) {
      if (callback) {
        callback(error, this)
      }
      return Promise.reject(error)
    }
  }
  async unsubscribeAll () {
    delete this.messages
    return super.unsubscribeAll()
  }
/** Begin subscription to user's "global" message stream. Will only allow one. */
  async subscribeToMessages () {
    if (!this.messages) {
      this.messages = await this.subscribe(TOPIC_MESSAGES, MY_MESSAGES)
    }
    return this.messages
  }
/**
 * Add callback for changes in the message stream, subscribing if not already.
 * This can be called directly for custom extensions, but for most usage (e.g.
 * for bots) the respondToMessages is more useful to only receive messages
 * matching configuration.
 *
 * @param callback Function called with every change in subscriptions.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed message
 *  - Third argument is additional attributes, such as `roomType`
 */
  async reactToMessages (callback: IMessageCallback, debug?: string) {
    const handler = (e: ISubscriptionEvent) => {

      try {
        const message: IMessage = e.fields.args[0]

        if (!message || !message._id) {
          callback(new Error('Message handler fired on event without message or meta data'))
        } else {

          callback(null, message, {} as any)
        }
      } catch (err) {
        this.logger.error(`[driver] Message handler err: ${err.message}`)
        callback(err)
      }
    }
    this.messages = await this.subscribeToMessages()
    this.messages.onEvent(handler)
    // this.logger.info(`[driver] Added event handler for ${this.messages.name} subscription`)
  }
/**
 * Applies `reactToMessages` with some filtering of messages based on config.
 * If no rooms are joined at this point, it will attempt to join now based on
 * environment config, otherwise it might not receive any messages. It doesn't
 * matter that this happens asynchronously because joined rooms can change after
 * the subscription is set up.
 *
 * @param callback Function called after filters run on subscription events.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed item
 *  - Third argument is additional attributes, such as `roomType`
 * @param options Sets filters for different event/message types.
 */
  async respondToMessages (callback: IMessageCallback, options: IRespondOptions = {}) {
    const config = { ...this.config, ...options }

		// Join configured rooms if they haven't been already, unless listening to all
		// public rooms, in which case it doesn't matter
    if (!config.allPublic && this.joinedIds.length === 0 && config.rooms && config.rooms.length > 0) {
      try {
        await this.joinRooms(config.rooms)
      } catch (err) {
        this.logger.error(`[driver] Failed to join configured rooms (${config.rooms.join(', ')}): ${err.message}`)
      }
    }
    return this.reactToMessages(async (err, message, meta) => {
      if (err) {
        logger.error(`[driver] Unable to receive: ${err.message}`)
        return callback(err) // bubble errors back to adapter
      }
      if (typeof message === 'undefined' /*|| typeof meta === 'undefined'*/) {
        logger.error(`[driver] Message or meta undefined`)
        return callback(err)
      }

			// Ignore bot's own messages
      if (message.u && message.u._id === this.userId) return

			// Ignore DMs unless configured not to
      try {

        const room = await this.rooms.info({ rid: message.rid })

        const isDM = room.t === 'd'
        if (isDM && !config.dm) return

				// Ignore Livechat unless configured not to
        const isLC = room.t === 'l'

        if (isLC && !config.livechat) return
      } catch (error) {
        console.log(error)
      }

			// Ignore messages in un-joined public rooms unless configured not to
      // if (!config.allPublic && !isDM && !meta.roomParticipant) return

			// Set current time for comparison to incoming
      let currentReadTime = (message.ts) ? new Date(message.ts.$date) : new Date()

			// Ignore edited messages if configured to
      if (!config.edited && message.editedAt) return

			// Ignore messages in stream that aren't new

      if (currentReadTime < this.lastReadTime) return
			// At this point, message has passed checks and can be responded to
      // const username = (message.u) ? message.u.username : 'unknown'
      // this.logger.info(`[driver] Message ${message._id} from ${username}`)
      this.lastReadTime = currentReadTime

      callback(null, message, meta)
    })
  }

	/** Get ID for a room by name (or ID). */
  getRoomId (name: string): Promise < RID > {
    return this.getRoomIdByNameOrId(name)
  }

	/** Join the bot into a room by its name or ID */
  async joinRoom ({ rid }: any): Promise < RID > {
    const roomId = await this.getRoomId(rid)
    const joinedIndex = this.joinedIds.indexOf(rid)
    if (joinedIndex !== -1) {
      logger.error(`[driver] Join room failed, already joined`)
      throw new Error(`[driver] Join room failed, already joined`)
    }
    await super.joinRoom({ rid: roomId })
    this.joinedIds.push(roomId)
    return roomId
  }

	/** Exit a room the bot has joined */
  async leaveRoom (room: string): Promise < RID > {
    let roomId = await this.getRoomId(room)
    let joinedIndex = this.joinedIds.indexOf(room)
    if (joinedIndex === -1) {
      this.logger.error(`[driver] Leave room failed, bot has not joined ${room}`)
      throw new Error(`[driver] Leave room failed, bot has not joined ${room}`)
    }
    await this.leaveRoom(roomId)
    delete this.joinedIds[joinedIndex]
    return roomId
  }

	/** Join a set of rooms by array of names or IDs */
  joinRooms (rooms: string[]): Promise < RID[] > {
    return Promise.all(rooms.map((rid) => this.joinRoom({ rid })))
  }
	/**
	 * Prepare and send string/s to specified room ID.
	 * @param content Accepts message text string or array of strings.
	 * @param roomId  ID of the target room to use in send.
	 * @todo Returning one or many gets complicated with type checking not allowing
	 *       use of a property because result may be array, when you know it's not.
	 *       Solution would probably be to always return an array, even for single
	 *       send. This would be a breaking change, should hold until major version.
	 */
  sendToRoomId (content: IMessage | string | string[], roomId: string): Promise<IMessageReceipt[] | IMessageReceipt > {
    if (Array.isArray(content)) {
      return Promise.all(content.map((text) => {
        return this.sendMessage(text, roomId)
      }))
    }
    return this.sendMessage(content, roomId)
  }
	/**
	 * Prepare and send string/s to specified room name (or ID).
	 * @param content Accepts message text string or array of strings.
	 * @param room    A name (or ID) to resolve as ID to use in send.
	 */
  sendToRoom (content: IMessage | string | string[], room: string): Promise<IMessageReceipt[] | IMessageReceipt > {
    return this.getRoomId(room)
		.then((roomId) => this.sendToRoomId(content, roomId))
  }

	/**
	 * Prepare and send string/s to a user in a DM.
	 * @param content   Accepts message text string or array of strings.
	 * @param username  Name to create (or get) DM for room ID to use in send.
	 */
  sendDirectToUser (content: IMessage | string | string[], username: string): Promise<IMessageReceipt[] | IMessageReceipt > {
    return this.getDirectMessageRoomId(username)
		.then((rid) => this.sendToRoomId(content, rid))
  }
	/**
	 * Get ID for a DM room by its recipient's name.
	 * Will create a DM (with the bot) if it doesn't exist already.
	 * @todo test why create resolves with object instead of simply ID
	 */
  getDirectMessageRoomId (username: string): Promise < RID > {
    return this.createDirectMessage(username).then((DM: any) => {
      return DM._id
    })
  }
}
