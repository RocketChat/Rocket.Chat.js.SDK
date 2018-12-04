import { ILogger, ILoginResultAPI, IAPIRequest, IMessage, ICredentials } from '../../interfaces';
import { Message } from '../message';
import { EventEmitter } from 'tiny-events';
/** Check for existing login */
/**
    * Prepend protocol (or put back if removed from env settings for driver)
    * Hard code endpoint prefix, because all syntax depends on this version
    */
/** Populate auth headers (from response data on login) */
export interface IClient {
    headers: any;
    get(url: string, data: any, options?: any): Promise<any>;
    post(url: string, data: any, options?: any): Promise<any>;
    put(url: string, data: any, options?: any): Promise<any>;
    delete(url: string, data: any, options?: any): Promise<any>;
}
export declare const regExpSuccess: RegExp;
/**
    * @module API
    * Provides a base client for handling requests with generic Rocket.Chat's REST API
    */
export default class Api extends EventEmitter {
    userId: string;
    logger: ILogger;
    client: IClient;
    currentLogin: {
        username: string;
        userId: string;
        authToken: string;
        result: ILoginResultAPI;
    } | null;
    constructor({ client, host, logger }: any);
    readonly username: string | null;
    loggedIn(): boolean;
    /**
        * Do a request to an API endpoint.
        * If it needs a token, login first (with defaults) to set auth headers.
        * @param method   Request method GET | POST | PUT | DEL
        * @param endpoint The API endpoint (including version) e.g. `chat.update`
        * @param data     Payload for POST request to endpoint
        * @param auth     Require auth headers for endpoint, default true
        * @param ignore   Allows certain matching error messages to not count as errors
        */
    request: (method: "GET" | "POST" | "PUT" | "DELETE", endpoint: string, data?: any, auth?: boolean, ignore?: RegExp | undefined) => Promise<any>;
    /** Do a POST request to an API endpoint. */
    post: IAPIRequest;
    /** Do a GET request to an API endpoint. */
    get: IAPIRequest;
    /** Do a PUT request to an API endpoint. */
    put: IAPIRequest;
    /** Do a DELETE request to an API endpoint. */
    del: IAPIRequest;
    /** Check result data for success, allowing override to ignore some errors */
    success(result: any, ignore?: RegExp): boolean;
    login(credentials: ICredentials, args?: any): Promise<any>;
    logout(): Promise<any>;
    /**
     * Structure message content, optionally addressing to room ID.
     * Accepts message text string or a structured message object.
     */
    prepareMessage(content: string | IMessage, rid?: string, args?: any): Message;
}
