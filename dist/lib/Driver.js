"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
}
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const asteroid_1 = __importDefault(require("asteroid"));
// Asteroid v2 imports
/*
import { createClass } from 'asteroid'
import WebSocket from 'ws'
import { Map } from 'immutable'
import immutableCollectionMixin from 'asteroid-immutable-collections-mixin'
*/
const methodCache = __importStar(require("./methodCache"));
const message_1 = require("./message");
/** Collection names */
const _messageCollectionName = 'stream-room-messages';
const _messageStreamName = '__my_messages__';
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
 * Define connection defaults.
 * Enable SSL by default if Rocket.Chat URL contains https.
 * Remove http/s protocol to get hostname if taken from URL
 */
const defaults = {
    host: process.env.ROCKETCHAT_URL || 'localhost:3000',
    useSsl: ((process.env.ROCKETCHAT_UR || '').toString().startsWith('https')),
    timeout: 20 * 1000 // 20 seconds
};
defaults.host = defaults.host.replace(/(^\w+:|^)\/\//, '');
/**
 * Event Emitter for listening to connection.
 * @example
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *  driver.events.on('connected', () => console.log('driver connected'))
 */
exports.events = new events_1.EventEmitter();
/**
 * Asteroid subscriptions, exported for direct polling by adapters
 * Variable not initialised until `prepMeteorSubscriptions` called.
 */
exports.subscriptions = [];
/**
 * Initialise asteroid instance with given options or defaults.
 * Returns promise, resolved with Asteroid instance. Callback follows
 * error-first-pattern. Error returned or promise rejected on timeout.
 * @example <caption>Use with callback</caption>
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect({}, (err) => {
 *    if (err) throw err
 *    else console.log('connected')
 *  })
 * @example <caption>Using promise</caption>
 *  import { driver } from 'rocketchat-bot-driver'
 *  driver.connect()
 *    .then(() => console.log('connected'))
 *    .catch((err) => console.error(err))
 */
function connect(options = {}, callback) {
    return new Promise((resolve, reject) => {
        const config = Object.assign({}, defaults, options);
        console.log('[connect] Connecting', JSON.stringify(config));
        exports.asteroid = new asteroid_1.default(config.host, config.useSsl);
        // Asteroid ^v2 interface...
        /*
        asteroid = new Asteroid({
          endpoint: `ws://${options.host}/websocket`,
          SocketConstructor: WebSocket
        })
        */
        setupMethodCache(exports.asteroid); // init instance for later caching method calls
        exports.asteroid.on('connected', () => exports.events.emit('connected'));
        exports.asteroid.on('reconnected', () => exports.events.emit('reconnected'));
        // let cancelled = false
        const rejectionTimeout = setTimeout(function () {
            console.log(`[connect] Timeout (${config.timeout})`);
            // cancelled = true
            const err = new Error('Asteroid connection timeout');
            callback ? callback(err, exports.asteroid) : reject(err);
        }, config.timeout);
        exports.events.once('connected', () => {
            console.log('[connect] Connected');
            // if (cancelled) return asteroid.ddp.disconnect() // cancel if already rejected
            clearTimeout(rejectionTimeout);
            if (callback)
                callback(null, exports.asteroid);
            resolve(exports.asteroid);
        });
    });
}
exports.connect = connect;
/**
 * Remove all active subscriptions, logout and disconnect from Rocket.Chat
 */
function disconnect() {
    console.log('Unsubscribing, logging out, disconnecting');
    unsubscribeAll();
    return logout().then(() => Promise.resolve()); // asteroid.disconnect()) // v2 only
}
exports.disconnect = disconnect;
// ASYNC AND CACHE METHOD UTILS
// -----------------------------------------------------------------------------
/**
 * Setup method cache configs from env or defaults, before they are called.
 * @param asteroid The asteroid instance to cache method calls
 */
function setupMethodCache(asteroid) {
    methodCache.use(asteroid);
    methodCache.create('getRoomIdByNameOrId', {
        max: parseInt(process.env.ROOM_CACHE_SIZE || '10', 10),
        maxAge: 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10)
    }),
        methodCache.create('getRoomNameById', {
            max: parseInt(process.env.ROOM_CACHE_SIZE || '10', 10),
            maxAge: 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10)
        });
    methodCache.create('createDirectMessage', {
        max: parseInt(process.env.DM_ROOM_CACHE_SIZE || '10', 10),
        maxAge: 1000 * parseInt(process.env.DM_ROOM_CACHE_MAX_AGE || '100', 10)
    });
}
/**
 * Wraps method calls to ensure they return a Promise with caught exceptions.
 * @param method The Rocket.Chat server method, to call through Asteroid
 * @param params Single or array of parameters of the method to call
 */
