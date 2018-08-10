import { IMessageUpdateAPI, IMessageResultAPI, INewUserAPI, IUserResultAPI, IRoomResultAPI, IChannelResultAPI, IGroupResultAPI } from './interfaces';
import { IMessage } from '../config/messageInterfaces';
/** Define common attributes for DRY tests */
export declare const testChannelName = "tests";
export declare const testPrivateName = "p-tests";
/** Get information about a user */
export declare function userInfo(username: string): Promise<IUserResultAPI>;
/** Create a user and catch the error if they exist already */
export declare function createUser(user: INewUserAPI): Promise<IUserResultAPI>;
/** Get information about a channel */
export declare function channelInfo(query: {
    roomName?: string;
    roomId?: string;
}): Promise<IChannelResultAPI>;
/** Get information about a private group */
export declare function privateInfo(query: {
    roomName?: string;
    roomId?: string;
}): Promise<IGroupResultAPI>;
/** Get the last messages sent to a channel (in last 10 minutes) */
export declare function lastMessages(roomId: string, count?: number): Promise<IMessage[]>;
/** Create a room for tests and catch the error if it exists already */
export declare function createChannel(name: string, members?: string[], readOnly?: boolean): Promise<IChannelResultAPI>;
/** Create a private group / room and catch if exists already */
export declare function createPrivate(name: string, members?: string[], readOnly?: boolean): Promise<IGroupResultAPI>;
/** Send message from mock user to channel for tests to listen and respond */
/** @todo Sometimes the post request completes before the change event emits
 *        the message to the streamer. That's why the interval is used for proof
 *        of receipt. It would be better for the endpoint to not resolve until
 *        server side handling is complete. Would require PR to core.
 */
export declare function sendFromUser(payload: any): Promise<IMessageResultAPI>;
/** Leave user from room, to generate `ul` message (test channel by default) */
export declare function leaveUser(room?: {
    id?: string;
    name?: string;
}): Promise<Boolean>;
/** Invite user to room, to generate `au` message (test channel by default) */
export declare function inviteUser(room?: {
    id?: string;
    name?: string;
}): Promise<Boolean>;
/** @todo : Join user into room (enter) to generate `uj` message type. */
/** Update message sent from mock user */
export declare function updateFromUser(payload: IMessageUpdateAPI): Promise<IMessageResultAPI>;
/** Create a direct message session with the mock user */
export declare function setupDirectFromUser(): Promise<IRoomResultAPI>;
/** Initialise testing instance with the required users for SDK/bot tests */
export declare function setup(): Promise<void>;
