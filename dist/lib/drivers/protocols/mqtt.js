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
Object.defineProperty(exports, "__esModule", { value: true });
const browserMqtt_js_1 = __importDefault(require("mqtt/browserMqtt.js"));
const tiny_events_1 = require("tiny-events");
const log_1 = require("../../log");
class MQTTDriver extends tiny_events_1.EventEmitter {
    constructor(_a) {
        var { host, integrationId, config, logger = log_1.logger } = _a, moreConfigs = __rest(_a, ["host", "integrationId", "config", "logger"]);
        super();
        this.config = Object.assign({}, config, moreConfigs, { host: host.replace(/(^\w+:|^)\/\//, ''), timeout: 20000 });
        this.socket = browserMqtt_js_1.default;
        this.logger = logger;
    }
    connect(options) {
        this.socket.connect(this.config.host);
        return new Promise((resolve, reject) => {
            // TODO: removelisteners
            this.socket.once('connect', resolve);
            this.socket.once('error', reject);
        });
    }
    disconnect() {
        this.socket.end();
        return Promise.resolve(this.socket);
    }
    subscribe(topic, ...args) {
        return new Promise((resolve, reject) => {
            this.socket(topic, [...args, (err, granted) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(granted);
                }]);
        });
    }
    unsubscribe(subscription, ...args) {
        return new Promise((resolve, reject) => {
            this.socket.unsubscribe(subscription.name, [...args, (err, granted) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(granted);
                }]);
        });
    }
    unsubscribeAll() {
        return Promise.resolve();
    }
    subscribeNotifyAll() {
        return Promise.resolve();
    }
    subscribeLoggedNotify() {
        return Promise.resolve();
    }
    subscribeNotifyUser() {
        return Promise.resolve();
    }
    login(credentials, args) {
        return Promise.resolve();
    }
    // usertyping room-messages deleted messages
    subscribeRoom(rid, ...args) {
        return this.subscribe(`room-messages/${rid}`, { qos: 1 });
    }
    onMessage(cb) {
        this.socket.on('message', (topic, message) => {
            if (/room-messages/.test(topic)) {
                cb(message); // TODO apply msgpack
            }
        });
    }
}
exports.MQTTDriver = MQTTDriver;
//# sourceMappingURL=mqtt.js.map