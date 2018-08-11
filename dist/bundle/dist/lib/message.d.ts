import { IMessage } from '../config/messageInterfaces';
export interface Message extends IMessage {
}
/**
 * Rocket.Chat message class.
 * Sets integration param to allow tracing source of automated sends.
 * @param content Accepts message text or a preformed message object
 * @todo Potential for SDK usage that isn't bots, bot prop should be optional?
 */
export declare class Message {
    constructor(content: string | IMessage, integrationId: string);
    setRoomId(roomId: string): Message;
}
