"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = __importDefault(require("./api"));
/** Defaults for user queries */
exports.userFields = { name: 1, username: 1, status: 1, type: 1 };
/** Query helpers for user collection requests */
class ApiClient extends api_1.default {
    get users() {
        return {
            all(fields = exports.userFields) { return this.get('users.list', { fields }).then((r) => r.users); },
            allNames() { return this.get('users.list', { fields: { 'username': 1 } }).then((r) => r.users.map((u) => u.username)); },
            allIDs() { return this.get('users.list', { fields: { '_id': 1 } }).then((r) => r.users.map((u) => u._id)); },
            online(fields = exports.userFields) { return this.get('users.list', { fields, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users); },
            onlineNames() { return this.get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u) => u.username)); },
            onlineIds() { return this.get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u) => u._id)); }
        };
    }
    // editMessage(message: IMessage) chat.update
    joinRoom(rid) { return this.get('channel.join', { rid }, true); }
    setReaction(emoji, messageId) { return this.get('chat.react', { emoji, messageId }, true); }
    info() { return this.get('info', {}, true); }
    sendMessage(message) { return {}; }
    getRoomId(name) { return this.get('chat.find', { name }, true); }
    getRoomName(rid) { return this.get('chat.find', { rid }, true); }
    createDirectMessage(username) { return this.get('im.create', { username }, true); }
    /**
     * Edit an existing message, replacing any attributes with those provided.
     * The given message object should have the ID of an existing message.
     */
    editMessage(message) {
        return this.post('chat.update', message);
    }
}
exports.default = ApiClient;
//# sourceMappingURL=Client.js.map