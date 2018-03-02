"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Rocket.Chat message class.
 * @param content Accepts message text or a preformed message object
 */
class Message {
    constructor(content) {
        this.bot = true; // all messages are from a bot
        if (typeof content === 'string')
            this.msg = content;
        else
            Object.assign(this, content);
    }
    setRoomId(roomId) {
        this.rid = roomId;
        return this;
    }
}
exports.Message = Message;
//# sourceMappingURL=message.js.map