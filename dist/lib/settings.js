"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Login settings - LDAP needs to be explicitly enabled
exports.username = process.env.ROCKETCHAT_USER || 'bot';
exports.password = process.env.ROCKETCHAT_PASSWORD || 'pass';
exports.ldap = (process.env.ROCKETCHAT_AUTH === 'ldap');
// Connection settings - Enable SSL by default if Rocket.Chat URL contains https
exports.host = process.env.ROCKETCHAT_URL || 'localhost:3000';
exports.useSsl = (process.env.ROCKETCHAT_USE_SSL)
    ? ((process.env.ROCKETCHAT_USE_SSL || '').toString().toLowerCase() === 'true')
    : ((process.env.ROCKETCHAT_URL || '').toString().toLowerCase().startsWith('https'));
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
//# sourceMappingURL=settings.js.map