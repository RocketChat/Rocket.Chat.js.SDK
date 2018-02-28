// @ts-ignore // Asteroid is not typed
import { createClass } from 'asteroid'
import { EventEmitter } from 'events'
import WebSocket from 'ws'
import * as methodCache from './methodCache'
import { IAsteroid } from '../config/asteroidInterfaces'
const Asteroid = createClass()

/**
 * Connection options type
 * @param host Rocket.Chat instance Host URL:PORT (without protocol)
 * @param timeout How long to wait (ms) before abandonning connection
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
    methodCache.use(asteroid) // init instance for later caching method calls
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
