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
export default class ApiClient extends ApiBase {
    readonly users: any;
    joinRoom(rid: string): Promise<any>;
    setReaction(emoji: string, messageId: string): Promise<any>;
    info(): Promise<any>;
    sendMessage(message: IMessage): {};
    getRoomId(name: string): Promise<any>;
    getRoomName(rid: string): Promise<any>;
    createDirectMessage(username: string): Promise<any>;
    /**
     * Edit an existing message, replacing any attributes with those provided.
     * The given message object should have the ID of an existing message.
     */
    editMessage(message: IMessage): Promise<IMessage>;
}
