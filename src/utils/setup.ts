import { post, handle } from './api'
import { apiUser, botUser } from './config'

export async function setup () {
  try {
    await post('/api/v1/login', apiUser)              // Login - stores auth token
    await post('/api/v1/users.create', botUser, true) // Create user for bot
    await post('/api/v1/logout', true)                // Logout - invalidates token
  } catch (err) {
    handle(err)
  }
}
