/** Result object from an API login */
export interface ILoginResultAPI {
    status: boolean;
    data: {
        authToken: string;
        userId: string;
    };
}
/** Payload structure for `postMessage` endpoint */
export interface IMessageAPI {
    roomId: string;
    channel: string;
    text?: string;
    alias?: string;
    emoji?: string;
    avatar?: string;
    attachments?: IAttachmentAPI[];
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
    message: IMessageAPI;
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
