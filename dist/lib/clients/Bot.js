"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const log_1 = require("../log");
const Rocketchat_1 = __importDefault(require("./Rocketchat"));
const MY_MESSAGES = '__my_messages__';
const TOPIC_MESSAGES = 'stream-room-messages';
class BotClient extends Rocketchat_1.default {
    constructor(_a) {
        var { integrationId } = _a, config = __rest(_a, ["integrationId"]);
        super(config);
        this.lastReadTime = new Date(-8640000000000000);
        this.joinedIds = [];
        this.messages = null;
        this.integrationId = integrationId;
    }
    login(credentials) {
        const _super = name => super[name];
        return __awaiter(this, void 0, void 0, function* () {
            yield _super("login").call(this, credentials);
            return this.currentLogin && (yield this.socket).login({ token: this.currentLogin.authToken }, {});
        });
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
    connect(options, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield (yield this.socket).connect(options);
                if (callback) {
                    callback(null, result);
                }
                return result;
            }
            catch (error) {
                if (callback) {
                    callback(error, null);
                    return Promise.reject(error);
                }
            }
        });
    }
    /** Begin subscription to user's "global" message stream. Will only allow one. */
    subscribeToMessages() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.messages) {
                this.messages = yield this.subscribe(TOPIC_MESSAGES, MY_MESSAGES);
            }
            return this.messages;
        });
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
    reactToMessages(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            const handler = (e) => {
                try {
                    const message = e.fields.args[0];
                    if (!message || !message._id) {
                        callback(new Error('Message handler fired on event without message or meta data'));
                    }
                    else {
                        callback(null, message, {});
                    }
                }
                catch (err) {
                    this.logger.error(`[driver] Message handler err: ${err.message}`);
                    callback(err);
                }
            };
            this.messages = yield this.subscribeToMessages();
            this.messages.onEvent(handler);
            this.logger.info(`[driver] Added event handler for ${this.messages.name} subscription`);
        });
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
    respondToMessages(callback, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = Object.assign({}, this.config, options);
            // Join configured rooms if they haven't been already, unless listening to all
            // public rooms, in which case it doesn't matter
            if (!config.allPublic && this.joinedIds.length === 0 && config.rooms && config.rooms.length > 0) {
                try {
                    yield this.joinRooms(config.rooms);
                }
                catch (err) {
                    this.logger.error(`[driver] Failed to join configured rooms (${config.rooms.join(', ')}): ${err.message}`);
                }
            }
            this.lastReadTime = new Date(); // init before any message read
            return this.reactToMessages((err, message, meta) => __awaiter(this, void 0, void 0, function* () {
                if (err) {
                    log_1.logger.error(`[driver] Unable to receive: ${err.message}`);
                    return callback(err); // bubble errors back to adapter
                }
                if (typeof message === 'undefined' || typeof meta === 'undefined') {
                    log_1.logger.error(`[driver] Message or meta undefined`);
                    return callback(err);
                }
                // Ignore bot's own messages
                if (message.u && message.u._id === this.userId)
                    return;
                // Ignore DMs unless configured not to
                const isDM = meta.roomType === 'd' || true;
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
                let currentReadTime = (message.ts) ? new Date(message.ts.$date) : new Date();
                // Ignore edited messages if configured to
                if (!config.edited && typeof message.editedAt !== 'undefined')
                    return;
                // Ignore messages in stream that aren't new
                if (currentReadTime <= this.lastReadTime)
                    return;
                // At this point, message has passed checks and can be responded to
                const username = (message.u) ? message.u.username : 'unknown';
                this.logger.info(`[driver] Message ${message._id} from ${username}`);
                this.lastReadTime = currentReadTime;
                callback(null, message, meta);
            }));
        });
    }
    /** Get ID for a room by name (or ID). */
    getRoomId(name) {
        return this.getRoomIdByNameOrId(name);
    }
    /** Get name for a room by ID. */
    getRoomName(rid) {
        return super.getRoomNameById(rid);
    }
    /** Join the bot into a room by its name or ID */
    joinRoom(room) {
        const _super = name => super[name];
        return __awaiter(this, void 0, void 0, function* () {
            const roomId = yield this.getRoomId(room);
            const joinedIndex = this.joinedIds.indexOf(room);
            if (joinedIndex !== -1) {
                log_1.logger.error(`[driver] Join room failed, already joined`);
                throw new Error(`[driver] Join room failed, already joined`);
            }
            yield _super("joinRoom").call(this, roomId);
            this.joinedIds.push(roomId);
            return roomId;
        });
    }
    /** Exit a room the bot has joined */
    leaveRoom(room) {
        return __awaiter(this, void 0, void 0, function* () {
            let roomId = yield this.getRoomId(room);
            let joinedIndex = this.joinedIds.indexOf(room);
            if (joinedIndex === -1) {
                this.logger.error(`[driver] Leave room failed, bot has not joined ${room}`);
                throw new Error(`[driver] Leave room failed, bot has not joined ${room}`);
            }
            yield this.leaveRoom(roomId);
            delete this.joinedIds[joinedIndex];
            return roomId;
        });
    }
    /** Join a set of rooms by array of names or IDs */
    joinRooms(rooms) {
        return Promise.all(rooms.map((rid) => this.joinRoom(rid)));
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
    sendToRoomId(content, roomId) {
        if (Array.isArray(content)) {
            return Promise.all(content.map((text) => {
                return this.sendMessage(this.prepareMessage(text, roomId));
            }));
        }
        return this.sendMessage(this.prepareMessage(content, roomId));
    }
    /**
     * Prepare and send string/s to specified room name (or ID).
     * @param content Accepts message text string or array of strings.
     * @param room    A name (or ID) to resolve as ID to use in send.
     */
    sendToRoom(content, room) {
        return this.getRoomId(room)
            .then((roomId) => this.sendToRoomId(content, roomId));
    }
    /**
     * Prepare and send string/s to a user in a DM.
     * @param content   Accepts message text string or array of strings.
     * @param username  Name to create (or get) DM for room ID to use in send.
     */
    sendDirectToUser(content, username) {
        return this.getDirectMessageRoomId(username)
            .then((rid) => this.sendToRoomId(content, rid));
    }
    /**
     * Get ID for a DM room by its recipient's name.
     * Will create a DM (with the bot) if it doesn't exist already.
     * @todo test why create resolves with object instead of simply ID
     */
    getDirectMessageRoomId(username) {
        return this.createDirectMessage(username).then((DM) => {
            return DM._id;
        });
    }
    getRoomNameById(rid) {
        return this.getRoomName(rid);
    }
}
exports.default = BotClient;
//# sourceMappingURL=Bot.js.map