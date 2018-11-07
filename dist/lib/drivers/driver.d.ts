import { EventEmitter } from 'tiny-events';
import { ILogger, ISocketOptions, ICallback, ISubscription, ICredentials } from '../../interfaces';
export interface IDriver {
    logger: ILogger;
    connect(options: ISocketOptions): Promise<IDriver>;
    disconnect(): Promise<IDriver>;
    subscribe(topic: string, ...args: any[]): Promise<ISubscription>;
    unsubscribe(subscription: ISubscription): Promise<IDriver>;
    unsubscribeAll(): Promise<IDriver>;
    subscribeRoom(rid: string, ...args: any[]): Promise<ISubscription[]>;
    onMessage(cb: ICallback): void;
    subscribeNotifyAll(): Promise<any>;
    subscribeLoggedNotify(): Promise<any>;
    subscribeNotifyUser(): Promise<any>;
    subscribeNotifyUser(): Promise<IDriver>;
    login(credentials: ICredentials, args?: any): Promise<any>;
    on(event: string, listener: Function): EventEmitter;
    once(event: string, listener: Function): EventEmitter;
    off(event?: string, listener?: Function): EventEmitter;
    emit(event: string, ...args: any[]): boolean;
    listeners(event: string): Function[];
    removeAllListeners(event?: string): Function[];
    hasListeners(event: string): boolean;
}
export declare enum Protocols {
    MQTT = "mqtt",
    DDP = "ddp"
}