function asyncCall(method, params) {
    if (!Array.isArray(params))
        params = [params]; // cast to array for apply
    console.log(`[${method}] Calling (async): ${JSON.stringify(params)}`);
    return Promise.resolve(exports.asteroid.apply(method, params).result)
        .catch((err) => {
        console.error(`[${method}] Error:`, err);
        throw err; // throw after log to stop async chain
    })
        .then((result) => {
        (result)
            ? console.log(`[${method}] Success: ${JSON.stringify(result)}`)
            : console.log(`[${method}] Success`);
        return result;
    });
}
exports.asyncCall = asyncCall;
/**
 * Call a method as async via Asteroid, or through cache if one is created.
 * @param name The Rocket.Chat server method to call
 * @param params Single or array of parameters of the method to call
 */
function callMethod(name, params) {
    return (methodCache.has(name))
        ? asyncCall(name, params)
        : cacheCall(name, params);
}
exports.callMethod = callMethod;
/**
 * Wraps Asteroid method calls, passed through method cache if cache is valid.
 * @param method The Rocket.Chat server method, to call through Asteroid
 * @param key Single string parameters only, required to use as cache key
 */
function cacheCall(method, key) {
    return methodCache.call(method, key)
        .catch((err) => {
        console.error(`[${method}] Error:`, err);
        throw err; // throw after log to stop async chain
    })
        .then((result) => {
        (result)
            ? console.log(`[${method}] Success: ${JSON.stringify(result)}`)
            : console.log(`[${method}] Success`);
        return result;
    });
}
exports.cacheCall = cacheCall;
// LOGIN AND SUBSCRIBE TO ROOMS
// -----------------------------------------------------------------------------
/** Login to Rocket.Chat via Asteroid */
function login(credentials) {
    console.log(`[login] Logging in ${credentials.username || credentials.email}`);
    let login;
    if (process.env.ROCKETCHAT_AUTH === 'ldap') {
        const params = [
            credentials.username,
            credentials.password,
            { ldap: true, ldapOptions: {} }
        ];
        login = exports.asteroid.loginWithLDAP(...params);
    }
    else {
        const usernameOrEmail = credentials.username || credentials.email || 'bot';
        login = exports.asteroid.loginWithPassword(usernameOrEmail, credentials.password);
    }
    return login.catch((err) => {
        console.error('[login] Error:', err);
        throw err; // throw after log to stop async chain
    });
}
exports.login = login;
/** Logout of Rocket.Chat via Asteroid */
function logout() {
    return exports.asteroid.logout().catch((err) => {
        console.error('[Logout] Error:', err);
        throw err; // throw after log to stop async chain
    });
}
exports.logout = logout;
/**
 * Subscribe to Meteor subscription
 * Resolves with subscription (added to array), with ID property
 * @todo - 3rd param of asteroid.subscribe is deprecated in Rocket.Chat?
 */
function subscribe(topic, roomId) {
    return new Promise((resolve, reject) => {
        console.log(`[subscribe] Preparing subscription: ${topic}: ${roomId}`);
        const subscription = exports.asteroid.subscribe(topic, roomId, true);
        exports.subscriptions.push(subscription);
        return subscription.ready.then((id) => {
            console.log(`[subscribe] Stream ready: ${id}`);
            resolve(subscription);
        });
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
    });
}
exports.subscribe = subscribe;
/** Unsubscribe from Meteor subscription */
function unsubscribe(subscription) {
    const index = exports.subscriptions.indexOf(subscription);
    if (index === -1)
        return;
    subscription.stop();
    // asteroid.unsubscribe(subscription.id) // v2
    exports.subscriptions.splice(index, 1); // remove from collection
    console.log(`[${subscription.id}] Unsubscribed`);
}
exports.unsubscribe = unsubscribe;
/** Unsubscribe from all subscriptions in collection */
function unsubscribeAll() {
    exports.subscriptions.map((s) => unsubscribe(s));
}
exports.unsubscribeAll = unsubscribeAll;
/**
 * Begin subscription to room events for user.
 * Older adapters used an option for this method but it was always the default.
 */
