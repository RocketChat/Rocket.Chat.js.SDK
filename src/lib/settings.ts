
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

// Respond settings - reactive callback filters for .respondToMessages
export let rooms = (process.env.ROCKETCHAT_ROOM)
  ? (process.env.ROCKETCHAT_ROOM || '').split(',').map((room) => room.trim())
  : []
export let allPublic = (process.env.LISTEN_ON_ALL_PUBLIC || 'false').toLowerCase() === 'true'
export let dm = (process.env.RESPOND_TO_DM || 'false').toLowerCase() === 'true'
export let livechat = (process.env.RESPOND_TO_LIVECHAT || 'false').toLowerCase() === 'true'
export let edited = (process.env.RESPOND_TO_EDITED || 'false').toLowerCase() === 'true'

// Message attribute settings
export let integrationId = process.env.INTEGRATION_ID || 'js.SDK'

// Cache settings
export let roomCacheMaxSize = parseInt(process.env.ROOM_CACHE_SIZE || '10', 10)
export let roomCacheMaxAge = 1000 * parseInt(process.env.ROOM_CACHE_MAX_AGE || '300', 10)
export let dmCacheMaxSize = parseInt(process.env.DM_ROOM_CACHE_SIZE || '10', 10)
export let dmCacheMaxAge = 1000 * parseInt(process.env.DM_ROOM_CACHE_MAX_AGE || '100', 10)

// Livechat settings
export let token = process.env.LIVECHAT_TOKEN || ''
export let rid = process.env.LIVECHAT_ROOM || ''
export let department = process.env.LIVECHAT_DEPARTMENT || ''
