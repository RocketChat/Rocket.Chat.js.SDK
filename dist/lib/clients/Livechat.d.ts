/**
    * @module LivechatDriver
    * Provides high-level helpers for Livechat connection, method calls, subscriptions.
    */
import LivechatRest from '../api/Livechat';
import { ISocket, Protocols, IDriver } from '../drivers';
import { ILogger, ISocketOptions, ICallback, ISubscription } from '../../interfaces';
export default class LivechatClient extends LivechatRest implements ISocket {
    userId: string;
    logger: ILogger;
    socket: Promise<ISocket | IDriver>;
    constructor({ logger, allPublic, rooms, integrationId, protocol, ...config }: any);
    import(protocol: Protocols, config: any): void;
    connect(options: ISocketOptions, callback?: ICallback): Promise<any>;
    disconnect(): Promise<any>;
    subscribe(topic: string, ...args: any[]): Promise<ISubscription>;
    unsubscribe(subscription: ISubscription): Promise<any>;
    unsubscribeAll(): Promise<any>;
    subscribeRoom(rid: string, ...args: any[]): Promise<ISubscription[]>;
    subscribeNotifyAll(): Promise<any>;
    subscribeLoggedNotify(): Promise<any>;
    subscribeNotifyUser(): Promise<any>;
    onMessage(cb: ICallback): Promise<any>;
    onTyping(cb: ICallback): Promise<any>;
}
