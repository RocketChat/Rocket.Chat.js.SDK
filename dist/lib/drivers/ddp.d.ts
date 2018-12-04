/**
 * @module DDPDriver
 * Handles low-level websocket ddp connections and event subscriptions
 */
/// <reference types="node" />
import { EventEmitter } from 'tiny-events';
import { ISocket, IDriver } from './index';
import { ISocketOptions, ISocketMessageHandler, ISubscription, ICredentials, ILoginResult, ICredentialsPass, ICredentialsOAuth, ICredentialsAuthenticated, ISocketMessageCallback, ICallback, ILogger } from '../../interfaces';
/** Websocket handler class, manages connections and subscriptions by DDP */
export declare class Socket extends EventEmitter {
    resume: ILoginResult | null;
    sent: number;
    host: string;
    lastPing: number;
    subscriptions: {
        [id: string]: ISubscription;
    };
    handlers: ISocketMessageHandler[];
    config: ISocketOptions | any;
    openTimeout?: NodeJS.Timer | number;
    reopenInterval?: any;
    pingTimeout?: NodeJS.Timer | number;
    connection?: WebSocket;
    session?: string;
    logger: ILogger;
    /** Create a websocket handler */
    constructor(options?: ISocketOptions | any, resume?: ILoginResult | null);
    /**
     * Open websocket connection, with optional retry interval.
     * Stores connection, setting up handlers for open/close/message events.
     * Resumes login if given token.
     */
    open(ms?: number): Promise<{}>;
    /** Send handshake message to confirm connection, start pinging. */
    onOpen(callback: Function): Promise<any>;
    /** Emit close event so it can be used for promise resolve in close() */
    onClose(e: any): Promise<void> | undefined;
    /**
     * Find and call matching handlers for incoming message data.
     * Handlers match on collection, id and/or msg attribute in that order.
     * Any matched handlers are removed once called.
     * All collection events are emitted with their `msg` as the event name.
     */
    onMessage(e: any): void;
    /** Disconnect the DDP from server and clear all subscriptions. */
    close(): Promise<void>;
    /** Clear connection and try to connect again. */
    reopen(): Promise<void>;
    /** Check if websocket connected and ready. */
    readonly connected: boolean;
    /** Check if connected and logged in */
    readonly loggedIn: boolean;
    /**
     * Send an object to the server via Socket. Adds handler to collection to
     * allow awaiting response matching an expected object. Most responses are
     * identified by their message event name and the ID they were sent with, but
     * some responses don't return the ID fallback to just matching on event name.
     * Data often includes an error attribute if something went wrong, but certain
     * types of calls send back a different `msg` value instead, e.g. `nosub`.
     * @param obj       Object to be sent
     * @param msg       The `data.msg` value to wait for in response
     * @param errorMsg  An alternate `data.msg` value indicating an error response
     */
    send(obj: any): Promise<any>;
    /** Send ping, record time, re-open if nothing comes back, repeat */
    ping(): Promise<void>;
    /** Check if ping-pong to server is within tolerance of 1 missed ping */
    alive(): boolean;
    /**
     * Calls a method on the server and returns a promise resolved
     * with the result of the method.
     * @param method    The name of the method to be called
     * @param params    An array with the parameters to be sent
     */
    call(method: string, ...params: any[]): Promise<any>;
    /**
     * Login to server and resubscribe to all subs, resolve with user information.
     * @param credentials User credentials (username/password, oauth or token)
     */
    login(credentials: any): Promise<ILoginResult>;
    /** Take variety of login credentials object types for accepted params */
    loginParams(credentials: ICredentialsPass | ICredentialsOAuth | ICredentialsAuthenticated | ILoginResult | ICredentials): ICredentialsPass | ICredentialsOAuth | ICredentialsAuthenticated;
    /** Logout the current User from the server via Socket. */
    logout(): Promise<any>;
    /** Register a callback to trigger on message events in subscription */
    onEvent(id: string, callback: ISocketMessageCallback): void;
    /**
     * Subscribe to a stream on server via socket and returns a promise resolved
     * with the subscription object when the subscription is ready.
     * @param name      Stream name to subscribe to
     * @param params    Params sent to the subscription request
     */
    subscribe(name: string, params: any[], callback?: ISocketMessageCallback): Promise<{
        id: any;
        name: string;
        params: any[];
        unsubscribe: any;
        onEvent: any;
    }>;
    /** Subscribe to all pre-configured streams (e.g. on login resume) */
    subscribeAll(): Promise<{
        id: any;
        name: string;
        params: any[];
        unsubscribe: any;
        onEvent: any;
    }[]>;
    /** Unsubscribe to server stream, resolve with unsubscribe request result */
    unsubscribe(id: any): Promise<any>;
    /** Unsubscribe from all active subscriptions and reset collection */
    unsubscribeAll(): Promise<{}>;
}
export declare class DDPDriver extends EventEmitter implements ISocket, IDriver {
    logger: ILogger;
    config: ISocketOptions;
    /**
     * Event Emitter for listening to connection (echoes selection of DDP events)
     * @example
     *  import { driver } from '@rocket.chat/sdk'
     *  driver.connect()
     *  driver.events.on('connected', () => console.log('driver connected'))
     */
    /**
     * An Websocket instance for interacting with Rocket.Chat.
     * Variable not initialised until `connect` called.
     */
    ddp: Socket;
    /**
     * Websocket subscriptions, exported for direct polling by adapters
     * Variable not initialised until `prepMeteorSubscriptions` called.
     * @deprecated Use `ddp.Socket` instance subscriptions instead.
     */
    subscriptions: {
        [id: string]: ISubscription;
    };
    /** Save messages subscription to ensure only one created */
    messages: ISubscription | undefined;
    /** Current user object populated from resolved login */
    userId: string;
    /** Array of joined room IDs (for reactive queries) */
    joinedIds: string[];
    constructor({ host, integrationId, config, logger, ...moreConfigs }?: any);
    /**
     * Initialise socket instance with given options or defaults.
     * Proxies the DDP module socket connection. Resolves with socket when open.
     * Accepts callback following error-first-pattern.
     * Error returned or promise rejected on timeout.
     * @example <caption>Using promise</caption>
     *  import { driver } from '@rocket.chat/sdk'
     *  driver.connect()
     *    .then(() => console.log('connected'))
     *    .catch((err) => console.error(err))
     */
    connect(c?: any): Promise<any>;
    readonly connected: boolean;
    disconnect(): Promise<any>;
    subscribe(topic: string, eventname: string, ...args: any[]): Promise<ISubscription>;
    subscribeNotifyAll(): Promise<any>;
    subscribeLoggedNotify(): Promise<any>;
    subscribeNotifyUser(): Promise<any>;
    subscribeRoom(rid: string, ...args: any[]): Promise<ISubscription[]>;
    /** Login to Rocket.Chat via DDP */
    login(credentials: ICredentials, args: any): Promise<any>;
    logout(): Promise<void>;
    /** Unsubscribe from Meteor stream. Proxy for socket unsubscribe. */
    unsubscribe(subscription: ISubscription): Promise<any>;
    /** Unsubscribe from all subscriptions. Proxy for socket unsubscribeAll */
    unsubscribeAll(): Promise<any>;
    onMessage(cb: ICallback): void;
    onNotifyUser(cb: ICallback): Promise<any>;
    onTyping(cb: ICallback): Promise<any>;
    ejsonMessage(message: any): any;
}
