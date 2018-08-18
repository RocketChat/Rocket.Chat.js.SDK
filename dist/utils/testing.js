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
const api_1 = require("../lib/api");
const config_1 = require("./config");
/** Define common attributes for DRY tests */
exports.testChannelName = 'tests';
exports.testPrivateName = 'p-tests';
/** Get information about a user */
function userInfo(username) {
    return __awaiter(this, void 0, void 0, function* () {
        return api_1.get('users.info', { username }, true);
    });
}
exports.userInfo = userInfo;
/** Create a user and catch the error if they exist already */
function createUser(user) {
    return __awaiter(this, void 0, void 0, function* () {
        return api_1.post('users.create', user, true, /already in use/i);
    });
}
exports.createUser = createUser;
/** Get information about a channel */
function channelInfo(query) {
    return __awaiter(this, void 0, void 0, function* () {
        return api_1.get('channels.info', query, true);
    });
}
exports.channelInfo = channelInfo;
/** Get information about a private group */
function privateInfo(query) {
    return __awaiter(this, void 0, void 0, function* () {
        return api_1.get('groups.info', query, true);
    });
}
exports.privateInfo = privateInfo;
/** Get the last messages sent to a channel (in last 10 minutes) */
function lastMessages(roomId, count = 1) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const latest = now.toISOString();
        const oldest = new Date(now.setMinutes(now.getMinutes() - 10)).toISOString();
        return (yield api_1.get('channels.history', { roomId, latest, oldest, count })).messages;
    });
}
exports.lastMessages = lastMessages;
/** Create a room for tests and catch the error if it exists already */
function createChannel(name, members = [], readOnly = false) {
    return __awaiter(this, void 0, void 0, function* () {
        return api_1.post('channels.create', { name, members, readOnly }, true);
    });
}
exports.createChannel = createChannel;
/** Create a private group / room and catch if exists already */
function createPrivate(name, members = [], readOnly = false) {
    return __awaiter(this, void 0, void 0, function* () {
        return api_1.post('groups.create', { name, members, readOnly }, true);
    });
}
exports.createPrivate = createPrivate;
/** Send message from mock user to channel for tests to listen and respond */
/** @todo Sometimes the post request completes before the change event emits
 *        the message to the streamer. That's why the interval is used for proof
 *        of receipt. It would be better for the endpoint to not resolve until
 *        server side handling is complete. Would require PR to core.
 */
