import { Protocols } from '../drivers';
import ClientRest from '../api/RocketChat';
import { logger as Logger } from '../log';
export default class RocketChatClient extends ClientRest {
    constructor({ logger, allPublic, rooms, integrationId, protocol = Protocols.DDP, ...config }) {
        super({ ...config, logger });
        this.userId = '';
        this.logger = Logger;
        this.logger = logger;
        switch (protocol) {
            case Protocols.MQTT:
                this.socket = import(/* webpackChunkName: 'mqtt' */ '../drivers/mqtt').then(({ MQTTDriver }) => new MQTTDriver({ ...config, logger }));
                break;
            case Protocols.DDP:
                this.socket = import(/* webpackChunkName: 'ddp' */ '../drivers/ddp').then(({ DDPDriver }) => new DDPDriver({ ...config, logger }));
                break;
            default:
                throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(Protocols).join()}`);
        }
    }
    async connect(options, callback) { return (await this.socket).connect(options); }
    async disconnect() { return (await this.socket).disconnect(); }
    async subscribe(topic, ...args) { return (await this.socket).subscribe(topic, ...args); }
    async unsubscribe(subscription) { return (await this.socket).unsubscribe(subscription); }
    async unsubscribeAll() { return (await this.socket).unsubscribeAll(); }
    async subscribeRoom(rid, ...args) { return (await this.socket).subscribeRoom(rid, ...args); }
    async subscribeNotifyAll() { return (await this.socket).subscribeNotifyAll(); }
    async subscribeLoggedNotify() { return (await this.socket).subscribeLoggedNotify(); }
    async subscribeNotifyUser() { return (await this.socket).subscribeNotifyUser(); }
    async onMessage(cb) {
        return (await this.socket).onMessage(cb);
    }
}
//# sourceMappingURL=Rocketchat.js.map