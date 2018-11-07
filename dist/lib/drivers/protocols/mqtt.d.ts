import { EventEmitter } from 'tiny-events';
import { ILogger, ISocketOptions, ICallback, ISubscription, ICredentials } from '../../../interfaces';
import { IDriver } from '../driver';
export declare class MQTTDriver extends EventEmitter implements IDriver {
    logger: ILogger;
    config: ISocketOptions;
    socket: any;
    constructor({ host, integrationId, config, logger, ...moreConfigs }: any);
    connect(options: ISocketOptions): Promise<any>;
    disconnect(): Promise<any>;
    subscribe(topic: string, ...args: any[]): Promise<ISubscription>;
    unsubscribe(subscription: ISubscription, ...args: any[]): Promise<IDriver>;
    unsubscribeAll(): Promise<IDriver>;
    subscribeNotifyAll(): Promise<any>;
    subscribeLoggedNotify(): Promise<any>;
    subscribeNotifyUser(): Promise<any>;
    login(credentials: ICredentials, args?: any): Promise<any>;
    subscribeRoom(rid: string, ...args: any[]): Promise<ISubscription[]>;
    onMessage(cb: ICallback): void;
}