function subscribeToMessages() {
    return subscribe(_messageCollectionName, _messageStreamName)
        .then((subscription) => {
        exports.messages = exports.asteroid.getCollection(_messageCollectionName);
        // v2
        // messages = asteroid.collections.get(_messageCollectionName) || Map()
        return subscription;
    });
}
exports.subscribeToMessages = subscribeToMessages;
function reactToMessages(callback) {
    console.log(`[reactive] Listening for change events in collection ${exports.messages.name}`);
    exports.messages.reactiveQuery({}).on('change', (_id) => {
        const changedMessageQuery = exports.messages.reactiveQuery({ _id });
        if (changedMessageQuery.result && changedMessageQuery.result.length > 0) {
            const changedMessage = changedMessageQuery.result[0];
            if (changedMessage.args !== null) {
                console.log(`[received] Message in room ${changedMessage.args[0].rid}`);
                callback(null, changedMessage.args[0], changedMessage.args[1]);
            }
            else {
                callback(new Error('Received message without args'));
            }
        }
        else {
            callback(new Error(`[change] Reactive query at ID ${_id} without results`));
        }
    });
}
exports.reactToMessages = reactToMessages;
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
function getRoomId(name) {
    return cacheCall('getRoomIdByNameOrId', name);
}
exports.getRoomId = getRoomId;
/** Get name for a room by ID. */
function getRoomName(id) {
    return cacheCall('getRoomNameById', id);
}
exports.getRoomName = getRoomName;
/**
 * Get ID for a DM room by its recipient's name.
 * Will create a DM (with the bot) if it doesn't exist already.
 */
function getDirectMessageRoomId(username) {
    return cacheCall('createDirectMessage', username);
}
exports.getDirectMessageRoomId = getDirectMessageRoomId;
/** Join the bot into a room by its name or ID */
function joinRoom(room) {
    return getRoomId(room).then((roomId) => asyncCall('joinRoom', roomId));
}
exports.joinRoom = joinRoom;
/** Join a set of rooms by array of names or IDs */
function joinRooms(rooms) {
    return Promise.all(rooms.map((room) => joinRoom(room)));
}
exports.joinRooms = joinRooms;
/**
 * Structure message content, optionally addressing to room ID.
 * Accepts message text string or a structured message object.
 */
function prepareMessage(content, roomId) {
    const message = new message_1.Message(content);
    if (roomId)
        message.setRoomId(roomId);
    return message;
}
exports.prepareMessage = prepareMessage;
/**
 * Prepare and send message/s to specified room ID.
 * Accepts message text string, array of strings or a structured message object.
 * Will create one or more send calls collected into promise.
 */
function sendMessageByRoomId(content, roomId) {
    let messages = [];
    if (Array.isArray(content)) {
        content.forEach((msg) => messages.push(prepareMessage(msg, roomId)));
    }
    else {
        messages.push(prepareMessage(content));
    }
    return Promise.all(messages.map((message) => sendMessage(message)));
}
exports.sendMessageByRoomId = sendMessageByRoomId;
/**
 * Prepare and send message/s to specified room name (or ID).
 * Accepts message text string, array of strings or a structured message object.
 * Will create one or more send calls collected into promise.
 */
function sendMessageByRoom(content, room) {
    return getRoomId(room).then((roomId) => sendMessageByRoomId(content, roomId));
}
exports.sendMessageByRoom = sendMessageByRoom;
/**
 * Send a prepared message object (with pre-defined room ID).
 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
 * In the Hubot adapter, this method accepted a room ID, which was not semantic,
 * such usage should be replaced by `sendMessageByRoom(content, roomId)`
 */
function sendMessage(message, roomId) {
    if (roomId)
        return sendMessageByRoomId(message, roomId);
    return asyncCall('sendMessage', message);
}
exports.sendMessage = sendMessage;
/**
 * Legacy method for older adapters - sendMessage now accepts all properties
 * @deprecated since 0.0.0
 */
function customMessage(message) {
    return sendMessage(message);
}
exports.customMessage = customMessage;
//# sourceMappingURL=driver.js.map