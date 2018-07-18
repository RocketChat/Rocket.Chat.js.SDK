import { EventEmitter } from 'events'

import * as settings from './settings'
import * as methodCache from './methodCache'
import { Message } from './message'
import { IConnectOptions, IRespondOptions, ICallback, ILogger } from '../config/driverInterfaces'
import { ICredentials, ISubscription } from '../config/asteroidInterfaces'
import { IMessage } from '../config/messageInterfaces'
import { logger, replaceLog } from './log'
import Socket, { Subscription } from './ddp'
import { IMessageReceiptAPI } from '../utils/interfaces'

/** Collection names */
const _messageCollectionName = 'stream-room-messages'
const _messageStreamName = '__my_messages__'

// CONNECTION SETUP AND CONFIGURE
// -----------------------------------------------------------------------------

/** Internal for comparing message update timestamps */
export let lastReadTime: Date

/**
 * The integration property is applied as an ID on sent messages `bot.i` param
 * Should be replaced when connection is invoked by a package using the SDK
 * e.g. The Hubot adapter would pass its integration ID with credentials, like:
 */
export const integrationId = settings.integrationId

/**
 * Event Emitter for listening to connection.
 * @example
 *  import { driver } from '@rocket.chat/sdk'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
export const events = new EventEmitter()

export let ddp: Socket

/**
 * Asteroid subscriptions, exported for direct polling by adapters
 * Variable not initialised until `prepMeteorSubscriptions` called.
 */
export let subscriptions: Subscription[] = []

/**
 * Current user object populated from resolved login
 */
export let userId: string

/**
 * Array of joined room IDs (for reactive queries)
 */
export let joinedIds: string[] = []

/**
 * Allow override of default logging with adapter's log instance
 */
export function useLog (externalLog: ILogger) {
  replaceLog(externalLog)
}

/**
 * Initialise socket instance with given options or defaults.
 * Returns promise, resolved with Socket instance. Callback follows
 * error-first-pattern. Error returned or promise rejected on timeout.
 * Removes http/s protocol to get connection hostname if taken from URL.
 * @example <caption>Use with callback</caption>
 *  import { driver } from '@rocket.chat/sdk'
 *  driver.connect({}, (err) => {
 *    if (err) throw err
 *    else console.log('connected')
 *  })
 * @example <caption>Using promise</caption>
 *  import { driver } from '@rocket.chat/sdk'
 *  driver.connect()
 *    .then(() => console.log('connected'))
 *    .catch((err) => console.error(err))
 */
export function connect (options: IConnectOptions = {}, callback?: ICallback): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const config = Object.assign({}, settings, options) // override defaults
    config.host = config.host.replace(/(^\w+:|^)\/\//, '')
    logger.info('[connect] Connecting', config)

    ddp = new Socket(config.host)

    setupMethodCache(ddp) // init instance for later caching method calls

    // TODO: refact
    ddp.on('connected', () => events.emit('connected'))
    ddp.on('reconnected', () => events.emit('reconnected'))
    // END

    let cancelled = false
    const rejectionTimeout = setTimeout(function () {
      logger.info(`[connect] Timeout (${config.timeout})`)
      const err = new Error('Socket connection timeout')
      cancelled = true
      events.removeAllListeners('connected')
      callback ? callback(err, ddp) : reject(err)
    }, config.timeout)

    // if to avoid condition where timeout happens before listener to 'connected' is added
    // and this listener is not removed (because it was added after the removal)
    if (!cancelled) {
      events.once('connected', () => {
        logger.info('[connect] Connected')
        // if (cancelled) return asteroid.ddp.disconnect() // cancel if already rejected
        clearTimeout(rejectionTimeout)
        if (callback) callback(null, ddp)
        resolve(ddp)
      })
    }
  })
}

/**
 * Remove all active subscriptions, logout and disconnect from Rocket.Chat
 */
export function disconnect (): Promise<void> {
  logger.info('Unsubscribing, logging out, disconnecting')
  unsubscribeAll()
  return logout().then(() => Promise.resolve())
}

// ASYNC AND CACHE METHOD UTILS
// -----------------------------------------------------------------------------

/**
 * Setup method cache configs from env or defaults, before they are called.
 * @param ddp The Socket instance to cache method calls
 */
