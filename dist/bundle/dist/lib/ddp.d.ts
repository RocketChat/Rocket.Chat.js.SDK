/// <reference types="node" />
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
    on(event: string, listener: any): any;
    removeListener(event: string, listener: any): void;
    emit(event: string, ...args: any[]): void;
    once(event: string, listener: any): any;
}
export default class Socket extends EventEmitter {
    state: string;
    lastping: Date;
    id: number;
    subscriptions: Subscriptions;
    ddp: EventEmitter;
    url: String;
    timeout: NodeJS.Timer;
    reconnectTimeout: NodeJS.Timer;
    connection: any;
    private _login;
    private _timer;
    private _logged;
    constructor(url: String, login?: any);
    check(): boolean;
    login(params: any): Promise<any>;
    send(obj: any, ignore?: boolean): Promise<{}>;
    readonly status: boolean;
    _close(): void;
    _connect(): Promise<{}>;
    logout(): Promise<any>;
    disconnect(): void;
    reconnect(): Promise<void>;
    call(method: any, ...params: any[]): Promise<any>;
    unsubscribe(id: any): Promise<any>;
    subscribe(name: any, ...params: any[]): Promise<Subscription>;
}
