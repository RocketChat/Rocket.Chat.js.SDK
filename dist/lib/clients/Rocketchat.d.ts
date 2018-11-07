import { ISocket, IDriver } from '../drivers';
import ClientRest from '../api/RocketChat';
import { ILogger, ISocketOptions, ICallback, ISubscription } from '../../interfaces';
export default class RocketChatClient extends ClientRest implements ISocket {
    userId: string;
    logger: ILogger;
    socket: Promise<ISocket | IDriver>;
    config: any;
    constructor({ logger, allPublic, rooms, integrationId, protocol, ...config }: any);
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
}