function setupMethodCache (ddp: Socket): void {
  methodCache.use(ddp)
  methodCache.create('getRoomIdByNameOrId', {
    max: settings.roomCacheMaxSize,
    maxAge: settings.roomCacheMaxAge
  }),
  methodCache.create('getRoomNameById', {
    max: settings.roomCacheMaxSize,
    maxAge: settings.roomCacheMaxAge
  })
  methodCache.create('createDirectMessage', {
    max: settings.dmCacheMaxSize,
    maxAge: settings.dmCacheMaxAge
  })
}

/**
 * Wraps method calls to ensure they return a Promise with caught exceptions.
 * @param method The Rocket.Chat server method, to call through Socket
 * @param params Single or array of parameters of the method to call
 */
export function asyncCall (method: string, params: any): Promise<any> {
  logger.info(`[${method}] Calling (async): ${JSON.stringify(params)}`)
  return Promise.resolve(ddp.call(method, params))
    .catch((err: Error) => {
      logger.error(`[${method}] Error:`, err)
      throw err // throw after log to stop async chain
    })
    .then((result: any) => {
      (result)
        ? logger.debug(`[${method}] Success: ${JSON.stringify(result)}`)
        : logger.debug(`[${method}] Success`)
      return result
    })
}

/**
 * Call a method as async via Socket, or through cache if one is created.
 * If the method doesn't have or need parameters, it can't use them for caching
 * so it will always call asynchronously.
 * @param name The Rocket.Chat server method to call
 * @param params Single or array of parameters of the method to call
 */
export function callMethod (name: string, params?: any | any[]): Promise<any> {
  return (methodCache.has(name) || typeof params === 'undefined')
    ? asyncCall(name, params)
    : cacheCall(name, params)
}

/**
 * Wraps Socket method calls, passed through method cache if cache is valid.
 * @param method The Rocket.Chat server method, to call through Socket
 * @param key Single string parameters only, required to use as cache key
 */
export function cacheCall (method: string, key: string): Promise<any> {
  return methodCache.call(method, key)
    .catch((err: Error) => {
      logger.error(`[${method}] Error:`, err)
      throw err // throw after log to stop async chain
    })
    .then((result: any) => {
      result
        ? logger.debug(`[${method}] Success: ${JSON.stringify(result)}`)
        : logger.debug(`[${method}] Success`)
      return result
    })
}

// LOGIN AND SUBSCRIBE TO ROOMS
// -----------------------------------------------------------------------------

/** Login to Rocket.Chat via Socket */
export function login (credentials: ICredentials = {
  username: settings.username,
  password: settings.password,
  ldap: settings.ldap
}): Promise<any> {
  let login: Promise<any>
  if (credentials.ldap) {
    logger.info(`[login] Logging in ${credentials.username} with LDAP`)
    login = ddp.login(
      { ldap: true, ldapOptions: credentials.ldapOptions || {}, ldapPass: credentials.password, username: credentials.username }
    )
  } else {
    logger.info(`[login] Logging in ${credentials.username}`)
    login = ddp.login({
      user: { username: credentials.username, email: credentials.email },
      password: credentials.password
    })
  }
  return login
    .then((loggedInUserId) => {
      userId = loggedInUserId
      return loggedInUserId
    })
    .catch((err: Error) => {
      logger.info('[login] Error:', err)
      throw err // throw after log to stop async chain
    })
}

/** Logout of Rocket.Chat via Socket */
export function logout (): Promise<void | null> {
  return ddp.logout().catch((err: Error) => {
    logger.error('[Logout] Error:', err)
    throw err // throw after log to stop async chain
  })
}

/**
 * Subscribe to Meteor subscription
 * Resolves with subscription (added to array), with ID property
 * @todo - 3rd param of ddp.subscribe is deprecated in Rocket.Chat?
 */
export function subscribe (topic: string, roomId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    logger.info(`[subscribe] Preparing subscription: ${topic}: ${roomId}`)
    const promiseSubscription = ddp.subscribe(topic, roomId, true)
    return promiseSubscription.then((subscription) => {
      subscriptions.push(subscription)
      logger.info(`[subscribe] Stream ready: ${subscription.id}`)
      resolve(subscription)
    })
  })
}

/** Unsubscribe from Meteor subscription */
export function unsubscribe (subscription: Subscription): void {
  const index = subscriptions.indexOf(subscription)
  if (index === -1) return
  subscription.unsubscribe().then(() => {
    subscriptions.splice(index, 1) // remove from collection
    logger.info(`[${subscription.id}] Unsubscribed`)
  }).catch((err: Error) => {
    logger.error('[Unsubscribe] Error:', err)
    throw err
  })
}

