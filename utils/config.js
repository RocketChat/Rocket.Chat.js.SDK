require('dotenv').config()

// The API location, requires a running Rocket.Chat instance
const apiHost = process.env.ROCKETCHAT_URL || 'http://localhost:3000'

// The API user, should be provisioned on build with local Rocket.Chat
const apiUser = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASS || 'pass'
}

// The Bot user, will attempt to login and run methods in tests
const botUser = {
  email: 'bot@localhost',
  name: 'Bot',
  password: process.env.ROCKETCHAT_PASSWORD || 'pass',
  username: process.env.ROCKETCHAT_USER || 'bot'
}

module.exports = {
  apiHost,
  apiUser,
  botUser
}