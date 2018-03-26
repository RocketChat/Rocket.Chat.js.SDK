/// <reference types="node" />
import { EventEmitter } from 'events';
import { Message } from './message';
import { IOptions, ICallback, ILogger } from '../config/driverInterfaces';
import { IAsteroid, ICredentials, ISubscription, ICollection } from '../config/asteroidInterfaces';
import { IMessage } from '../config/messageInterfaces';
/**
 * Event Emitter for listening to connection.
 * @example
 *  import { driver } from 'rocketchat-sdk'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
export declare const events: EventEmitter;
/**
 * An Asteroid instance for interacting with Rocket.Chat.
 * Variable not initialised until `connect` called.
 */
export declare let asteroid: IAsteroid;
/**
 * Asteroid subscriptions, exported for direct polling by adapters
 * Variable not initialised until `prepMeteorSubscriptions` called.
 */
export declare let subscriptions: ISubscription[];
/**
 * Array of messages received from reactive collection
 */
export declare let messages: ICollection;
/**
 * Allow override of default logging with adapter's log instance
 */
export declare function useLog(externalLog: ILogger): void;
/**
 * Initialise asteroid instance with given options or defaults.
 * Returns promise, resolved with Asteroid instance. Callback follows
 * error-first-pattern. Error returned or promise rejected on timeout.
 * Removes http/s protocol to get connection hostname if taken from URL.
 * @example <caption>Use with callback</caption>
 *  import { driver } from 'rocketchat-sdk'
 *  driver.connect({}, (err) => {
 *    if (err) throw err
 *    else console.log('connected')
 *  })
 * @example <caption>Using promise</caption>
 *  import { driver } from 'rocketchat-sdk'
 *  driver.connect()
 *    .then(() => console.log('connected'))
 *    .catch((err) => console.error(err))
 */
export declare function connect(options?: IOptions, callback?: ICallback): any;
/**
 * Remove all active subscriptions, logout and disconnect from Rocket.Chat
 */
export declare function disconnect(): Promise<void>;
/**
 * Wraps method calls to ensure they return a Promise with caught exceptions.
 * @param method The Rocket.Chat server method, to call through Asteroid
 * @param params Single or array of parameters of the method to call
 */
export declare function asyncCall(method: string, params: any | any[]): Promise<any>;
/**
 * Call a method as async via Asteroid, or through cache if one is created.
 * @param name The Rocket.Chat server method to call
 * @param params Single or array of parameters of the method to call
 */
export declare function callMethod(name: string, params: any | any[]): Promise<any>;
/**
 * Wraps Asteroid method calls, passed through method cache if cache is valid.
 * @param method The Rocket.Chat server method, to call through Asteroid
 * @param key Single string parameters only, required to use as cache key
 */
export declare function cacheCall(method: string, key: string): Promise<any>;
/** Login to Rocket.Chat via Asteroid */
export declare function login(credentials: ICredentials): Promise<any>;
/** Logout of Rocket.Chat via Asteroid */
export declare function logout(): Promise<void | null>;
/**
 * Subscribe to Meteor subscription
 * Resolves with subscription (added to array), with ID property
 * @todo - 3rd param of asteroid.subscribe is deprecated in Rocket.Chat?
 */
export declare function subscribe(topic: string, roomId: string): Promise<ISubscription>;
/** Unsubscribe from Meteor subscription */
export declare function unsubscribe(subscription: ISubscription): void;
/** Unsubscribe from all subscriptions in collection */
export declare function unsubscribeAll(): void;
/**
 * Begin subscription to room events for user.
 * Older adapters used an option for this method but it was always the default.
 */
export declare function subscribeToMessages(): Promise<ISubscription>;
export declare function reactToMessages(callback: ICallback): void;
/**
 * Get every new element added to DDP in Asteroid (v2)
 * @todo Resolve this functionality within Rocket.Chat with team
 * @param callback Function to call with element details
 */
/** Get ID for a room by name (or ID). */
export declare function getRoomId(name: string): Promise<string>;
/** Get name for a room by ID. */
export declare function getRoomName(id: string): Promise<string>;
/**
 * Get ID for a DM room by its recipient's name.
 * Will create a DM (with the bot) if it doesn't exist already.
 * @todo test why create resolves with object instead of simply ID
 */
export declare function getDirectMessageRoomId(username: string): Promise<string>;
/** Join the bot into a room by its name or ID */
export declare function joinRoom(room: string): Promise<void>;
/** Join a set of rooms by array of names or IDs */
export declare function joinRooms(rooms: string[]): Promise<void[]>;
/**
 * Structure message content, optionally addressing to room ID.
 * Accepts message text string or a structured message object.
 */
export declare function prepareMessage(content: string | IMessage, roomId?: string): Message;
/**
 * Prepare and send message/s to specified room ID.
 * Accepts message text string, array of strings or a structured message object.
 * Will create one or more send calls collected into promise.
 */
export declare function sendMessageByRoomId(content: string | string[] | IMessage, roomId: string): Promise<any>;
/**
 * Prepare and send message/s to specified room name (or ID).
 * Accepts message text string, array of strings or a structured message object.
 * Will create one or more send calls collected into promise.
 */
export declare function sendMessageByRoom(content: string | string[] | IMessage, room: string): Promise<any>;
/**
 * Send a message to a user in a DM.
 */
export declare function sendDirectToUser(message: string | string[] | IMessage, username: string): Promise<any>;
/**
 * Send a prepared message object (with pre-defined room ID).
 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
 * In the Hubot adapter, this method accepted a room ID, which was not semantic,
 * such usage should be replaced by `sendMessageByRoom(content, roomId)`
 */
export declare function sendMessage(message: IMessage, roomId?: string): Promise<any>;
/**
 * Legacy method for older adapters - sendMessage now accepts all properties
 * @deprecated since 0.0.0
 */
export declare function customMessage(message: IMessage): Promise<any>;
