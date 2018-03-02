import { IMessage } from '../config/messageInterfaces'

// Message class declaration implicitly implements interface
// https://github.com/Microsoft/TypeScript/issues/340
export interface Message extends IMessage {}

/**
 * Rocket.Chat message class.
 * @param content Accepts message text or a preformed message object
 */
export class Message {
  public bot = true // all messages are from a bot
  constructor (content: string | IMessage) {
    if (typeof content === 'string') this.msg = content
    else Object.assign(this, content)
  }
  setRoomId (roomId: string): Message {
    this.rid = roomId
    return this
  }
}
