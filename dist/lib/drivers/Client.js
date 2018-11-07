"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Client_1 = __importDefault(require("../api/Client"));
const driver_1 = require("./driver");
const log_1 = require("../log");
class ClientDriver extends Client_1.default {
    constructor(_a) {
        var { allPublic, rooms, integrationId, protocol = driver_1.Protocols.DDP } = _a, config = __rest(_a, ["allPublic", "rooms", "integrationId", "protocol"]);
        super(config);
        this.userId = '';
        this.logger = log_1.logger;
        this.config = {
            allPublic, rooms
        };
        super(config);
        switch (protocol) {
            case driver_1.Protocols.MQTT:
                this.socket = Promise.resolve().then(() => __importStar(require(/* webpackChunkName: 'mqtt' */ './protocols/mqtt'))).then(({ MQTTDriver }) => new MQTTDriver(config));
                break;
            case driver_1.Protocols.DDP:
            default:
                this.socket = Promise.resolve().then(() => __importStar(require(/* webpackChunkName: 'ddp' */ './protocols/ddp'))).then(({ DDPDriver }) => new DDPDriver(config));
                break;
        }
    }
    connect(options, callback) { return this.socket.connect(options); }
    disconnect() { return this.socket.disconnect(); }
    subscribe(topic, ...args) { return this.socket.subscribe(topic, args); }
    unsubscribe(subscription) { return this.socket.unsubscribe(subscription); }
    unsubscribeAll() { return this.socket.unsubscribeAll(); }
    subscribeRoom(rid, ...args) { return this.socket.subscribeRoom(rid, ...args); }
    subscribeNotifyAll() { return this.socket.subscribeNotifyAll(); }
    subscribeLoggedNotify() { return this.socket.subscribeLoggedNotify(); }
    subscribeNotifyUser() { return this.socket.subscribeNotifyUser(); }
    onMessage(cb) {
        this.socket.onMessage(cb);
    }
}
exports.default = ClientDriver;
//# sourceMappingURL=Client.js.map