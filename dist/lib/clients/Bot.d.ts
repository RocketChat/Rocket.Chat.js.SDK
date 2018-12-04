import Rocketchat from './Rocketchat';
import { ISocketOptions, IRespondOptions, ICallback, IMessageCallback, IMessage, ISubscription, ICredentials, IMessageReceipt } from '../../interfaces';
import { RID } from '../api/RocketChat';
export default class BotClient extends Rocketchat {
    integrationId: string;
    lastReadTime: Date;
    joinedIds: string[];
    messages: ISubscription | null;
    constructor({ allPublic, integrationId, cachedMethods, ...config }: any);
    login(credentials: ICredentials): Promise<any>;
    /**
     * Initialise socket instance with given options or defaults.
     * Proxies the DDP module socket connection. Resolves with socket when open.
     * Accepts callback following error-first-pattern.
     * Error returned or promise rejected on timeout.
     * @example <caption>Use with callback</caption>
     *  import driver from '@rocket.chat/sdk/bot'
     *  driver.connect({}, (err) => {
     *    if (err) throw err
     *    else console.log('connected')
     *  })
     * @example <caption>Using promise</caption>
     *  import driver from '@rocket.chat/sdk/bot'
     *  driver.connect()
     *    .then(() => console.log('connected'))
     *    .catch((err) => console.error(err))
     */
    connect(options: ISocketOptions, callback?: ICallback): Promise<any>;
    unsubscribeAll(): Promise<any>;
    /** Begin subscription to user's "global" message stream. Will only allow one. */
    subscribeToMessages(): Promise<ISubscription>;
    /**
     * Add callback for changes in the message stream, subscribing if not already.
     * This can be called directly for custom extensions, but for most usage (e.g.
     * for bots) the respondToMessages is more useful to only receive messages
     * matching configuration.
     *
     * @param callback Function called with every change in subscriptions.
     *  - Uses error-first callback pattern
     *  - Second argument is the changed message
     *  - Third argument is additional attributes, such as `roomType`
     */
    reactToMessages(callback: IMessageCallback, debug?: string): Promise<void>;
    /**
     * Applies `reactToMessages` with some filtering of messages based on config.
     * If no rooms are joined at this point, it will attempt to join now based on
     * environment config, otherwise it might not receive any messages. It doesn't
     * matter that this happens asynchronously because joined rooms can change after
     * the subscription is set up.
     *
     * @param callback Function called after filters run on subscription events.
     *  - Uses error-first callback pattern
     *  - Second argument is the changed item
     *  - Third argument is additional attributes, such as `roomType`
     * @param options Sets filters for different event/message types.
     */
    respondToMessages(callback: IMessageCallback, options?: IRespondOptions): Promise<void>;
    /** Get ID for a room by name (or ID). */
    getRoomId(name: string): Promise<RID>;
    /** Join the bot into a room by its name or ID */
    joinRoom({ rid }: any): Promise<RID>;
    /** Exit a room the bot has joined */
    leaveRoom(room: string): Promise<RID>;
    /** Join a set of rooms by array of names or IDs */
    joinRooms(rooms: string[]): Promise<RID[]>;
    /**
     * Prepare and send string/s to specified room ID.
     * @param content Accepts message text string or array of strings.
     * @param roomId  ID of the target room to use in send.
     * @todo Returning one or many gets complicated with type checking not allowing
     *       use of a property because result may be array, when you know it's not.
     *       Solution would probably be to always return an array, even for single
     *       send. This would be a breaking change, should hold until major version.
     */
    sendToRoomId(content: IMessage | string | string[], roomId: string): Promise<IMessageReceipt[] | IMessageReceipt>;
    /**
     * Prepare and send string/s to specified room name (or ID).
     * @param content Accepts message text string or array of strings.
     * @param room    A name (or ID) to resolve as ID to use in send.
     */
    sendToRoom(content: IMessage | string | string[], room: string): Promise<IMessageReceipt[] | IMessageReceipt>;
    /**
     * Prepare and send string/s to a user in a DM.
     * @param content   Accepts message text string or array of strings.
     * @param username  Name to create (or get) DM for room ID to use in send.
     */
    sendDirectToUser(content: IMessage | string | string[], username: string): Promise<IMessageReceipt[] | IMessageReceipt>;
    /**
     * Get ID for a DM room by its recipient's name.
     * Will create a DM (with the bot) if it doesn't exist already.
     * @todo test why create resolves with object instead of simply ID
     */
    getDirectMessageRoomId(username: string): Promise<RID>;
}