/** Unsubscribe from all subscriptions in collection */
export function unsubscribeAll (): void {
  subscriptions.map((s: Subscription) => unsubscribe(s))
}

/**
 * Begin subscription to room events for user.
 * Older adapters used an option for this method but it was always the default.
 */
export function subscribeToMessages (): Promise<ISubscription> {
  return subscribe(_messageCollectionName, _messageStreamName)
}

/**
 * Once a subscription is created, using `subscribeToMessages` this method
 * can be used to attach a callback to changes in the message stream.
 * This can be called directly for custom extensions, but for most usage (e.g.
 * for bots) the respondToMessages is more useful to only receive messages
 * matching configuration.
 *
 * If the bot hasn't been joined to any rooms at this point, it will attempt to
 * join now based on environment config, otherwise it might not receive any
 * messages. It doesn't matter that this happens asynchronously because the
 * bot's joined rooms can change after the reactive query is set up.
 *
 * @todo `reactToMessages` should call `subscribeToMessages` if not already
 *       done, so it's not required as an arbitrary step for simpler adapters.
 *       Also make `login` call `connect` for the same reason, the way
 *       `respondToMessages` calls `respondToMessages`, so all that's really
 *       required is:
 *       `driver.login(credentials).then(() => driver.respondToMessages(callback))`
 * @param callback Function called with every change in subscriptions.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed item
 *  - Third argument is additional attributes, such as `roomType`
 */
export function reactToMessages (callback: ICallback): void {
  logger.info(`[reactive] Listening for change events in collection ${_messageCollectionName}`)
  ddp.on(_messageCollectionName, (obj: any) => {
    const changedMessage = obj.fields
    if (changedMessage && changedMessage.args.length > 0) {
      if (Array.isArray(changedMessage.args)) {
        logger.info(`[received] Message in room ${ changedMessage.args[0].rid }`)
        callback(null, changedMessage.args[0], changedMessage.args[1])
      } else {
        logger.debug('[received] Update without message args')
      }
    } else {
      logger.debug('[received] Reactive query at ID ${ _id } without results')
    }
  })
}

/**
 * Proxy for `reactToMessages` with some filtering of messages based on config.
 *
 * @param callback Function called after filters run on subscription events.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed item
 *  - Third argument is additional attributes, such as `roomType`
 * @param options Sets filters for different event/message types.
 */
export function respondToMessages (callback: ICallback, options: IRespondOptions = {}): Promise<void | void[]> {
  const config = Object.assign({}, settings, options)
  let promise: Promise<void | void[]> = Promise.resolve() // return value, may be replaced by async ops

  // Join configured rooms if they haven't been already, unless listening to all
  // public rooms, in which case it doesn't matter
  if (
    !config.allPublic &&
    joinedIds.length === 0 &&
    config.rooms &&
    config.rooms.length > 0
  ) {
    promise = joinRooms(config.rooms).catch((err) => {
      logger.error(`Failed to join rooms set in env: ${config.rooms}`, err)
    })
  }

  lastReadTime = new Date() // init before any message read
  reactToMessages(async (err, message, meta) => {
    if (err) {
      logger.error(`Unable to receive messages ${JSON.stringify(err)}`)
      callback(err) // bubble errors back to adapter
    }

    // Ignore bot's own messages
    if (message.u._id === userId) return

    // Ignore DMs unless configured not to
    const isDM = meta.roomType === 'd'
    if (isDM && !config.dm) return

    // Ignore Livechat unless configured not to
    const isLC = meta.roomType === 'l'
    if (isLC && !config.livechat) return

    // Ignore messages in un-joined public rooms unless configured not to
    if (!config.allPublic && !isDM && !meta.roomParticipant) return

    // Set current time for comparison to incoming
    let currentReadTime = new Date(message.ts.$date)

    // Ignore edited messages if configured to
    // unless it's newer than current read time (hasn't been seen before)
    // @todo: test this logic, why not just return if edited and not responding
    if (config.edited && typeof message.editedAt !== 'undefined') {
      let edited = new Date(message.editedAt.$date)
      if (edited > currentReadTime) currentReadTime = edited
    }

    // Ignore messages in stream that aren't new
    if (currentReadTime <= lastReadTime) return

    // At this point, message has passed checks and can be responded to
    logger.info(`Message receive callback ID ${message._id} at ${currentReadTime}`)
    logger.info(`[Incoming] ${message.u.username}: ${(message.file !== undefined) ? message.attachments[0].title : message.msg}`)
    lastReadTime = currentReadTime

    /**
     * @todo Fix below by adding to meta from Rocket.Chat instead of getting on
     *       each message event. It's inefficient and throws off tests that
     *       await on send completion, because the callback has not yet fired.
     *       Then re-enable last two `.respondToMessages` tests.
     */
    // Add room name to meta, is useful for some adapters (is promise)
    // if (!isDM && !isLC) meta.roomName = await getRoomName(message.rid)

    // Processing completed, call callback to respond to message
    callback(null, message, meta)
  })
  return promise
}

