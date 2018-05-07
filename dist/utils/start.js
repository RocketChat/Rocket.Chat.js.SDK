"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Test script uses standard methods and env config to connect and log streams
const config_1 = require("./config");
const __1 = require("..");
const delay = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms));
// Start subscription to log message stream (used for e2e test and demo)
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        yield __1.driver.connect();
        yield __1.driver.login({ username: config_1.botUser.username, password: config_1.botUser.password });
        yield __1.driver.subscribeToMessages();
        yield __1.driver.respondToMessages((err, msg, msgOpts) => {
            if (err)
                throw err;
            console.log('[respond]', JSON.stringify(msg), JSON.stringify(msgOpts));
            demo(msg).catch((e) => console.error(e));
        }, {
            rooms: ['general'],
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
        console.log(message);
        if (!message.msg)
            return;
        if (/tell everyone/i.test(message.msg)) {
            const match = message.msg.match(/tell everyone (.*)/i);
            if (!match || !match[1])
                return;
            const sayWhat = `@${message.u.username} says "${match[1]}"`;
            const usernames = yield __1.api.users.allNames();
            for (let username of usernames) {
                if (username !== config_1.botUser.username) {
                    const toWhere = yield __1.driver.getDirectMessageRoomId(username);
                    yield __1.driver.sendToRoomId(sayWhat, toWhere); // DM ID hax
                    yield delay(200); // delay to prevent rate-limit error
                }
            }
        }
        else if (/who\'?s online/i.test(message.msg)) {
            const names = yield __1.api.users.onlineNames();
            const niceNames = names.join(', ').replace(/, ([^,]*)$/, ' and $1');
            yield __1.driver.sendToRoomId(niceNames + ' are online', message.rid);
        }
    });
}
start().catch((e) => console.error(e));
//# sourceMappingURL=start.js.map