import { IMessage } from '../config/messageInterfaces'

// Message class declaration implicitly implements interface
// https://github.com/Microsoft/TypeScript/issues/340
export interface Message extends IMessage {}

/**
 * Rocket.Chat message class.
 * Sets integration param to allow tracing source of automated sends.
 * @param content Accepts message text or a preformed message object
 * @todo Potential for SDK usage that isn't bots, bot prop should be optional?
 */
export class Message {
  constructor (content: string | IMessage, integrationId: string) {
    if (typeof content === 'string') this.msg = content
    else Object.assign(this, content)
    this.bot = { i: integrationId }
  }
  setRoomId (roomId: string): Message {
    this.rid = roomId
    return this
  }
}
