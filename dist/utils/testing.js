import ApiBase from '../lib/api/api';
import { apiUser, botUser, mockUser } from './config';
const api = new ApiBase({});
/** Define common attributes for DRY tests */
export const testChannelName = 'tests';
export const testPrivateName = 'p-tests';
/** Get information about a user */
export async function userInfo(username) {
    return await api.get('users.info', { username }, true);
}
/** Create a user and catch the error if they exist already */
export async function createUser(user) {
    const result = await api.post('users.create', user, true, /already in use/i);
    return result;
}
/** Get information about a channel */
export async function channelInfo(query) {
    return await api.get('channels.info', query, true);
}
/** Get information about a private group */
export async function privateInfo(query) {
    return await api.get('groups.info', query, true);
}
/** Get the last messages sent to a channel (in last 10 minutes) */
export async function lastMessages(roomId, count = 1) {
    const now = new Date();
    const latest = now.toISOString();
    const oldest = new Date(now.setMinutes(now.getMinutes() - 10)).toISOString();
    const history = await api.get('channels.history', { roomId, latest, oldest, count });
    return history.messages;
}
/** Create a room for tests and catch the error if it exists already */
export async function createChannel(name, members = [], readOnly = false) {
    return await api.post('channels.create', { name, members, readOnly }, true);
}
/** Create a private group / room and catch if exists already */
export async function createPrivate(name, members = [], readOnly = false) {
    return await api.post('groups.create', { name, members, readOnly }, true);
}
/** Send message from mock user to channel for tests to listen and respond */
/** @todo Sometimes the post request completes before the change event emits
 *        the message to the streamer. That's why the interval is used for proof
 *        of receipt. It would be better for the endpoint to not resolve until
 *        server side handling is complete. Would require PR to core.
 */
export async function sendFromUser(payload) {
    const user = await api.login({ username: mockUser.username, password: mockUser.password });
    const endpoint = (payload.roomId && payload.roomId.indexOf(user.data.userId) !== -1)
        ? 'dm.history'
        : 'channels.history';
    const roomId = (payload.roomId)
        ? payload.roomId
        : (await channelInfo({ roomName: testChannelName })).channel._id;
    const messageDefaults = { roomId };
    const data = Object.assign({}, messageDefaults, payload);
    const oldest = new Date().toISOString();
    const result = await api.post('chat.postMessage', data, true);
    const proof = new Promise((resolve, reject) => {
        let looked = 0;
        const look = setInterval(async () => {
            const { messages } = await api.get(endpoint, { roomId, oldest });
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
        }, 100);
    });
    await proof;
    return result;
}
/** Leave user from room, to generate `ul` message (test channel by default) */
export async function leaveUser(room = {}) {
    await api.login({ username: mockUser.username, password: mockUser.password });
    if (!room.id && !room.name)
        room.name = testChannelName;
    const roomId = (room.id)
        ? room.id
        : (await channelInfo({ roomName: room.name })).channel._id;
    return await api.post('channels.leave', { roomId });
}
/** Invite user to room, to generate `au` message (test channel by default) */
export async function inviteUser(room = {}) {
    let mockInfo = await userInfo(mockUser.username);
    await api.login({ username: apiUser.username, password: apiUser.password });
    if (!room.id && !room.name)
        room.name = testChannelName;
    const roomId = (room.id)
        ? room.id
        : (await channelInfo({ roomName: room.name })).channel._id;
    return await api.post('channels.invite', { userId: mockInfo.user._id, roomId });
}
/** @todo : Join user into room (enter) to generate `uj` message type. */
/** Update message sent from mock user */
export async function updateFromUser(payload) {
    await api.login({ username: mockUser.username, password: mockUser.password });
    return await api.post('chat.update', payload, true);
}
/** Create a direct message session with the mock user */
export async function setupDirectFromUser() {
    await api.login({ username: mockUser.username, password: mockUser.password });
    return await api.post('im.create', { username: botUser.username }, true);
}
/** Initialise testing instance with the required users for SDK/bot tests */
export async function setup() {
    console.log('\nPreparing instance for tests...');
    try {
        // Verify API user can login
        const loginInfo = await api.login(apiUser);
        if (!loginInfo || loginInfo.status !== 'success') {
            throw new Error(`API user (${apiUser.username}) could not login`);
        }
        else {
            console.log(`API user (${apiUser.username}) logged in`);
        }
        // Verify or create user for bot
        let botInfo = await userInfo(botUser.username);
        if (!botInfo || !botInfo.success) {
            console.log(`Bot user (${botUser.username}) not found`);
            botInfo = await createUser(botUser);
            if (!botInfo.success) {
                throw new Error(`Bot user (${botUser.username}) could not be created`);
            }
            else {
                console.log(`Bot user (${botUser.username}) created`);
            }
        }
        else {
            console.log(`Bot user (${botUser.username}) exists`);
        }
        // Verify or create mock user for talking to bot
        let mockInfo = await userInfo(mockUser.username);
        if (!mockInfo || !mockInfo.success) {
            console.log(`Mock user (${mockUser.username}) not found`);
            mockInfo = await createUser(mockUser);
            if (!mockInfo || mockInfo.success) {
                throw new Error(`Mock user (${mockUser.username}) could not be created`);
            }
            else {
                console.log(`Mock user (${mockUser.username}) created`);
            }
        }
        else {
            console.log(`Mock user (${mockUser.username}) exists`);
        }
        // Verify or create channel for tests
        let testChannelInfo = await channelInfo({ roomName: testChannelName });
        if (!testChannelInfo || !testChannelInfo.success) {
            console.log(`Test channel (${testChannelName}) not found`);
            testChannelInfo = await createChannel(testChannelName, [
                apiUser.username, botUser.username, mockUser.username
            ]);
            if (!testChannelInfo.success) {
                throw new Error(`Test channel (${testChannelName}) could not be created`);
            }
            else {
                console.log(`Test channel (${testChannelName}) created`);
            }
        }
        else {
            console.log(`Test channel (${testChannelName}) exists`);
        }
        // Verify or create private room for tests
        let testPrivateInfo = await privateInfo({ roomName: testPrivateName });
        if (!testPrivateInfo || !testPrivateInfo.success) {
            console.log(`Test private room (${testPrivateName}) not found`);
            testPrivateInfo = await createPrivate(testPrivateName, [
                apiUser.username, botUser.username, mockUser.username
            ]);
            if (!testPrivateInfo.success) {
                throw new Error(`Test private room (${testPrivateName}) could not be created`);
            }
            else {
                console.log(`Test private room (${testPrivateName}) created`);
            }
        }
        else {
            console.log(`Test private room (${testPrivateName}) exists`);
        }
        await api.logout();
    }
    catch (e) {
        throw e;
    }
}
//# sourceMappingURL=testing.js.map