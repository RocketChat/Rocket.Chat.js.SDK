import { IMessageUpdateAPI, IMessageResultAPI, INewUserAPI, IUserResultAPI, IRoomResultAPI } from './interfaces';
/** Create a user and catch the error if they exist already */
export declare function createUser(user: INewUserAPI): Promise<IUserResultAPI | undefined>;
/** Send message from mock user to channel for tests to listen and respond */
export declare function sendFromUser(payload: any): Promise<IMessageResultAPI | undefined>;
/** Update message sent from mock user */
export declare function updateFromUser(payload: IMessageUpdateAPI): Promise<IMessageResultAPI | undefined>;
/** Create a direct message session with the mock user */
export declare function setupDirectFromUser(): Promise<IRoomResultAPI | undefined>;
/** Get user data, to check if they're online or have attributes set */
export declare function getUserData(payload: {
    userId?: string;
    username?: string;
}): Promise<IUserResultAPI | undefined>;
/** Initialise testing instance with the required users for SDK/bot tests */
export declare function setup(): Promise<void>;