function sendFromUser(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        const endpoint = (payload.roomId && payload.roomId.indexOf(user.data.userId) !== -1)
            ? 'dm.history'
            : 'channels.history';
        const roomId = (payload.roomId)
            ? payload.roomId
            : (yield channelInfo({ roomName: exports.testChannelName })).channel._id;
        const messageDefaults = { roomId };
        const data = Object.assign({}, messageDefaults, payload);
        const oldest = new Date().toISOString();
        const result = yield api_1.post('chat.postMessage', data, true);
        const proof = new Promise((resolve, reject) => {
            let looked = 0;
            const look = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                const { messages } = yield api_1.get(endpoint, { roomId, oldest });
                const found = messages.some((message) => {
                    return result.message._id === message._id;
                });
                if (found || looked > 10) {
                    clearInterval(look);
                    if (found)
                        resolve();
                    else
                        reject('API send from user, proof of receipt timeout');
                }
                looked++;
            }), 100);
        });
        yield proof;
        return result;
    });
}
exports.sendFromUser = sendFromUser;
/** Leave user from room, to generate `ul` message (test channel by default) */
function leaveUser(room = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        if (!room.id && !room.name)
            room.name = exports.testChannelName;
        const roomId = (room.id)
            ? room.id
            : (yield channelInfo({ roomName: room.name })).channel._id;
        return api_1.post('channels.leave', { roomId });
    });
}
exports.leaveUser = leaveUser;
/** Invite user to room, to generate `au` message (test channel by default) */
function inviteUser(room = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        let mockInfo = yield userInfo(config_1.mockUser.username);
        yield api_1.login({ username: config_1.apiUser.username, password: config_1.apiUser.password });
        if (!room.id && !room.name)
            room.name = exports.testChannelName;
        const roomId = (room.id)
            ? room.id
            : (yield channelInfo({ roomName: room.name })).channel._id;
        return api_1.post('channels.invite', { userId: mockInfo.user._id, roomId });
    });
}
exports.inviteUser = inviteUser;
/** @todo : Join user into room (enter) to generate `uj` message type. */
/** Update message sent from mock user */
function updateFromUser(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        return api_1.post('chat.update', payload, true);
    });
}
exports.updateFromUser = updateFromUser;
/** Create a direct message session with the mock user */
function setupDirectFromUser() {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        return api_1.post('im.create', { username: config_1.botUser.username }, true);
    });
}
exports.setupDirectFromUser = setupDirectFromUser;
/** Initialise testing instance with the required users for SDK/bot tests */
function setup() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\nPreparing instance for tests...');
        try {
            // Verify API user can login
            const loginInfo = yield api_1.login(config_1.apiUser);
            if (loginInfo.status !== 'success') {
                throw new Error(`API user (${config_1.apiUser.username}) could not login`);
            }
            else {
                console.log(`API user (${config_1.apiUser.username}) logged in`);
            }
            // Verify or create user for bot
            let botInfo = yield userInfo(config_1.botUser.username);
            if (!botInfo || !botInfo.success) {
                console.log(`Bot user (${config_1.botUser.username}) not found`);
                botInfo = yield createUser(config_1.botUser);
                if (!botInfo.success) {
                    throw new Error(`Bot user (${config_1.botUser.username}) could not be created`);
                }
                else {
                    console.log(`Bot user (${config_1.botUser.username}) created`);
                }
            }
            else {
                console.log(`Bot user (${config_1.botUser.username}) exists`);
            }
            // Verify or create mock user for talking to bot
            let mockInfo = yield userInfo(config_1.mockUser.username);
            if (!mockInfo || !mockInfo.success) {
                console.log(`Mock user (${config_1.mockUser.username}) not found`);
                mockInfo = yield createUser(config_1.mockUser);
                if (!mockInfo.success) {
                    throw new Error(`Mock user (${config_1.mockUser.username}) could not be created`);
                }
                else {
                    console.log(`Mock user (${config_1.mockUser.username}) created`);
                }
            }
            else {
                console.log(`Mock user (${config_1.mockUser.username}) exists`);
            }
            // Verify or create channel for tests
            let testChannelInfo = yield channelInfo({ roomName: exports.testChannelName });
            if (!testChannelInfo || !testChannelInfo.success) {
                console.log(`Test channel (${exports.testChannelName}) not found`);
                testChannelInfo = yield createChannel(exports.testChannelName, [
                    config_1.apiUser.username, config_1.botUser.username, config_1.mockUser.username
                ]);
                if (!testChannelInfo.success) {
                    throw new Error(`Test channel (${exports.testChannelName}) could not be created`);
                }
                else {
                    console.log(`Test channel (${exports.testChannelName}) created`);
                }
            }
            else {
                console.log(`Test channel (${exports.testChannelName}) exists`);
            }
            // Verify or create private room for tests
            let testPrivateInfo = yield privateInfo({ roomName: exports.testPrivateName });
            if (!testPrivateInfo || !testPrivateInfo.success) {
                console.log(`Test private room (${exports.testPrivateName}) not found`);
                testPrivateInfo = yield createPrivate(exports.testPrivateName, [
                    config_1.apiUser.username, config_1.botUser.username, config_1.mockUser.username
                ]);
                if (!testPrivateInfo.success) {
                    throw new Error(`Test private room (${exports.testPrivateName}) could not be created`);
                }
                else {
                    console.log(`Test private room (${exports.testPrivateName}) created`);
                }
            }
            else {
                console.log(`Test private room (${exports.testPrivateName}) exists`);
            }
            yield api_1.logout();
        }
        catch (e) {
            throw e;
        }
    });
}
exports.setup = setup;
//# sourceMappingURL=testing.js.map