"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Test script uses standard methods and env config to connect and log streams
const config_1 = require("./config");
const Bot_1 = __importDefault(require("../lib/clients/Bot"));
global.fetch = require('node-fetch');
// Login settings - LDAP needs to be explicitly enabled
exports.username = process.env.ROCKETCHAT_USER || 'g1';
exports.password = process.env.ROCKETCHAT_PASSWORD || '1';
exports.ldap = (process.env.ROCKETCHAT_AUTH === 'ldap');
// Connection settings - Enable SSL by default if Rocket.Chat URL contains https
exports.host = process.env.ROCKETCHAT_URL || 'http://localhost:3000';
exports.useSsl = (process.env.ROCKETCHAT_USE_SSL && process.env.ROCKETCHAT_USE_SSL === 'true') || (exports.host).toLowerCase().startsWith('https');
exports.timeout = 20 * 1000; // 20 seconds
// Respond settings - reactive callback filters for .respondToMessages
exports.rooms = (process.env.ROCKETCHAT_ROOM)
    ? (process.env.ROCKETCHAT_ROOM || '').split(',').map((room) => room.trim())
    : [];
exports.allPublic = (process.env.LISTEN_ON_ALL_PUBLIC || 'false').toLowerCase() === 'true';
exports.dm = (process.env.RESPOND_TO_DM || 'false').toLowerCase() === 'true';
exports.livechat = (process.env.RESPOND_TO_LIVECHAT || 'false').toLowerCase() === 'true';
exports.edited = (process.env.RESPOND_TO_EDITED || 'false').toLowerCase() === 'true';
// Message attribute settings
exports.integrationId = process.env.INTEGRATION_ID || 'js.SDK';
// Cache settings
exports.roomCacheMaxSize = parseInt(process.env.ROOM_CACHE_SIZE || '10', 10);
exports.roomCacheMaxAge = 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10);
exports.dmCacheMaxSize = parseInt(process.env.DM_ROOM_CACHE_SIZE || '10', 10);
exports.dmCacheMaxAge = 1000 * parseInt(process.env.DM_ROOM_CACHE_MAX_AGE || '100', 10);
// Livechat settings
exports.token = process.env.LIVECHAT_TOKEN || '';
exports.rid = process.env.LIVECHAT_ROOM || '';
exports.department = process.env.LIVECHAT_DEPARTMENT || '';
const delay = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms));
class L {
    debug(...args) {
        // console.log(...args)
    }
    info(...args) {
        // console.log(...args)
    }
    warning(...args) {
        // console.warn(...args)
    }
    warn(...args) {
        // return this.warning(...args)
    }
    error(...args) {
        // console.error(...args)
    }
}
const driver = new Bot_1.default({ host: exports.host, useSsl: exports.useSsl, timeout: exports.timeout, logger: new L() });
// Start subscription to log message stream (used for e2e test and demo)
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        yield driver.login({ username: exports.username, password: exports.password });
        yield driver.connect({});
        // driver.subscribeNotifyAll()
        // driver.subscribeLoggedNotify()
        // driver.subscribeNotifyUser()
        yield driver.respondToMessages((err, msg, msgOpts) => {
            if (err)
                throw err;
            console.log('[respond]', JSON.stringify(msg), JSON.stringify(msgOpts));
            if (msg)
                demo(msg).catch((e) => console.error(e));
        }, {
            rooms: ['GENERAL'],
            allPublic: false,
            dm: true,
            edited: true,
            livechat: false
        });
    });
}
// Demo bot-style interactions
// A: Listen for "tell everyone <something>" and send that something to everyone
// B: Listen for "who's online" and tell that person who's online
function demo(message) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!message.msg)
            return;
        if (/tell everyone/i.test(message.msg)) {
            const match = message.msg.match(/tell everyone (.*)/i);
            if (!match || !match[1])
                return;
            const sayWhat = `@${message.u.username} says "${match[1]}"`;
            const usernames = yield driver.users.allNames();
            for (let username of usernames) {
                if (username && username !== config_1.botUser.username) {
                    const toWhere = yield driver.getDirectMessageRoomId(username);
                    yield delay(200); // delay to prevent rate-limit error
                }
            }
        }
        else if (/who\'?s online/i.test(message.msg)) {
            const names = yield driver.users.onlineNames();
            const niceNames = names.join(', ').replace(/, ([^,]*)$/, ' and $1');
            yield driver.sendToRoomId(niceNames + ' are online', message.rid);
        }
    });
}
start().catch((e) => console.error(e));
//# sourceMappingURL=start.js.map