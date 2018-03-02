// The API location, requires a running Rocket.Chat instance
export const apiHost = process.env.ROCKETCHAT_URL || 'http://localhost:3000'

// The API user, should be provisioned on build with local Rocket.Chat
export const apiUser = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASS || 'pass'
}

// The Bot user, will attempt to login and run methods in tests
export const botUser = {
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
}

// Names for roomId lookup and join for test interactions
export const botRooms = ['general']
