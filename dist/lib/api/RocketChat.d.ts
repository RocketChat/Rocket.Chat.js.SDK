/**
    * @module ApiRocketChat
    * Provides a client for handling requests with Rocket.Chat's REST API
    */
export declare type RID = string;
import { IMessage } from '../../interfaces';
import ApiBase from './api';
/** Defaults for user queries */
export declare const userFields: {
    name: number;
    username: number;
    status: number;
    type: number;
};
/** Query helpers for user collection requests */
export default class ApiRocketChat extends ApiBase {
    readonly users: any;
    joinRoom(rid: string): Promise<any>;
    /** Exit a room the bot has joined */
    leaveRoom(rid: string): Promise<RID>;
    info(): Promise<any>;
    /**
     * Send a prepared message object (with pre-defined room ID).
     * Usually prepared and called by sendMessageByRoomId or sendMessageByRoom.
     */
    sendMessage(message: IMessage): Promise<any>;
    getRoomIdByNameOrId(name: string): Promise<RID>;
    getRoomNameById(name: RID): Promise<string>;
    getRoomName(rid: string): Promise<string>;
    getRoomId(name: string): Promise<any>;
    createDirectMessage(username: string): Promise<any>;
    /**
     * Edit an existing message, replacing any attributes with those provided.
     * The given message object should have the ID of an existing message.
     */
    editMessage(message: IMessage): Promise<IMessage>;
    /**
     * Send a reaction to an existing message. Simple proxy for method call.
     * @param emoji     Accepts string like `:thumbsup:` to add 👍 reaction
     * @param messageId ID for a previously sent message
     */
    setReaction(emoji: string, messageId: string): Promise<any>;
}
