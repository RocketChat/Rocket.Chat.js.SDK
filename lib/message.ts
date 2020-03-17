import { IMessage } from '../interfaces'

// Message class declaration implicitly implements interface
// https://github.com/Microsoft/TypeScript/issues/340
export interface Message extends IMessage {}

/**
 * Rocket.Chat message class.
 * Sets integration param to allow tracing source of automated sends.
 * @param content Accepts message text or a preformed message object
 * @todo Potential for SDK usage that isn't bots, bot prop should be optional?
 */
export class Message implements IMessage {
  constructor (content: string | IMessage, { integrationId, ...others }: any) {
    if (typeof content === 'string') {
      Object.assign(this, { msg: content }, others)
    } else {
      Object.assign(this, content, others)
    }
    if (integrationId) {
      this.bot = { i: integrationId }
    }
  }
}
