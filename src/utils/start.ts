// Test script uses standard methods and env config to connect and log streams
import * as driver from '../lib/driver'
import { botUser, botRooms } from './config'

// Start subscription to log message stream (used for e2e test)
async function start () {
  await driver.connect()
  await driver.login({ username: botUser.username, password: botUser.password })
  await driver.joinRooms(botRooms)
  await driver.subscribeToMessages()
  await driver.respondToMessages((err, msg, msgOpts) => {
    if (err) throw err
    console.log('[respond]', JSON.stringify(msg), JSON.stringify(msgOpts))
  })
}

start().catch((e) => console.error(e))
