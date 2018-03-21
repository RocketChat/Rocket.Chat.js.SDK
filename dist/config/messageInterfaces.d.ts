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
    reactions?: {
        [emoji: string]: string[];
    };
    location?: {
        type: string;
        coordinates: string[];
    };
    attachments?: IAttachment[];
    editedAt?: Date;
    editedBy?: {
        _id: string;
        username: string;
    };
}
export interface IAttachment {
    fields: IAttachmentField[];
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
    title: 'string';
    value: 'string';
}
