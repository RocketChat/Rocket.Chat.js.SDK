import { EventEmitter } from 'events'
import Asteroid from 'asteroid'
// Asteroid v2 imports
/*
import { createClass } from 'asteroid'
import WebSocket from 'ws'
import { Map } from 'immutable'
import immutableCollectionMixin from 'asteroid-immutable-collections-mixin'
*/
import * as methodCache from './methodCache'
import { Message } from './message'
import { IConnectOptions, IRespondOptions, ICallback, ILogger } from '../config/driverInterfaces'
import { IAsteroid, ICredentials, ISubscription, ICollection } from '../config/asteroidInterfaces'
import { IMessage } from '../config/messageInterfaces'
import { logger, replaceLog } from './log'

/** Collection names */
const _messageCollectionName = 'stream-room-messages'
const _messageStreamName = '__my_messages__'

/**
 * Asteroid ^v2 interface below, suspended for work on future branch
 * @todo Upgrade to Asteroid v2 or find a better maintained ddp client
 */
/*
const Asteroid: IAsteroid = createClass([immutableCollectionMixin])
*/

// CONNECTION SETUP AND CONFIGURE
// -----------------------------------------------------------------------------

/**
 * Define default config as public, allowing overrides from new connection.
 * Enable SSL by default if Rocket.Chat URL contains https.
 */
export function connectDefaults (): IConnectOptions {
  return {
    host: process.env.ROCKETCHAT_URL || 'localhost:3000',
    useSsl: ((process.env.ROCKETCHAT_URL || '').toString().startsWith('https')),
    timeout: 20 * 1000 // 20 seconds
  }
}

/** Define default config for message respond filters. */
export function respondDefaults (): IRespondOptions {
  return {
    allPublic: (process.env.LISTEN_ON_ALL_PUBLIC || 'false').toLowerCase() === 'true',
    dm: (process.env.RESPOND_TO_DM || 'false').toLowerCase() === 'true',
    livechat: (process.env.RESPOND_TO_LIVECHAT || 'false').toLowerCase() === 'true',
    edited: (process.env.RESPOND_TO_EDITED || 'false').toLowerCase() === 'true'
  }
}

/** Internal for comparing message update timestamps */
export let lastReadTime: Date

/**
 * The integration property is applied as an ID on sent messages `bot.i` param
 * Should be replaced when connection is invoked by a package using the SDK
 * e.g. The Hubot adapter would pass its integration ID with credentials, like:
 */
export const integrationId = process.env.INTEGRATION_ID || 'js.SDK'

/**
 * Event Emitter for listening to connection.
 * @example
 *  import { driver } from '@rocket.chat/sdk'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
export const events = new EventEmitter()

/**
 * An Asteroid instance for interacting with Rocket.Chat.
 * Variable not initialised until `connect` called.
 */
export let asteroid: IAsteroid

/**
 * Asteroid subscriptions, exported for direct polling by adapters
 * Variable not initialised until `prepMeteorSubscriptions` called.
 */
export let subscriptions: ISubscription[] = []

/**
 * Current user object populated from resolved login
 */
export let userId: string

/**
 * Array of messages received from reactive collection
 */
export let messages: ICollection

/**
 * Allow override of default logging with adapter's log instance
 */
export function useLog (externalLog: ILogger) {
  replaceLog(externalLog)
}

/**
 * Initialise asteroid instance with given options or defaults.
 * Returns promise, resolved with Asteroid instance. Callback follows
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
export function connect (options: IConnectOptions = {}, callback?: ICallback): Promise<IAsteroid> {
  return new Promise((resolve, reject) => {
    const config = Object.assign({}, connectDefaults(), options) // override defaults
    config.host = config.host!.replace(/(^\w+:|^)\/\//, '')
    logger.info('[connect] Connecting', config)
    asteroid = new Asteroid(config.host, config.useSsl)
    // Asteroid ^v2 interface...
    /*
    asteroid = new Asteroid({
      endpoint: `ws://${options.host}/websocket`,
      SocketConstructor: WebSocket
    })
    */
    setupMethodCache(asteroid) // init instance for later caching method calls
    asteroid.on('connected', () => events.emit('connected'))
    asteroid.on('reconnected', () => events.emit('reconnected'))
    // let cancelled = false
    const rejectionTimeout = setTimeout(function () {
      logger.info(`[connect] Timeout (${config.timeout})`)
      // cancelled = true
      const err = new Error('Asteroid connection timeout')
      callback ? callback(err, asteroid) : reject(err)
    }, config.timeout)
    events.once('connected', () => {
      logger.info('[connect] Connected')
      // if (cancelled) return asteroid.ddp.disconnect() // cancel if already rejected
      clearTimeout(rejectionTimeout)
      if (callback) callback(null, asteroid)
      resolve(asteroid)
    })
  })
}

