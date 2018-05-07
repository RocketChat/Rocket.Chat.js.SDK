"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
// The Mock user, will send messages via API for the bot to respond to
exports.mockUser = {
    email: 'mock@localhost',
    name: 'Mock User',
    password: 'mock',
    username: 'mock',
    active: true,
    roles: ['user'],
    joinDefaultChannels: true,
    requirePasswordChange: false,
    sendWelcomeEmail: false,
    verified: true
};
//# sourceMappingURL=config.js.map