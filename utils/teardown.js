const { get, post } = require('./api')
const { apiUser, botUser } = require('./config')

// Logout - invalidates token
get('/api/v1/logout', true)