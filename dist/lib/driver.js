"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const asteroid_1 = __importDefault(require("asteroid"));
const settings = __importStar(require("./settings"));
const methodCache = __importStar(require("./methodCache"));
const message_1 = require("./message");
const log_1 = require("./log");
/** Collection names */
const _messageCollectionName = 'stream-room-messages';
const _messageStreamName = '__my_messages__';
/**
 * The integration property is applied as an ID on sent messages `bot.i` param
 * Should be replaced when connection is invoked by a package using the SDK
 * e.g. The Hubot adapter would pass its integration ID with credentials, like:
 */
exports.integrationId = settings.integrationId;
/**
 * Event Emitter for listening to connection.
 * @example
 *  import { driver } from '@rocket.chat/sdk'
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
 * Array of joined room IDs (for reactive queries)
 */
exports.joinedIds = [];
/**
 * Allow override of default logging with adapter's log instance
 */
function useLog(externalLog) {
    log_1.replaceLog(externalLog);
}
exports.useLog = useLog;
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
function connect(options = {}, callback) {
    return new Promise((resolve, reject) => {
        const config = Object.assign({}, settings, options); // override defaults
        config.host = config.host.replace(/(^\w+:|^)\/\//, '');
        log_1.logger.info('[connect] Connecting', config);
        exports.asteroid = new asteroid_1.default(config.host, config.useSsl);
        setupMethodCache(exports.asteroid); // init instance for later caching method calls
        exports.asteroid.on('connected', () => {
            exports.asteroid.resumeLoginPromise.catch(function () {
                // pass
            });
            exports.events.emit('connected');
        });
        exports.asteroid.on('reconnected', () => exports.events.emit('reconnected'));
        let cancelled = false;
        const rejectionTimeout = setTimeout(function () {
            log_1.logger.info(`[connect] Timeout (${config.timeout})`);
            const err = new Error('Asteroid connection timeout');
            cancelled = true;
            exports.events.removeAllListeners('connected');
            callback ? callback(err, exports.asteroid) : reject(err);
        }, config.timeout);
        // if to avoid condition where timeout happens before listener to 'connected' is added
        // and this listener is not removed (because it was added after the removal)
        if (!cancelled) {
            exports.events.once('connected', () => {
                log_1.logger.info('[connect] Connected');
                // if (cancelled) return asteroid.ddp.disconnect() // cancel if already rejected
                clearTimeout(rejectionTimeout);
                if (callback)
                    callback(null, exports.asteroid);
                resolve(exports.asteroid);
            });
        }
    });
}
exports.connect = connect;
/** Remove all active subscriptions, logout and disconnect from Rocket.Chat */
function disconnect() {
    log_1.logger.info('Unsubscribing, logging out, disconnecting');
    unsubscribeAll();
    return logout()
        .then(() => Promise.resolve());
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
        max: settings.roomCacheMaxSize,
        maxAge: settings.roomCacheMaxAge
    }),
        methodCache.create('getRoomNameById', {
            max: settings.roomCacheMaxSize,
            maxAge: settings.roomCacheMaxAge
        });
    methodCache.create('createDirectMessage', {
        max: settings.dmCacheMaxSize,
        maxAge: settings.dmCacheMaxAge
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
    log_1.logger.info(`[${method}] Calling (async): ${JSON.stringify(params)}`);
    return Promise.resolve(exports.asteroid.apply(method, params).result)
        .catch((err) => {
        log_1.logger.error(`[${method}] Error:`, err);
        throw err; // throw after log to stop async chain
    })
        .then((result) => {
        (result)
            ? log_1.logger.debug(`[${method}] Success: ${JSON.stringify(result)}`)
            : log_1.logger.debug(`[${method}] Success`);
        return result;
    });
}
exports.asyncCall = asyncCall;
/**
 * Call a method as async via Asteroid, or through cache if one is created.
 * If the method doesn't have or need parameters, it can't use them for caching
 * so it will always call asynchronously.
 * @param name The Rocket.Chat server method to call
 * @param params Single or array of parameters of the method to call
 */
function callMethod(name, params) {
    return (methodCache.has(name) || typeof params === 'undefined')
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
        log_1.logger.error(`[${method}] Error:`, err);
        throw err; // throw after log to stop async chain
    })
        .then((result) => {
        (result)
            ? log_1.logger.debug(`[${method}] Success: ${JSON.stringify(result)}`)
            : log_1.logger.debug(`[${method}] Success`);
        return result;
    });
}
exports.cacheCall = cacheCall;
// LOGIN AND SUBSCRIBE TO ROOMS
// -----------------------------------------------------------------------------
/** Login to Rocket.Chat via Asteroid */
function login(credentials = {
    username: settings.username,
    password: settings.password,
    ldap: settings.ldap
}) {
    let login;
    // if (credentials.ldap) {
    //   logger.info(`[login] Logging in ${credentials.username} with LDAP`)
    //   login = asteroid.loginWithLDAP(
    //     credentials.email || credentials.username,
    //     credentials.password,
    //     { ldap: true, ldapOptions: credentials.ldapOptions || {} }
    //   )
    // } else {
    log_1.logger.info(`[login] Logging in ${credentials.username}`);
    login = exports.asteroid.loginWithPassword(credentials.email || credentials.username, credentials.password);
    // }
    return login
        .then((loggedInUserId) => {
        exports.userId = loggedInUserId;
        return loggedInUserId;
    })
        .catch((err) => {
        log_1.logger.info('[login] Error:', err);
        throw err; // throw after log to stop async chain
    });
}
exports.login = login;
/** Logout of Rocket.Chat via Asteroid */
function logout() {
    return exports.asteroid.logout()
        .catch((err) => {
        log_1.logger.error('[Logout] Error:', err);
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
        log_1.logger.info(`[subscribe] Preparing subscription: ${topic}: ${roomId}`);
        const subscription = exports.asteroid.subscribe(topic, roomId, true);
        exports.subscriptions.push(subscription);
        return subscription.ready
            .then((id) => {
            log_1.logger.info(`[subscribe] Stream ready: ${id}`);
            resolve(subscription);
        });
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
    log_1.logger.info(`[${subscription.id}] Unsubscribed`);
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
        return subscription;
    });
}
exports.subscribeToMessages = subscribeToMessages;
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
function reactToMessages(callback) {
    log_1.logger.info(`[reactive] Listening for change events in collection ${exports.messages.name}`);
    exports.messages.reactiveQuery({}).on('change', (_id) => {
        const changedMessageQuery = exports.messages.reactiveQuery({ _id });
        if (changedMessageQuery.result && changedMessageQuery.result.length > 0) {
            const changedMessage = changedMessageQuery.result[0];
            if (Array.isArray(changedMessage.args)) {
                log_1.logger.info(`[received] Message in room ${changedMessage.args[0].rid}`);
                callback(null, changedMessage.args[0], changedMessage.args[1]);
            }
            else {
                log_1.logger.debug('[received] Update without message args');
            }
        }
        else {
            log_1.logger.debug('[received] Reactive query at ID ${ _id } without results');
        }
    });
}
exports.reactToMessages = reactToMessages;
/**
 * Proxy for `reactToMessages` with some filtering of messages based on config.
 *
 * @param callback Function called after filters run on subscription events.
 *  - Uses error-first callback pattern
 *  - Second argument is the changed item
 *  - Third argument is additional attributes, such as `roomType`
 * @param options Sets filters for different event/message types.
 */
