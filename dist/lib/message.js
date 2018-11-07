/**
 * Rocket.Chat message class.
 * Sets integration param to allow tracing source of automated sends.
 * @param content Accepts message text or a preformed message object
 * @todo Potential for SDK usage that isn't bots, bot prop should be optional?
 */
export class Message {
    constructor(content, { integrationId, ...others }) {
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
//# sourceMappingURL=message.js.map