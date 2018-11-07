"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Rocket.Chat message class.
 * Sets integration param to allow tracing source of automated sends.
 * @param content Accepts message text or a preformed message object
 * @todo Potential for SDK usage that isn't bots, bot prop should be optional?
 */
class Message {
    constructor(content, _a) {
        var { integrationId } = _a, others = __rest(_a, ["integrationId"]);
        if (typeof content === 'string') {
            Object.assign(this, { msg: content }, others);
        }
        else {
            Object.assign(this, content, others);
        }
        if (integrationId) {
            this.bot = { i: integrationId };
        }
    }
}
exports.Message = Message;
//# sourceMappingURL=message.js.map