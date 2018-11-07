/**
* @module LivechatDriver
* Provides high-level helpers for Livechat connection, method calls, subscriptions.
*/
import LivechatRest from '../api/Livechat';
import { Protocols } from '../drivers';
import { logger as Logger } from '../log';
export default class LivechatClient extends LivechatRest {
    constructor({ allPublic, rooms, integrationId, protocol, ...config }) {
        super(config);
        this.userId = '';
        this.logger = Logger;
        this.socket = Promise.resolve();
        this.import(protocol, config);
    }
    import(protocol, config) {
        switch (protocol) {
            case Protocols.MQTT:
                this.socket = import(/* webpackChunkName: 'mqtttest' */ '../drivers/mqtt').then(({ MQTTDriver }) => new MQTTDriver(config));
                break;
            case Protocols.DDP:
                this.socket = import(/* webpackChunkName: 'ddptest' */ '../drivers/ddp').then(({ DDPDriver }) => new DDPDriver(config));
                break;
            default:
                throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(Protocols).join()}`);
        }
    }
    async connect(options, callback) { return (await this.socket).connect(options); }
    async disconnect() { return (await this.socket).disconnect(); }
    async subscribe(topic, ...args) { return (await this.socket).subscribe(topic, args); }
    async unsubscribe(subscription) { return (await this.socket).unsubscribe(subscription); }
    async unsubscribeAll() { return (await this.socket).unsubscribeAll(); }
    async subscribeRoom(rid, ...args) { return (await this.socket).subscribeRoom(rid, ...args); }
    async subscribeNotifyAll() { return (await this.socket).subscribeNotifyAll(); }
    async subscribeLoggedNotify() { return (await this.socket).subscribeLoggedNotify(); }
    async subscribeNotifyUser() { return (await this.socket).subscribeNotifyUser(); }
    async onMessage(cb) { return (await this.socket).onMessage(cb); }
    async onTyping(cb) { return (await this.socket).onTyping(cb); }
}
//# sourceMappingURL=Livechat.js.map