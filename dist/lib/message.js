"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Rocket.Chat message class.
 * Sets integration param to allow tracing source of automated sends.
 * @param content Accepts message text or a preformed message object
 * @todo Potential for SDK usage that isn't bots, bot prop should be optional?
 */
class Message {
    constructor(content, integrationId) {
        if (typeof content === 'string')
            this.msg = content;
        else
            Object.assign(this, content);
        this.bot = { i: integrationId };
    }
    setRoomId(roomId) {
        this.rid = roomId;
        return this;
    }
}
exports.Message = Message;
//# sourceMappingURL=message.js.map