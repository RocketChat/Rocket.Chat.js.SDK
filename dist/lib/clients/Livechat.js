"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
/**
 * @module LivechatDriver
 * Provides high-level helpers for Livechat connection, method calls, subscriptions.
 */
const Livechat_1 = __importDefault(require("../api/Livechat"));
const drivers_1 = require("../drivers");
const log_1 = require("../log");
class LivechatClient extends Livechat_1.default {
    constructor(_a) {
        var { allPublic, rooms, integrationId, protocol = drivers_1.Protocols.DDP } = _a, config = __rest(_a, ["allPublic", "rooms", "integrationId", "protocol"]);
        super(config);
        this.userId = '';
        this.logger = log_1.logger;
        switch (protocol) {
            case drivers_1.Protocols.MQTT:
                this.socket = Promise.resolve().then(() => __importStar(require(/* webpackChunkName: 'mqtt' */ '../drivers/mqtt'))).then(({ MQTTDriver }) => new MQTTDriver(config));
                break;
            case drivers_1.Protocols.DDP:
                this.socket = Promise.resolve().then(() => __importStar(require(/* webpackChunkName: 'ddp' */ '../drivers/ddp'))).then(({ DDPDriver }) => new DDPDriver(config));
                break;
            default:
                throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(drivers_1.Protocols).join()}`);
        }
    }
    connect(options, callback) {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).connect(options); });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).disconnect(); });
    }
    subscribe(topic, ...args) {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).subscribe(topic, args); });
    }
    unsubscribe(subscription) {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).unsubscribe(subscription); });
    }
    unsubscribeAll() {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).unsubscribeAll(); });
    }
    subscribeRoom(rid, ...args) {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).subscribeRoom(rid, ...args); });
    }
    subscribeNotifyAll() {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).subscribeNotifyAll(); });
    }
    subscribeLoggedNotify() {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).subscribeLoggedNotify(); });
    }
    subscribeNotifyUser() {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).subscribeNotifyUser(); });
    }
    onMessage(cb) {
        return __awaiter(this, void 0, void 0, function* () { return (yield this.socket).onMessage(cb); });
    }
}
exports.default = LivechatClient;
//# sourceMappingURL=Livechat.js.map