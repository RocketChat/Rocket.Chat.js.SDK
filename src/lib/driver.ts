import { createClass } from 'asteroid'
import { EventEmitter } from 'events'
import WebSocket from 'ws'
import * as methodCache from './methodCache'
import { IAsteroid } from '../config/asteroidInterfaces'
import { IMessage } from '../config/messageInterfaces'
const Asteroid = createClass()

/**
 * Setup method cache configs from env or defaults, before they are called
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
 * Connection options type
 * @param host Rocket.Chat instance Host URL:PORT (without protocol)
 * @param timeout How long to wait (ms) before abandoning connection
 */
export interface IOptions {
  host?: string,
  timeout?: number
}
export const defaults: IOptions = {
  host: 'localhost:3000',
  timeout: 20 * 1000 // 20 seconds
}

/**
 * Error-first callback param type
 */
export interface ICallback {
  (error: Error | null, result?: any): void
}

/**
 * Event Emitter for listening to connection
 * @example
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
export const events = new EventEmitter()

/**
 * An Asteroid instance for interacting with Rocket.Chat
 * Variable not initialised until connect method called
 */
export let asteroid: IAsteroid

/**
 * Initialise asteroid instance with given options or defaults
 * @example <caption>Use with callback</caption>
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect({}, (err, asteroid) => {
 *    if (err) throw err
 *    else constole.log(asteroid)
 *  })
 * @example <caption>Using promise</caption>
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *    .then((asteroid) => {
 *      console.log(asteroid)
 *    })
 *    .catch((err) => {
 *      console.error(err)
 *    })
 */
export function connect (options: IOptions = {}, callback?: ICallback): Promise<any> {
  return new Promise<IAsteroid>((resolve, reject) => {
    options = Object.assign(defaults, options)
    asteroid = new Asteroid({
      endpoint: `ws://${options.host}/websocket`,
      SocketConstructor: WebSocket
    })
    setupMethodCache(asteroid) // init instance for later caching method calls
    asteroid.on('connected', () => events.emit('connected'))
    asteroid.on('reconnected', () => events.emit('reconnected'))
    let cancelled = false
    const rejectionTimeout = setTimeout(() => {
      cancelled = true
      const err = new Error('Asteroid connection timeout')
      // if no callback available, reject the promise
      // else, return callback using "error-first-pattern"
      return callback ? callback(err, asteroid) : reject(err)
    }, options.timeout)
    asteroid.once('connected', () => {
      // cancel connection and don't resolve if already rejected
      if (cancelled) return asteroid.disconnect()
      clearTimeout(rejectionTimeout)
      return (callback !== undefined) ? callback(null, asteroid) : resolve(asteroid)
    })
  })
}

/** @todo: From on here on untested */

/** Get ID for a room by name (or ID) */
export function getRoomId (name: string): Promise<string> {
  return methodCache.call('getRoomIdByNameOrId', name)
}

/** Get name for a room by ID */
export function getRoomName (id: string): Promise<string> {
  return methodCache.call('getRoomNameById', id)
}

/**
 * Get ID for a DM room by its recipient's name
 * Will create a DM (with the bot) if it doesn't exist already
 */
export function getDirectMessageRoomId (username: string): Promise<string> {
  return methodCache.call('createDirectMessage', username)
}

/** Join the bot into a room by its ID */
export function joinRoom (roomId: string): Promise<void> {
  return Promise.resolve(asteroid.call('joinRoom', roomId))
}

/**
 * Put message content in required structure for sending to room
 * Accepts a message string, or a preformed message object to address room ID
 */
export function prepareMessage (content: string | IMessage, roomId: string): IMessage {
  let message: IMessage
  if (typeof content === 'string') {
    message = {
      msg: content,
      rid: roomId,
      bot: true
    }
  } else {
    message = content
    message.rid = roomId
    message.bot = true
  }
  return message
}
