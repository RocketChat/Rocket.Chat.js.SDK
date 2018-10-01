/** @todo contribute these to @types/rocketchat and require */
export interface IMessage {
    rid: string | null;
    _id?: string;
    t?: string;
    msg?: string;
    alias?: string;
    emoji?: string;
    avatar?: string;
    groupable?: boolean;
    bot?: any;
    urls?: string[];
    mentions?: string[];
    attachments?: IMessageAttachment[];
    reactions?: IMessageReaction;
    location?: IMessageLocation;
    u?: IUser;
    editedBy?: IUser;
    editedAt?: Date;
}
export interface IUser {
    _id: string;
    username: string;
    name?: string;
}
export interface IMessageAttachment {
    fields?: IAttachmentField[];
    actions?: IMessageAction[];
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
    title_link_download?: string;
    image_url?: string;
    audio_url?: string;
    video_url?: string;
}
export interface IAttachmentField {
    short?: boolean;
    title?: string;
    value?: string;
}
export interface IMessageAction {
    type?: string;
    text?: string;
    url?: string;
    image_url?: string;
    is_webview?: boolean;
    webview_height_ratio?: 'compact' | 'tall' | 'full';
    msg?: string;
    msg_in_chat_window?: boolean;
    button_alignment?: 'vertical' | 'horizontal';
    temporary_buttons?: boolean;
}
export interface IMessageLocation {
    type: string;
    coordinates: string[];
}
export interface IMessageReaction {
    [emoji: string]: {
        usernames: string[];
    };
}
