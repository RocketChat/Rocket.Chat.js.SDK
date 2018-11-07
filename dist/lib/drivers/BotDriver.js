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
const Client_1 = __importDefault(require("./Client"));
const MY_MESSAGES = '__my_messages__';
class BotDriver extends Client_1.default {
    constructor(_a) {
        var { integrationId } = _a, config = __rest(_a, ["integrationId"]);
        super(config);
        this.lastReadTime = new Date(-8640000000000000);
        this.joinedIds = [];
        this.messages = null;
        this.integrationId = integrationId;
    }
    connect(options, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield this.socket.connect(options);
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
    subscribeToMessages() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.messages) {
                this.messages = yield this.subscribe('stream-room-messages', MY_MESSAGES);
            }
            return this.messages;
        });
    }
    reactToMessages(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            const handler = (e) => {
                try {
                    const message = e.fields.args[0];
                    const meta = e.fields.args[1];
                    if (!message || !meta || !message._id || !meta.roomType) {
                        callback(new Error('Message handler fired on event without message or meta data'));
                    }
                    else {
                        callback(null, message, meta);
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
    joinRooms(rooms) {
        return Promise.all(rooms.map((rid) => this.joinRoom(rid)));
    }
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
                let currentReadTime = (message.ts) ? new Date(message.ts.$date) : new Date();
                // Ignore edited messages if configured to
                if (!config.edited && typeof message.editedAt !== 'undefined')
                    return;
                // Ignore messages in stream that aren't new
                if (currentReadTime <= this.lastReadTime)
                    return;
                // At this point, message has passed checks and can be responded to
                const username = (message.u) ? message.u.username : 'unknown';
                log_1.logger.info(`[driver] Message ${message._id} from ${username}`);
                this.lastReadTime = currentReadTime;
                callback(null, message, meta);
            }));
        });
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
        return this.createDirectMessage(username).then((DM) => DM.rid);
    }
    getRoomNameById(rid) {
        return this.getRoomName(rid);
    }
}
exports.default = BotDriver;
//# sourceMappingURL=BotDriver.js.map