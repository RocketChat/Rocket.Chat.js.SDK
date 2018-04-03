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
const api_1 = require("./api");
const config_1 = require("./config");
/** Define common attributes for DRY tests */
const messageDefaults = {
    roomId: 'GENERAL'
};
/** Create a user and catch the error if they exist already */
function createUser(user) {
    return api_1.post('/api/v1/users.create', user, true, /already in use/i);
}
exports.createUser = createUser;
/** Send message from mock user to channel for tests to listen and respond */
function sendFromUser(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = Object.assign({}, messageDefaults, payload);
        yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        const result = yield api_1.post('/api/v1/chat.postMessage', data, true);
        yield api_1.logout();
        return result;
    });
}
exports.sendFromUser = sendFromUser;
/** Update message sent from mock user */
function updateFromUser(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        const result = yield api_1.post('/api/v1/chat.update', payload, true);
        yield api_1.logout();
        return result;
    });
}
exports.updateFromUser = updateFromUser;
/** Create a direct message session with the mock user */
function setupDirectFromUser() {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login({ username: config_1.mockUser.username, password: config_1.mockUser.password });
        const result = yield api_1.post('/api/v1/im.create', { username: config_1.botUser.username }, true);
        yield api_1.logout();
        return result;
    });
}
exports.setupDirectFromUser = setupDirectFromUser;
/** Get user data, to check if they're online or have attributes set */
function getUserData(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login(config_1.apiUser);
        let param = '?';
        if (payload.userId)
            param += `userId=${payload.userId}`;
        else if (payload.username)
            param += `username=${payload.username}`;
        else
            throw new Error('User data endpoint requires either userId or username');
        const result = yield api_1.get('/api/v1/users.info' + param, true);
        yield api_1.logout();
        return result;
    });
}
exports.getUserData = getUserData;
/** Initialise testing instance with the required users for SDK/bot tests */
function setup() {
    return __awaiter(this, void 0, void 0, function* () {
        yield api_1.login(config_1.apiUser);
        yield createUser(config_1.botUser); // Create user for bot
        yield createUser(config_1.mockUser); // Create mock user user
        yield api_1.logout();
    });
}
exports.setup = setup;
//# sourceMappingURL=testing.js.map