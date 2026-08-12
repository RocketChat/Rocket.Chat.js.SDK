
// Login settings - LDAP needs to be explicitly enabled
export let username = process.env.ROCKETCHAT_USER || 'bot'
export let password = process.env.ROCKETCHAT_PASSWORD || 'pass'
export let ldap = (process.env.ROCKETCHAT_AUTH === 'ldap')

// Connection settings - Enable SSL by default if Rocket.Chat URL contains https
export let host = process.env.ROCKETCHAT_URL || 'localhost:3000'
export let useSsl = (process.env.ROCKETCHAT_USE_SSL)
  ? ((process.env.ROCKETCHAT_USE_SSL || '').toString().toLowerCase() === 'true')
  : ((process.env.ROCKETCHAT_URL || '').toString().toLowerCase().startsWith('https'))
export let timeout = 20 * 1000 // 20 seconds

// Message attribute settings
export let integrationId = process.env.INTEGRATION_ID || 'js.SDK'

// Cache settings
export let roomCacheMaxSize = parseInt(process.env.ROOM_CACHE_SIZE || '10', 10)
export let roomCacheMaxAge = 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10)
export let dmCacheMaxSize = parseInt(process.env.DM_ROOM_CACHE_SIZE || '10', 10)
export let dmCacheMaxAge = 1000 * parseInt(process.env.DM_ROOM_CACHE_MAX_AGE || '100', 10)

// Headers settings
export let customHeaders = {};