/**
 * Remove all active subscriptions, logout and disconnect from Rocket.Chat
 */
export function disconnect (): Promise<void> {
  logger.info('Unsubscribing, logging out, disconnecting')
  unsubscribeAll()
  return logout().then(() => Promise.resolve()) // asteroid.disconnect()) // v2 only
}

// ASYNC AND CACHE METHOD UTILS
// -----------------------------------------------------------------------------

/**
 * Setup method cache configs from env or defaults, before they are called.
 * @param asteroid The asteroid instance to cache method calls
 */
function setupMethodCache (asteroid: IAsteroid): void {
  methodCache.use(asteroid)
  methodCache.create('getRoomIdByNameOrId', {
    max: parseInt(process.env.ROOM_CACHE_SIZE || '10', 10),
    maxAge: 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10)
  }),
  methodCache.create('getRoomNameById', {
    max: parseInt(process.env.ROOM_CACHE_SIZE || '10', 10),
    maxAge: 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10)
  })
  methodCache.create('createDirectMessage', {
    max: parseInt(process.env.DM_ROOM_CACHE_SIZE || '10', 10),
    maxAge: 1000 * parseInt(process.env.DM_ROOM_CACHE_MAX_AGE || '100', 10)
  })
}

/**
 * Wraps method calls to ensure they return a Promise with caught exceptions.
 * @param method The Rocket.Chat server method, to call through Asteroid
 * @param params Single or array of parameters of the method to call
 */
