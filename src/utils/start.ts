// Test script uses standard methods and env config to connect and log streams
import { botUser } from './config'
import { IMessage } from '../config/messageInterfaces'
import { api, driver } from '..'
const delay = (ms: number) => new Promise((resolve, reject) => setTimeout(resolve, ms))

// Start subscription to log message stream (used for e2e test and demo)
async function start () {
  await driver.connect()
  await driver.login({ username: botUser.username, password: botUser.password })
  await driver.subscribeToMessages()
  await driver.respondToMessages((err, msg, msgOpts) => {
    if (err) throw err
    console.log('[respond]', JSON.stringify(msg), JSON.stringify(msgOpts))
    demo(msg).catch((e) => console.error(e))
  }, {
    rooms: ['general'],
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
  console.log(message)
  if (!message.msg) return
  if (/tell everyone/i.test(message.msg)) {
    const match = message.msg.match(/tell everyone (.*)/i)
    if (!match || !match[1]) return
    const sayWhat = `@${message.u!.username} says "${match[1]}"`
    const usernames = await api.users.allNames()
    for (let username of usernames) {
      if (username && username !== botUser.username) {
        const toWhere = await driver.getDirectMessageRoomId(username)
        await driver.sendToRoomId(sayWhat, toWhere) // DM ID hax
        await delay(200) // delay to prevent rate-limit error
      }
    }
  } else if (/who\'?s online/i.test(message.msg)) {
    const names = await api.users.onlineNames()
    const niceNames = names.join(', ').replace(/, ([^,]*)$/, ' and $1')
    await driver.sendToRoomId(niceNames + ' are online', message.rid!)
  }
}

start().catch((e) => console.error(e))
