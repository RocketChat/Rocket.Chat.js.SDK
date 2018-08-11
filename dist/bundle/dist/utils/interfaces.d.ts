/** Payload structure for `chat.postMessage` endpoint */
export interface IMessageAPI {
    roomId: string;
    channel?: string;
    text?: string;
    alias?: string;
    emoji?: string;
    avatar?: string;
    attachments?: IAttachmentAPI[];
}
/** Payload structure for `chat.update` endpoint */
export interface IMessageUpdateAPI {
    roomId: string;
    msgId: string;
    text: string;
}
/** Message receipt returned after send (not the same as sent object) */
export interface IMessageReceiptAPI {
    _id: string;
    rid: string;
    alias: string;
    msg: string;
    parseUrls: boolean;
    groupable: boolean;
    ts: string;
    u: {
        _id: string;
        username: string;
    };
    _updatedAt: string;
    editedAt?: string;
    editedBy?: {
        _id: string;
        username: string;
    };
}
/** Payload structure for message attachments */
export interface IAttachmentAPI {
    color?: string;
    text?: string;
    ts?: string;
    thumb_url?: string;
    message_link?: string;
    collapsed?: boolean;
    author_name?: string;
    author_link?: string;
    author_icon?: string;
    title?: string;
    title_link?: string;
    title_link_download_true?: string;
    image_url?: string;
    audio_url?: string;
    video_url?: string;
    fields?: IAttachmentFieldAPI[];
}
/**
 * Payload structure for attachment field object
 * The field property of the attachments allows for “tables” or “columns” to be displayed on messages
 */
export interface IAttachmentFieldAPI {
    short?: boolean;
    title: string;
    value: string;
}
/** Result structure for message endpoints */
export interface IMessageResultAPI {
    ts: number;
    channel: string;
    message: IMessageReceiptAPI;
    success: boolean;
}
/** User object structure for creation endpoints */
export interface INewUserAPI {
    email?: string;
    name?: string;
    password: string;
    username: string;
    active?: true;
    roles?: string[];
    joinDefaultChannels?: boolean;
    requirePasswordChange?: boolean;
    sendWelcomeEmail?: boolean;
    verified?: true;
}
/** User object structure for queries (not including admin access level) */
export interface IUserAPI {
    _id: string;
    type: string;
    status: string;
    active: boolean;
    name: string;
    utcOffset: number;
    username: string;
}
/** Result structure for user data request (by non-admin) */
export interface IUserResultAPI {
    user: IUserAPI;
    success: boolean;
}
/** Room object structure */
export interface IRoomAPI {
    _id: string;
    _updatedAt: string;
    t: 'c' | 'p' | 'd' | 'l';
    msgs: number;
    ts: string;
    meta: {
        revision: number;
        created: number;
        version: number;
    };
}
/** Channel result schema */
export interface IChannelAPI {
    _id: string;
    name: string;
    t: 'c' | 'p' | 'l';
    msgs: number;
    u: {
        _id: string;
        username: string;
    };
    ts: string;
    default: boolean;
}
/** Group result schema */
export interface IGroupAPI {
    _id: string;
    name: string;
    usernames: string[];
    t: 'c' | 'p' | 'l';
    msgs: number;
    u: {
        _id: string;
        username: string;
    };
    ts: string;
    default: boolean;
}
/** Result structure for room creation (e.g. DM) */
export interface IRoomResultAPI {
    room: IRoomAPI;
    success: boolean;
}
/** Result structure for channel creation */
export interface IChannelResultAPI {
    channel: IChannelAPI;
    success: boolean;
}
/** Result structure for group creation */
export interface IGroupResultAPI {
    group: IGroupAPI;
    success: boolean;
}
