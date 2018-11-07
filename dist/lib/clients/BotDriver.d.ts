import Rocketchat from './Rocketchat';
import { ISocketOptions, IRespondOptions, ICallback, IMessageCallback, IMessage, IMessageReceipt, ISubscription } from '../../interfaces';
export default class BotDriver extends Rocketchat {
    integrationId: string;
    lastReadTime: Date;
    joinedIds: string[];
    messages: ISubscription | null;
    constructor({ integrationId, ...config }: any);
    connect(options: ISocketOptions, callback?: ICallback): Promise<any>;
    subscribeToMessages(): Promise<ISubscription>;
    reactToMessages(callback: IMessageCallback): Promise<void>;
    joinRooms(rooms: string[]): Promise<void[]>;
    respondToMessages(callback: IMessageCallback, options?: IRespondOptions): Promise<void>;
    /**
     * Prepare and send string/s to specified room ID.
     * @param content Accepts message text string or array of strings.
     * @param roomId  ID of the target room to use in send.
     * @todo Returning one or many gets complicated with type checking not allowing
     *       use of a property because result may be array, when you know it's not.
     *       Solution would probably be to always return an array, even for single
     *       send. This would be a breaking change, should hold until major version.
     */
    sendToRoomId(content: string | string[] | IMessage, roomId: string): Promise<IMessageReceipt[] | IMessageReceipt>;
    /**
     * Prepare and send string/s to specified room name (or ID).
     * @param content Accepts message text string or array of strings.
     * @param room    A name (or ID) to resolve as ID to use in send.
     */
    sendToRoom(content: string | string[] | IMessage, room: string): Promise<IMessageReceipt[] | IMessageReceipt>;
    /**
     * Prepare and send string/s to a user in a DM.
     * @param content   Accepts message text string or array of strings.
     * @param username  Name to create (or get) DM for room ID to use in send.
     */
    sendDirectToUser(content: string | string[] | IMessage, username: string): Promise<IMessageReceipt[] | IMessageReceipt>;
    /**
     * Get ID for a DM room by its recipient's name.
     * Will create a DM (with the bot) if it doesn't exist already.
     * @todo test why create resolves with object instead of simply ID
     */
    getDirectMessageRoomId(username: string): Promise<string>;
    getRoomNameById(rid: string): Promise<any>;
}
