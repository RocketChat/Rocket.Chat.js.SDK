import { get, post, login, logout } from '../lib/api'
import { apiUser, botUser, mockUser } from './config'
import {
  IMessageAPI,
  IMessageUpdateAPI,
  IMessageResultAPI,
  INewUserAPI,
  IUserResultAPI,
  IRoomResultAPI,
  IChannelResultAPI
} from './interfaces'

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
export async function channelInfo (roomName: string): Promise<IChannelResultAPI> {
  return get('channels.info', { roomName }, true)
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
export async function sendFromUser (payload: any): Promise<IMessageResultAPI> {
  const testChannel = await channelInfo(testChannelName)
  const messageDefaults: IMessageAPI = { roomId: testChannel.channel._id }
  const data: IMessageAPI = Object.assign({}, messageDefaults, payload)
  await login({ username: mockUser.username, password: mockUser.password })
  return post('chat.postMessage', data, true)
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
    let testChannelInfo = await channelInfo(testChannelName)
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