function respondToMessages(callback, options = {}) {
    const config = Object.assign({}, settings, options);
    // return value, may be replaced by async ops
    let promise = Promise.resolve();
    // Join configured rooms if they haven't been already, unless listening to all
    // public rooms, in which case it doesn't matter
    if (!config.allPublic &&
        exports.joinedIds.length === 0 &&
        config.rooms &&
        config.rooms.length > 0) {
        promise = joinRooms(config.rooms)
            .catch((err) => {
            log_1.logger.error(`[joinRooms] Failed to join configured rooms (${config.rooms.join(', ')}): ${err.message}`);
        });
    }
    exports.lastReadTime = new Date(); // init before any message read
    reactToMessages((err, message, meta) => __awaiter(this, void 0, void 0, function* () {
        if (err) {
            log_1.logger.error(`[received] Unable to receive: ${err.message}`);
            callback(err); // bubble errors back to adapter
        }
        // Ignore bot's own messages
        if (message.u._id === exports.userId)
            return;
        // Ignore DMs unless configured not to
        const isDM = meta.roomType === 'd';
        if (isDM && !config.dm)
            return;
        // Ignore Livechat unless configured not to
        const isLC = meta.roomType === 'l';
        if (isLC && !config.livechat)
            return;
        // Ignore messages in un-joined public rooms unless configured not to
        if (!config.allPublic && !isDM && !meta.roomParticipant)
            return;
        // Set current time for comparison to incoming
        let currentReadTime = new Date(message.ts.$date);
        // Ignore edited messages if configured to
        if (!config.edited && message.editedAt)
            return;
        // Set read time as time of edit, if message is edited
        if (message.editedAt)
            currentReadTime = new Date(message.editedAt.$date);
        // Ignore messages in stream that aren't new
        if (currentReadTime <= exports.lastReadTime)
            return;
        // At this point, message has passed checks and can be responded to
        log_1.logger.info(`[received] Message ${message._id} from ${message.u.username}`);
        exports.lastReadTime = currentReadTime;
        // Processing completed, call callback to respond to message
        callback(null, message, meta);
    }));
    return promise;
}
exports.respondToMessages = respondToMessages;
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
 * @todo test why create resolves with object instead of simply ID
 */
