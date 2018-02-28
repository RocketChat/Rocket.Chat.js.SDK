/// <reference types="node" />
import { EventEmitter } from 'events';
import { IAsteroid } from '../config/asteroidInterfaces';
/**
 * Connection options type
 * @param host Rocket.Chat instance Host URL:PORT (without protocol)
 * @param timeout How long to wait (ms) before abandonning connection
 */
export interface IOptions {
    host?: string;
    timeout?: number;
}
export declare const defaults: IOptions;
/**
 * Error-first callback param type
 */
export interface ICallback {
    (error: Error | null, result?: any): void;
}
/**
 * Event Emitter for listening to connection
 * @example
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
export declare const events: EventEmitter;
/**
 * An Asteroid instance for interacting with Rocket.Chat
 */
export declare let asteroid: IAsteroid;
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
export declare function connect(options?: IOptions, callback?: ICallback): Promise<any>;
