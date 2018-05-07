import { IMessageUpdateAPI, IMessageResultAPI, INewUserAPI, IUserResultAPI, IRoomResultAPI, IChannelResultAPI } from './interfaces';
/** Define common attributes for DRY tests */
export declare const testChannelName = "tests";
/** Get information about a user */
export declare function userInfo(username: string): Promise<IUserResultAPI>;
/** Create a user and catch the error if they exist already */
export declare function createUser(user: INewUserAPI): Promise<IUserResultAPI>;
/** Get information about a channel */
export declare function channelInfo(roomName: string): Promise<IChannelResultAPI>;
/** Create a room for tests and catch the error if it exists already */
export declare function createChannel(name: string, members?: string[], readOnly?: boolean): Promise<IChannelResultAPI>;
/** Send message from mock user to channel for tests to listen and respond */
export declare function sendFromUser(payload: any): Promise<IMessageResultAPI>;
/** Update message sent from mock user */
export declare function updateFromUser(payload: IMessageUpdateAPI): Promise<IMessageResultAPI>;
/** Create a direct message session with the mock user */
export declare function setupDirectFromUser(): Promise<IRoomResultAPI>;
/** Initialise testing instance with the required users for SDK/bot tests */
export declare function setup(): Promise<void>;
