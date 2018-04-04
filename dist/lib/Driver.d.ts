/// <reference types="node" />
import { EventEmitter } from 'events';
import { Message } from './message';
import { IConnectOptions, IRespondOptions, ICallback, ILogger } from '../config/driverInterfaces';
import { IAsteroid, ICredentials, ISubscription, ICollection } from '../config/asteroidInterfaces';
import { IMessage } from '../config/messageInterfaces';
/**
 * Asteroid ^v2 interface below, suspended for work on future branch
 * @todo Upgrade to Asteroid v2 or find a better maintained ddp client
 */
/**
 * Define default config as public, allowing overrides from new connection.
 * Enable SSL by default if Rocket.Chat URL contains https.
 */
export declare function connectDefaults(): IConnectOptions;
/** Define default config for message respond filters. */
export declare function respondDefaults(): IRespondOptions;
/** Internal for comparing message update timestamps */
export declare let lastReadTime: Date;
/**
 * The integration property is applied as an ID on sent messages `bot.i` param
 * Should be replaced when connection is invoked by a package using the SDK
 * e.g. The Hubot adapter would pass its integration ID with credentials, like:
 */
export declare const integrationId: string;
/**
 * Event Emitter for listening to connection.
 * @example
 *  import { driver } from '@rocket.chat/sdk'
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
 * Current user object populated from resolved login
 */
export declare let userId: string;
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
export declare function connect(options?: IConnectOptions, callback?: ICallback): Promise<IAsteroid>;
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
export declare function reactToMessages(callback: ICallback): void;
/**
 * Proxy for `reactToMessages` with some filtering of messages based on config.
 *
 * @param callback Function called after filters run on subscription events.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed item
 *  - Third argument is additional attributes, such as `roomType`
 * @param options Sets filters for different event/message types.
 */
export declare function respondToMessages(callback: ICallback, options?: IRespondOptions): void;
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
 * Send a prepared message object (with pre-defined room ID).
 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
 */
export declare function sendMessage(message: IMessage): Promise<IMessage>;
/**
 * Prepare and send string/s to specified room ID.
 * @param content Accepts message text string or array of strings.
 * @param roomId  ID of the target room to use in send.
 */
export declare function sendToRoomId(content: string | string[], roomId: string): Promise<IMessage[] | IMessage>;
/**
 * Prepare and send string/s to specified room name (or ID).
 * @param content Accepts message text string or array of strings.
 * @param room    A name (or ID) to resolve as ID to use in send.
 */
export declare function sendToRoom(content: string | string[], room: string): Promise<IMessage[] | IMessage>;
/**
 * Prepare and send string/s to a user in a DM.
 * @param content   Accepts message text string or array of strings.
 * @param username  Name to create (or get) DM for room ID to use in send.
 */
export declare function sendDirectToUser(content: string | string[], username: string): Promise<IMessage[] | IMessage>;