export function asyncCall (method: string, params: any | any[]): Promise<any> {
  if (!Array.isArray(params)) params = [params] // cast to array for apply
  logger.info(`[${method}] Calling (async): ${JSON.stringify(params)}`)
  return Promise.resolve(asteroid.apply(method, params).result)
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
 * Call a method as async via Asteroid, or through cache if one is created.
 * @param name The Rocket.Chat server method to call
 * @param params Single or array of parameters of the method to call
 */
export function callMethod (name: string, params: any | any[]): Promise<any> {
  return (methodCache.has(name))
    ? asyncCall(name, params)
    : cacheCall(name, params)
}

/**
 * Wraps Asteroid method calls, passed through method cache if cache is valid.
 * @param method The Rocket.Chat server method, to call through Asteroid
 * @param key Single string parameters only, required to use as cache key
 */
export function cacheCall (method: string, key: string): Promise<any> {
  return methodCache.call(method, key)
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

// LOGIN AND SUBSCRIBE TO ROOMS
// -----------------------------------------------------------------------------

/** Login to Rocket.Chat via Asteroid */
export function login (credentials: ICredentials): Promise<any> {
  logger.info(`[login] Logging in ${credentials.username || credentials.email}`)
  let login: Promise<any>
  if (process.env.ROCKETCHAT_AUTH === 'ldap') {
    const params = [
      credentials.username,
      credentials.password,
      { ldap: true, ldapOptions: {} }
    ]
    login = asteroid.loginWithLDAP(...params)
  } else {
    const usernameOrEmail = credentials.username || credentials.email || 'bot'
    login = asteroid.loginWithPassword(usernameOrEmail, credentials.password)
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

/** Logout of Rocket.Chat via Asteroid */
export function logout (): Promise<void | null> {
  return asteroid.logout().catch((err: Error) => {
    logger.error('[Logout] Error:', err)
    throw err // throw after log to stop async chain
  })
}

/**
 * Subscribe to Meteor subscription
 * Resolves with subscription (added to array), with ID property
 * @todo - 3rd param of asteroid.subscribe is deprecated in Rocket.Chat?
 */
export function subscribe (topic: string, roomId: string): Promise<ISubscription> {
  return new Promise((resolve, reject) => {
    logger.info(`[subscribe] Preparing subscription: ${topic}: ${roomId}`)
    const subscription = asteroid.subscribe(topic, roomId, true)
    subscriptions.push(subscription)
    return subscription.ready.then((id) => {
      logger.info(`[subscribe] Stream ready: ${id}`)
      resolve(subscription)
    })
    // Asteroid ^v2 interface...
    /*
    subscription.on('ready', () => {
      console.log(`[${topic}] Subscribe ready`)
      events.emit('subscription-ready', subscription)
      subscriptions.push(subscription)
      resolve(subscription)
    })
    subscription.on('error', (err: Error) => {
      console.error(`[${topic}] Subscribe error:`, err)
      events.emit('subscription-error', roomId, err)
      reject(err)
    })
    */
  })
}

/** Unsubscribe from Meteor subscription */
export function unsubscribe (subscription: ISubscription): void {
  const index = subscriptions.indexOf(subscription)
  if (index === -1) return
  subscription.stop()
  // asteroid.unsubscribe(subscription.id) // v2
  subscriptions.splice(index, 1) // remove from collection
  logger.info(`[${subscription.id}] Unsubscribed`)
}

/** Unsubscribe from all subscriptions in collection */
export function unsubscribeAll (): void {
  subscriptions.map((s: ISubscription) => unsubscribe(s))
}

/**
 * Begin subscription to room events for user.
 * Older adapters used an option for this method but it was always the default.
 */
export function subscribeToMessages (): Promise<ISubscription> {
  return subscribe(_messageCollectionName, _messageStreamName)
    .then((subscription) => {
      messages = asteroid.getCollection(_messageCollectionName)
      // v2
      // messages = asteroid.collections.get(_messageCollectionName) || Map()
      return subscription
    })
}

/**
 * Once a subscription is created, using `subscribeToMessages` this method
 * can be used to attach a callback to changes in the message stream.
 * This can be called directly for custom extensions, but for most usage (e.g.
 * for bots) the respondToMessages is more useful to only receive messages
 * matching configuration.
 *
 * @param callback Function called with every change in subscriptions.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed item
 *  - Third argument is additional attributes, such as `roomType`
 */
export function reactToMessages (callback: ICallback): void {
  logger.info(`[reactive] Listening for change events in collection ${messages.name}`)
  messages.reactiveQuery({}).on('change', (_id: string) => {
    const changedMessageQuery = messages.reactiveQuery({ _id })
    if (changedMessageQuery.result && changedMessageQuery.result.length > 0) {
      const changedMessage = changedMessageQuery.result[0]
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
export function respondToMessages (callback: ICallback, options: IRespondOptions = {}): void {
  const config = Object.assign({}, respondDefaults(), options)
  lastReadTime = new Date() // init before any message read
  reactToMessages(async (err, message, meta) => {
    if (err) {
      logger.error(`Unable to receive messages ${JSON.stringify(err)}`)
      callback(err) // bubble errors back to adapter
    }

    // Ignore bot's own messages
    if (message.u._id === userId) return

    // Ignore DMs if configured to
    const isDM = meta.roomType === 'd'
    if (isDM && !config.dm) return

    // Ignore Livechat if configured to
    const isLC = meta.roomType === 'l'
    if (isLC && !config.livechat) return

    // Ignore messages in public rooms not joined by bot if configured to
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

    // Add room name to meta, is useful for some adapters
    if (!isDM && !isLC) meta.roomName = await getRoomName(message.rid)

    // Processing completed, call callback to respond to message
    callback(null, message, meta)
  })
}

/**
 * Get every new element added to DDP in Asteroid (v2)
 * @todo Resolve this functionality within Rocket.Chat with team
 * @param callback Function to call with element details
 */
/*
export function onAdded (callback: ICallback): void {
  console.log('Setting up reactive message list...')
  try {
    asteroid.ddp.on('added', ({ collection, id, fields }) => {
      console.log(`Element added to collection ${ collection }`)
      console.log(id)
      console.log(fields)
      callback(null, id)
    })
  } catch (err) {
    callback(err)
  }
}
*/

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
export function joinRoom (room: string): Promise<void> {
  return getRoomId(room).then((roomId) => asyncCall('joinRoom', roomId))
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
 * Prepare and send message/s to specified room ID.
 * Accepts message text string, array of strings or a structured message object.
 * Will create one or more send calls collected into promise.
 */
export function sendMessageByRoomId (content: string | string[] | IMessage, roomId: string): Promise<any> {
  let messages: Message[] = []
  if (Array.isArray(content)) {
    content.forEach((text) => messages.push(prepareMessage(text, roomId)))
  } else {
    messages.push(prepareMessage(content, roomId))
  }
  return Promise.all(messages.map((message) => sendMessage(message)))
}

/**
 * Prepare and send message/s to specified room name (or ID).
 * Accepts message text string, array of strings or a structured message object.
 * Will create one or more send calls collected into promise.
 */
export function sendMessageByRoom (content: string | string[] | IMessage, room: string): Promise<any> {
  return getRoomId(room).then((roomId) => sendMessageByRoomId(content, roomId))
}

/**
 * Send a message to a user in a DM.
 */
export function sendDirectToUser (message: string | string[] | IMessage, username: string): Promise<any> {
  return getDirectMessageRoomId(username).then((rid) => sendMessageByRoomId(message, rid))
}

/**
 * Send a prepared message object (with pre-defined room ID).
 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
 * In the Hubot adapter, this method accepted a room ID, which was not semantic,
 * such usage should be replaced by `sendMessageByRoom(content, roomId)`
 */
export function sendMessage (message: IMessage, roomId?: string): Promise<any> {
  if (roomId) return sendMessageByRoomId(message, roomId)
  return asyncCall('sendMessage', message)
}

/**
 * Legacy method for older adapters - sendMessage now accepts all properties
 * @deprecated since 0.0.0
 */
export function customMessage (message: IMessage): Promise<any> {
  return sendMessage(message)
}
