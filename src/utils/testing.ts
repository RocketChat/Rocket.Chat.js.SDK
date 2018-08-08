import { get, post, login, logout } from '../lib/api'
import { apiUser, botUser, mockUser } from './config'
import {
  IMessageAPI,
  IMessageUpdateAPI,
  IMessageResultAPI,
  INewUserAPI,
  IUserResultAPI,
  IRoomResultAPI,
  IChannelResultAPI,
  IMessageReceiptAPI
} from './interfaces'
import { IMessage } from '../config/messageInterfaces'

/** Define common attributes for DRY tests */
export const testChannelName = 'tests'

/** Get information about a user */
export async function userInfo (username: string): Promise<IUserResultAPI> {
  return get('users.info', { username }, true)
}

/** Create a user and catch the error if they exist already */
export async function createUser (user: INewUserAPI): Promise<IUserResultAPI> {
  return post('users.create', user, true, /already in use/i)
}

/** Get information about a channel */
export async function channelInfo (query: { roomName?: string, roomId?: string }): Promise<IChannelResultAPI> {
  return get('channels.info', query, true)
}

/** Get the last messages sent to a channel (in last 10 minutes) */
export async function lastMessages (roomId: string, count: number = 1): Promise<IMessage[]> {
  const now = new Date()
  const latest = now.toISOString()
  const oldest = new Date(now.setMinutes(now.getMinutes() - 10)).toISOString()
  return (await get('channels.history', { roomId, latest, oldest, count })).messages
}

/** Create a room for tests and catch the error if it exists already */
export async function createChannel (
  name: string,
  members: string[] = [],
  readOnly: boolean = false
): Promise<IChannelResultAPI> {
  return post('channels.create', { name, members, readOnly }, true)
}

/** Send message from mock user to channel for tests to listen and respond */
/** @todo Sometimes the post request completes before the change event emits
 *        the message to the streamer. That's why the interval is used for proof
 *        of receipt. It would be better for the endpoint to not resolve until
 *        server side handling is complete. Would require PR to core.
 */
export async function sendFromUser (payload: any): Promise<IMessageResultAPI> {
  const user = await login({ username: mockUser.username, password: mockUser.password })
  const endpoint = (payload.roomId && payload.roomId.indexOf(user.data.userId) !== -1)
    ? 'dm.history'
    : 'channels.history'
  const roomId = (payload.roomId)
    ? payload.roomId
    : (await channelInfo({ roomName: testChannelName })).channel._id
  const messageDefaults: IMessageAPI = { roomId }
  const data: IMessageAPI = Object.assign({}, messageDefaults, payload)
  const oldest = new Date().toISOString()
  const result = await post('chat.postMessage', data, true)
  const proof = new Promise((resolve, reject) => {
    let looked = 0
    const look = setInterval(async () => {
      const { messages } = await get(endpoint, { roomId, oldest })
      const found = messages.some((message: IMessageReceiptAPI) => {
        return result.message._id === message._id
      })
      if (found || looked > 10) {
        clearInterval(look)
        if (found) resolve()
        else reject('API send from user, proof of receipt timeout')
      }
      looked++
    }, 100)
  })
  await proof
  return result
}

/** Update message sent from mock user */
export async function updateFromUser (payload: IMessageUpdateAPI): Promise<IMessageResultAPI> {
  await login({ username: mockUser.username, password: mockUser.password })
  return post('chat.update', payload, true)
}

/** Create a direct message session with the mock user */
export async function setupDirectFromUser (): Promise<IRoomResultAPI> {
  await login({ username: mockUser.username, password: mockUser.password })
  return post('im.create', { username: botUser.username }, true)
}

/** Initialise testing instance with the required users for SDK/bot tests */
export async function setup () {
  console.log('\nPreparing instance for tests...')
  try {
    // Verify API user can login
    const loginInfo = await login(apiUser)
    if (loginInfo.status !== 'success') {
      throw new Error(`API user (${apiUser.username}) could not login`)
    } else {
      console.log(`API user (${apiUser.username}) logged in`)
    }

    // Verify or create user for bot
    let botInfo = await userInfo(botUser.username)
    if (!botInfo || !botInfo.success) {
      console.log(`Bot user (${botUser.username}) not found`)
      botInfo = await createUser(botUser)
      if (!botInfo.success) {
        throw new Error(`Bot user (${botUser.username}) could not be created`)
      } else {
        console.log(`Bot user (${botUser.username}) created`)
      }
    } else {
      console.log(`Bot user (${botUser.username}) exists`)
    }

    // Verify or create mock user for talking to bot
    let mockInfo = await userInfo(mockUser.username)
    if (!mockInfo || !mockInfo.success) {
      console.log(`Mock user (${mockUser.username}) not found`)
      mockInfo = await createUser(mockUser)
      if (!mockInfo.success) {
        throw new Error(`Mock user (${mockUser.username}) could not be created`)
      } else {
        console.log(`Mock user (${mockUser.username}) created`)
      }
    } else {
      console.log(`Mock user (${mockUser.username}) exists`)
    }

    // Verify or create channel for tests
    let testChannelInfo = await channelInfo({ roomName: testChannelName })
    if (!testChannelInfo || !testChannelInfo.success) {
      console.log(`Test channel (${testChannelName}) not found`)
      testChannelInfo = await createChannel(testChannelName)
      if (!testChannelInfo.success) {
        throw new Error(`Test channel (${testChannelName}) could not be created`)
      } else {
        console.log(`Test channel (${testChannelName}) created`)
      }
    } else {
      console.log(`Test channel (${testChannelName}) exists`)
    }

    await logout()
  } catch (e) {
    throw e
  }
}
