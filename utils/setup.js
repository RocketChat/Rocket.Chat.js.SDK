// READY!
const { get, post, handle } = require('./api')
const { apiUser, botUser } = require('./config')

// SET!
async function setup () {
  try {
    // Login - stores auth token
    await post('/api/v1/login', apiUser)
    // Logout - invalidates token
    await get('/api/v1/logout', true)
    //
  } catch (err) {
    handle(err)
  }
}

// GO!
setup()