function getDirectMessageRoomId(username) {
    return cacheCall('createDirectMessage', username)
        .then((DM) => DM.rid);
}
exports.getDirectMessageRoomId = getDirectMessageRoomId;
/** Join the bot into a room by its name or ID */
function joinRoom(room) {
    return __awaiter(this, void 0, void 0, function* () {
        let roomId = yield getRoomId(room);
        let joinedIndex = exports.joinedIds.indexOf(room);
        if (joinedIndex !== -1) {
            log_1.logger.error(`[joinRoom] room was already joined`);
        }
        else {
            yield asyncCall('joinRoom', roomId);
            exports.joinedIds.push(roomId);
        }
    });
}
exports.joinRoom = joinRoom;
/** Exit a room the bot has joined */
function leaveRoom(room) {
    return __awaiter(this, void 0, void 0, function* () {
        let roomId = yield getRoomId(room);
        let joinedIndex = exports.joinedIds.indexOf(room);
        if (joinedIndex === -1) {
            log_1.logger.error(`[leaveRoom] failed because bot has not joined ${room}`);
        }
        else {
            yield asyncCall('leaveRoom', roomId);
            delete exports.joinedIds[joinedIndex];
        }
    });
}
exports.leaveRoom = leaveRoom;
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
    const message = new message_1.Message(content, exports.integrationId);
    if (roomId)
        message.setRoomId(roomId);
    return message;
}
exports.prepareMessage = prepareMessage;
/**
 * Send a prepared message object (with pre-defined room ID).
 * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
 */
function sendMessage(message) {
    return asyncCall('sendMessage', message);
}
exports.sendMessage = sendMessage;
/**
 * Prepare and send string/s to specified room ID.
 * @param content Accepts message text string or array of strings.
 * @param roomId  ID of the target room to use in send.
 * @todo Returning one or many gets complicated with type checking not allowing
 *       use of a property because result may be array, when you know it's not.
 *       Solution would probably be to always return an array, even for single
 *       send. This would be a breaking change, should hold until major version.
 */
function sendToRoomId(content, roomId) {
    if (!Array.isArray(content)) {
        return sendMessage(prepareMessage(content, roomId));
    }
    else {
        return Promise.all(content.map((text) => {
            return sendMessage(prepareMessage(text, roomId));
        }));
    }
}
exports.sendToRoomId = sendToRoomId;
/**
 * Prepare and send string/s to specified room name (or ID).
 * @param content Accepts message text string or array of strings.
 * @param room    A name (or ID) to resolve as ID to use in send.
 */
function sendToRoom(content, room) {
    return getRoomId(room)
        .then((roomId) => sendToRoomId(content, roomId));
}
exports.sendToRoom = sendToRoom;
/**
 * Prepare and send string/s to a user in a DM.
 * @param content   Accepts message text string or array of strings.
 * @param username  Name to create (or get) DM for room ID to use in send.
 */
function sendDirectToUser(content, username) {
    return getDirectMessageRoomId(username)
        .then((rid) => sendToRoomId(content, rid));
}
exports.sendDirectToUser = sendDirectToUser;
/**
 * Edit an existing message, replacing any attributes with those provided.
 * The given message object should have the ID of an existing message.
 */
function editMessage(message) {
    return asyncCall('updateMessage', message);
}
exports.editMessage = editMessage;
/**
 * Send a reaction to an existing message. Simple proxy for method call.
 * @param emoji     Accepts string like `:thumbsup:` to add 👍 reaction
 * @param messageId ID for a previously sent message
 */
function setReaction(emoji, messageId) {
    return asyncCall('setReaction', [emoji, messageId]);
}
exports.setReaction = setReaction;
//# sourceMappingURL=driver.js.map