// PREPARE AND SEND MESSAGES
// -----------------------------------------------------------------------------

/** Get ID for a room by name (or ID). */
export function getRoomId (name: string): Promise<string> {
  return cacheCall('getRoomIdByNameOrId', name)
}

/** Get name for a room by ID. */
export function getRoomName (id: string): Promise<string> {
  return cacheCall('getRoomNameById', id)
}

/**
 * Get ID for a DM room by its recipient's name.
 * Will create a DM (with the bot) if it doesn't exist already.
 * @todo test why create resolves with object instead of simply ID
 */
export function getDirectMessageRoomId (username: string): Promise<string> {
  return cacheCall('createDirectMessage', username).then((DM) => DM.rid)
}

/** Join the bot into a room by its name or ID */
export async function joinRoom (room: string): Promise<void> {
  let roomId = await getRoomId(room)
  let joinedIndex = joinedIds.indexOf(room)
  if (joinedIndex !== -1) {
    logger.error(`tried to join room that was already joined`)
  } else {
    await asyncCall('joinRoom', roomId)
    joinedIds.push(roomId)
  }
}

/** Exit a room the bot has joined */
export async function leaveRoom (room: string): Promise<void> {
  let roomId = await getRoomId(room)
  let joinedIndex = joinedIds.indexOf(room)
  if (joinedIndex === -1) {
    logger.error(`leave room ${room} failed because bot has not joined in room`)
  } else {
    await asyncCall('leaveRoom', roomId)
    delete joinedIds[joinedIndex]
  }
}

/** Join a set of rooms by array of names or IDs */
export function joinRooms (rooms: string[]): Promise<void[]> {
  return Promise.all(rooms.map((room) => joinRoom(room)))
}

/**
 * Structure message content, optionally addressing to room ID.
 * Accepts message text string or a structured message object.
 */
export function prepareMessage (content: string | IMessage, roomId?: string): Message {
  const message = new Message(content, integrationId)
  if (roomId) message.setRoomId(roomId)
  return message
}

/**
 * Send a prepared message object (with pre-defined room ID).
 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
 */
export function sendMessage (message: IMessage): Promise<IMessageReceiptAPI> {
  const { _id, rid, msg } = message
  return asyncCall('sendMessage', { _id, rid, msg })
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
export function sendToRoomId (content: string | string[], roomId: string): Promise<IMessageReceiptAPI[] | IMessageReceiptAPI> {
  if (!Array.isArray(content)) {
    return sendMessage(prepareMessage(content, roomId))
  } else {
    return Promise.all(content.map((text) => {
      return sendMessage(prepareMessage(text, roomId))
    }))
  }
}

/**
 * Prepare and send string/s to specified room name (or ID).
 * @param content Accepts message text string or array of strings.
 * @param room    A name (or ID) to resolve as ID to use in send.
 */
export function sendToRoom (content: string | string[], room: string): Promise<IMessageReceiptAPI[] | IMessageReceiptAPI> {
  return getRoomId(room).then((roomId) => sendToRoomId(content, roomId))
}

/**
 * Prepare and send string/s to a user in a DM.
 * @param content   Accepts message text string or array of strings.
 * @param username  Name to create (or get) DM for room ID to use in send.
 */
export function sendDirectToUser (content: string | string[], username: string): Promise<IMessageReceiptAPI[] | IMessageReceiptAPI> {
  return getDirectMessageRoomId(username).then((rid) => sendToRoomId(content, rid))
}

/**
 * Edit an existing message, replacing any attributes with those provided.
 * The given message object should have the ID of an existing message.
 */
export function editMessage (message: IMessage): Promise<IMessage> {
  return asyncCall('updateMessage', message)
}

/**
 * Send a reaction to an existing message. Simple proxy for method call.
 * @param emoji     Accepts string like `:thumbsup:` to add 👍 reaction
 * @param messageId ID for a previously sent message
 */
export function setReaction (emoji: string, messageId: string) {
  return asyncCall('setReaction', [emoji, messageId])
}
