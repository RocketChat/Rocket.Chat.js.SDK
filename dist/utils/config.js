"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// The API location, requires a running Rocket.Chat instance
exports.apiHost = process.env.ROCKETCHAT_URL || 'http://localhost:3000';
// The API user, should be provisioned on build with local Rocket.Chat
exports.apiUser = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASS || 'pass'
};
// The Bot user, will attempt to login and run methods in tests
exports.botUser = {
    email: 'bot@localhost',
    name: 'Bot',
    password: process.env.ROCKETCHAT_PASSWORD || 'pass',
    username: process.env.ROCKETCHAT_USER || 'bot',
    active: true,
    roles: ['bot'],
    joinDefaultChannels: true,
    requirePasswordChange: false,
    sendWelcomeEmail: false,
    verified: true
};
// Names for roomId lookup and join for test interactions
exports.botRooms = ['general'];
//# sourceMappingURL=config.js.map