"use strict";
/**
    * @module ApiRocketChat
    * Provides a client for handling requests with Rocket.Chat's REST API
    */
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
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = __importDefault(require("./api"));
/** Defaults for user queries */
exports.userFields = { name: 1, username: 1, status: 1, type: 1 };
/** Query helpers for user collection requests */
class ApiRocketChat extends api_1.default {
    get users() {
        const self = this;
        return {
            all(fields = exports.userFields) { return self.get('users.list', { fields }).then((r) => r.users); },
            allNames() { return self.get('users.list', { fields: { 'username': 1 } }).then((r) => r.users.map((u) => u.username)); },
            allIDs() { return self.get('users.list', { fields: { '_id': 1 } }).then((r) => r.users.map((u) => u._id)); },
            online(fields = exports.userFields) { return self.get('users.list', { fields, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users); },
            onlineNames() { return self.get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u) => u.username)); },
            onlineIds() { return self.get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u) => u._id)); }
        };
    }
    // editMessage(message: IMessage) chat.update
    joinRoom(rid) { return this.post('channels.join', { roomId: rid }, true); }
    /** Exit a room the bot has joined */
    leaveRoom(rid) {
        return this.post('rooms.leave', { rid }).then(() => rid);
    }
    info() { return this.get('info', {}, true); }
    /**
     * Send a prepared message object (with pre-defined room ID).
     * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
     */
    sendMessage(message) { return this.post('chat.sendMessage', { message }); }
    getRoomIdByNameOrId(name) { return this.get('chat.getRoomIdByNameOrId', { name }, true); }
    getRoomNameById(name) { return this.getRoomName(name); }
    getRoomName(rid) { return this.get('chat.getRoomNameById', { rid }, true); }
    getRoomId(name) { return this.get('chat.find', { name }, true); }
    createDirectMessage(username) {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.post('im.create', { username }, true)).room; });
    }
    /**
     * Edit an existing message, replacing any attributes with those provided.
     * The given message object should have the ID of an existing message.
     */
    editMessage(message) {
        return this.post('chat.update', message);
    }
    /**
     * Send a reaction to an existing message. Simple proxy for method call.
     * @param emoji     Accepts string like `:thumbsup:` to add 👍 reaction
     * @param messageId ID for a previously sent message
     */
    setReaction(emoji, messageId) { return this.get('chat.react', { emoji, messageId }, true); }
}
exports.default = ApiRocketChat;
//# sourceMappingURL=RocketChat.js.map