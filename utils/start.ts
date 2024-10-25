// Test script uses standard methods and env config to connect and log streams
import { botUser } from './config'
import { IMessage, ILogger } from '../interfaces'
import BotDriver from '../lib/clients/Bot'

global.fetch = require('node-fetch')
// Login settings - LDAP needs to be explicitly enabled
export let username = process.env.ROCKETCHAT_USER || 'g1'
export let password = process.env.ROCKETCHAT_PASSWORD || '1'
export let ldap = (process.env.ROCKETCHAT_AUTH === 'ldap')

// Connection settings - Enable SSL by default if Rocket.Chat URL contains https
export let host = process.env.ROCKETCHAT_URL || 'http://localhost:3000'
export const useSsl = (process.env.ROCKETCHAT_USE_SSL && process.env.ROCKETCHAT_USE_SSL === 'true') || (host).toLowerCase().startsWith('https')
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

const delay = (ms: number) => new Promise((resolve, reject) => setTimeout(resolve, ms))

class L implements ILogger {
  debug (...args: any[]) {
    // console.log(...args)
  }
  info (...args: any[]) {
    // console.log(...args)
  }
  warning (...args: any[]) {
    // console.warn(...args)
  }
  warn (...args: any[]) { // legacy method
    // return this.warning(...args)
  }
  error (...args: any[]) {
    // console.error(...args)
  }
}

const driver = new BotDriver({ host, useSsl, timeout, logger: new L() } as any)
// Start subscription to log message stream (used for e2e test and demo)
async function start () {
  await driver.login({ username, password })
  await driver.connect({})
  // driver.subscribeNotifyAll()
  // driver.subscribeLoggedNotify()
  // driver.subscribeNotifyUser()

  await driver.respondToMessages((err, msg, msgOpts) => {
    if (err) throw err
    console.log('[respond]', JSON.stringify(msg), JSON.stringify(msgOpts))
    if (msg) demo(msg).catch((e) => console.error(e))
  }, {
    rooms: ['GENERAL'],
    allPublic: false,
    dm: true,
    edited: true,
    livechat: false
  })
}

// Demo bot-style interactions
// A: Listen for "tell everyone <something>" and send that something to everyone
// B: Listen for "who's online" and tell that person who's online
async function demo (message: IMessage) {
  if (!message.msg) return
  if (/tell everyone/i.test(message.msg)) {
    const match = message.msg.match(/tell everyone (.*)/i)
    if (!match || !match[1]) return
    // const sayWhat = `@${message.u!.username} says "${match[1]}"`

    const usernames = await driver.users.allNames()
    for (let username of usernames) {
      if (username && username !== botUser.username) {
				// const toWhere =
        await driver.getDirectMessageRoomId(username)
        await delay(200) // delay to prevent rate-limit error
      }
    }
  } else if (/who\'?s online/i.test(message.msg)) {
    const names = await driver.users.onlineNames()
    const niceNames = names.join(', ').replace(/, ([^,]*)$/, ' and $1')
    await driver.sendToRoomId(niceNames + ' are online', message.rid!)
  }
}

start().catch((e) => console.error(e))
