import { IMessage } from '../config/messageInterfaces';
export interface Message extends IMessage {
}
/**
 * Rocket.Chat message class.
 * @param content Accepts message text or a preformed message object
 */
export declare class Message {
    bot: boolean;
    constructor(content: string | IMessage);
    setRoomId(roomId: string): Message;
}
