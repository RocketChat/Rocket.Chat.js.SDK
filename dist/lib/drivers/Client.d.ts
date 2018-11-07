import ClientRest from '../api/Client';
import { IDriver } from './driver';
import { ILogger, ISocketOptions, ICallback, ISubscription } from '../../interfaces';
export default class ClientDriver extends ClientRest implements IDriver {
    userId: string;
    logger: ILogger;
    socket: IDriver;
    config: any;
    constructor({ allPublic, rooms, integrationId, protocol, ...config }: any);
    connect(options: ISocketOptions, callback?: ICallback): Promise<IDriver>;
    disconnect(): Promise<any>;
    subscribe(topic: string, ...args: any[]): Promise<ISubscription>;
    unsubscribe(subscription: ISubscription): Promise<any>;
    unsubscribeAll(): Promise<any>;
    subscribeRoom(rid: string, ...args: any[]): Promise<ISubscription[]>;
    subscribeNotifyAll(): Promise<any>;
    subscribeLoggedNotify(): Promise<any>;
    subscribeNotifyUser(): Promise<any>;
    onMessage(cb: ICallback): void;
}
