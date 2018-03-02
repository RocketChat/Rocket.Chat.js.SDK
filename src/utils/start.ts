// Test script uses standard methods and env config to connect and log streams
import * as driver from '../lib/driver'
import { botUser, botRooms } from './config'

// Start subscription to log message stream (used for e2e test)
function start () {
  const credentials = { username: botUser.username, password: botUser.password }
  driver.connect()
  .then(() => driver.login(credentials))
  .then(() => driver.joinRooms(botRooms))
  .then(() => driver.subscribeToMessages())
  .then(() => driver.reactToMessages((err, msg, msgOpts) => {
    if (err) throw err
    console.log('[message]', JSON.stringify(msg), JSON.stringify(msgOpts))
  }))
  .catch(() => console.error('START FAILED')) // caught within each
}

start()
