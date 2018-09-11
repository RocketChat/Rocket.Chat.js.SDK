export interface Event {
    [name: string]: any;
}
export interface Subscription {
    id?: string;
    name?: any;
    unsubscribe: () => Promise<any>;
    [key: string]: any;
}
export interface Subscriptions {
    [key: string]: any;
}
export declare function debounce(func: any, wait: any, immediate?: boolean): any;
export declare class EventEmitter {
    events: Event;
    constructor();
    /**
     * Listen to an event and remove the listener when it occurs.
     * @param event The event name to listen
     * @param listener A function which will be called when the event ocurr
     */
    on(event: string, listener: any): any;
    /**
     * Removes a event listener.
     * @param event The name of the event that won't be listened anymore
     * @param listener The listener to be removed
     */
    removeListener(event: string, listener: any): void;
    /**
     * Emits an event to all subscriptions.
     * @param event Name of the event to be emitted
     * @param args Parameters to be passed in the event
     */
    emit(event: string, ...args: any[]): void;
    /**
     * Listen to an event and remove the listener when it occurs once.
     * @param event The event name to listen
     * @param listener A function which will be called when the event ocurr
     */
    once(event: string, listener: any): any;
}
export default class Socket extends EventEmitter {
    state: string;
    lastPing: Date;
    id: number;
    subscriptions: Subscriptions;
    ddp: EventEmitter;
    url: String;
    timeout: any;
    reconnectTimeout: any;
    connection: any;
    private _login;
    private _timer;
    private _logged;
    constructor(url: String, useSsl?: boolean, login?: any);
    /**
     * Check if the ping-pong to the server is working.
     */
    check(): boolean;
    /**
     * Login to server via socket, returns a promise resolved with the
     * user information and emit the event `logged` when it's successfully
     * done or `loginError` when an error occurs.
     * @param params User credentials which can be username/password or LDAP
     */
    login(params: any): Promise<any>;
    /**
     * Send an object to the server via Socket.
     * @param obj the Object to be sent.
     */
    send(obj: any, ignore?: boolean): Promise<{}>;
    /**
     * Check if the DDP is connected, ready and logged.
     */
    readonly status: boolean;
    _close(): void;
    _connect(): Promise<{}>;
    /**
     * Logs out the current User from the server via Socket.
     */
    logout(): Promise<any>;
    /**
     * Disconnect the DDP from server and clear all subscriptions.
     */
    disconnect(): void;
    /**
     * Clear connection and try to connect again.
     */
    reconnect(): Promise<void>;
    /**
     * Calls a method on the server and returns a promise resolved
     * with the result of the method.
     * @param method The name of the method to be called
     * @param params An array with the parameters to be sent
     */
    call(method: string, ...params: any[]): Promise<any>;
    /**
     * Unsubscribe to a stream from server and returns a promise resolved
     * with the result of the unsubscription request.
     * @param id Stream's id
     */
    unsubscribe(id: any): Promise<any>;
    /**
     * Subscribe to a stream on server via socket and returns a promise resolved
     * with the subscription object when the subscription is ready.
     * @param name Stream's name to subscribe to
     * @param params Params sent to the subscription request
     */
    subscribe(name: string, ...params: any[]): Promise<Subscription>;
}
