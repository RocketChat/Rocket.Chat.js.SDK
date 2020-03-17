import ApiBase from '../lib/api/api'
import { apiUser, botUser, mockUser } from './config'
import {
  IMessageAPI,
  IMessageUpdateAPI,
  IMessageResultAPI,
  INewUserAPI,
  IRoomResultAPI,
  IChannelResultAPI,
  IGroupResultAPI,
  IHistoryAPI,
  IMessageReceipt,
	IUserAPI
} from '../interfaces'

const api = new ApiBase({})

/** Define common attributes for DRY tests */
export const testChannelName = 'tests'
export const testPrivateName = 'p-tests'

/** Get information about a user */
export async function userInfo (username: string) {
  return (await api.get('users.info', { username }, true) as IUserAPI)
}

/** Create a user and catch the error if they exist already */
export async function createUser (user: INewUserAPI) {
  return (await api.post('users.create', user, true, /already in use/i)) as IUserAPI
}

/** Get information about a channel */
export async function channelInfo (query: { roomName?: string, roomId?: string }) {
  return api.get('channels.info', query, true) as Promise<IChannelResultAPI>
}

/** Get information about a private group */
export async function privateInfo (query: { roomName?: string, roomId?: string }) {
  return api.get('groups.info', query, true) as Promise<IGroupResultAPI>
}

/** Get the last messages sent to a channel (in last 10 minutes) */
export async function lastMessages (roomId: string, count: number = 1) {
  const now = new Date()
  const latest = now.toISOString()
  const oldest = new Date(now.setMinutes(now.getMinutes() - 10)).toISOString()
  const history = (await api.get('channels.history', { roomId, latest, oldest, count }) as IHistoryAPI)
  return history.messages
}

/** Create a room for tests and catch the error if it exists already */
export async function createChannel (
  name: string,
  members: string[] = [],
  readOnly: boolean = false
) {
  return (await api.post('channels.create', { name, members, readOnly }, true) as IChannelResultAPI)
}

/** Create a private group / room and catch if exists already */
export async function createPrivate (
  name: string,
  members: string[] = [],
  readOnly: boolean = false
) {
  return (api.post('groups.create', { name, members, readOnly }, true))
}

/** Send message from mock user to channel for tests to listen and respond */
/** @todo Sometimes the post request completes before the change event emits
 *        the message to the streamer. That's why the interval is used for proof
 *        of receipt. It would be better for the endpoint to not resolve until
 *        server side handling is complete. Would require PR to core.
 */
export async function sendFromUser (payload: any): Promise<IMessageResultAPI> {
  const user = await api.login({ username: mockUser.username, password: mockUser.password })
  const endpoint = (payload.roomId && payload.roomId.indexOf(user.userId) !== -1)
    ? 'dm.history'
    : 'channels.history'
  const roomId = (payload.roomId)
    ? payload.roomId
    : (await channelInfo({ roomName: testChannelName })).channel._id
  const messageDefaults: IMessageAPI = { roomId }
  const data: IMessageAPI = Object.assign({}, messageDefaults, payload)
  const oldest = new Date().toISOString()
  const result = (await api.post('chat.postMessage', data, true) as IMessageResultAPI)
  const proof = new Promise((resolve, reject) => {
    let looked = 0
    const look = setInterval(async () => {
      const { messages } = (await api.get(endpoint, { roomId, oldest }) as IHistoryAPI)
      const found = messages.some((message: IMessageReceipt) => {
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

/** Leave user from room, to generate `ul` message (test channel by default) */
export async function leaveUser (room: { id?: string, name?: string } = {}) {
  await api.login({ username: mockUser.username, password: mockUser.password })
  if (!room.id && !room.name) room.name = testChannelName
  const roomId = (room.id)
    ? room.id
    : (await channelInfo({ roomName: room.name })).channel._id
  return (await api.post('channels.leave', { roomId }) as Boolean)
}

/** Invite user to room, to generate `au` message (test channel by default) */
export async function inviteUser (room: { id?: string, name?: string } = {}) {
  let mockInfo = await userInfo(mockUser.username)
  await api.login({ username: apiUser.username, password: apiUser.password })
  if (!room.id && !room.name) room.name = testChannelName
  const roomId = (room.id)
    ? room.id
    : (await channelInfo({ roomName: room.name })).channel._id
  return (await api.post('channels.invite', { userId: mockInfo._id, roomId }) as boolean)
}

/** @todo : Join user into room (enter) to generate `uj` message type. */

/** Update message sent from mock user */
export async function updateFromUser (payload: IMessageUpdateAPI) {
  await api.login({ username: mockUser.username, password: mockUser.password })
  return (await api.post('chat.update', payload, true) as IMessageResultAPI)
}

/** Create a direct message session with the mock user */
export async function setupDirectFromUser () {
  await api.login({ username: mockUser.username, password: mockUser.password })
  return (await api.post('im.create', { username: botUser.username }, true) as IRoomResultAPI)
}

/** Initialise testing instance with the required users for SDK/bot tests */
export async function setup () {
  console.log('\nPreparing instance for tests...')
  try {
		// Verify API user can login
    await api.login({ password: apiUser.password, username: apiUser.username })
    console.log(`API user (${apiUser.username}) logged in`)
  } catch (error) {
    console.log(error, apiUser)
    throw new Error(`API user (${apiUser.username}) could not login`)
  }

  try {
    const botInfo = await userInfo(botUser.username)
    console.log(`API user (${botInfo.username}) exists`)
  } catch (error) {
    console.log(`Bot user (${botUser.username}) not found`)
    const botInfo = await createUser(botUser)
    // if (!botInfo.success) {
    //   throw new Error(`Bot user (${botUser.username}) could not be created`)
    // }
    console.log(`Bot user (${botInfo.username}) created`)
  }
  try {
		// Verify or create mock user for talking to bot
    let mockInfo = await userInfo(mockUser.username)
    console.log(`Mock user (${mockInfo.username}) exists`)
  } catch (error) {
    console.log(`Mock user (${mockUser.username}) not found`)
    const mockInfo = await createUser(mockUser)
    // if (!mockInfo || mockInfo.success) {
    //   throw new Error(`Mock user (${mockUser.username}) could not be created`)
    // }
    console.log(`Mock user (${mockInfo.username}) created`)
  }
  try {
		// Verify or create user for bot
    // Verify or create channel for tests
    await channelInfo({ roomName: testChannelName })
    console.log(`Test channel (${testChannelName}) exists`)
  } catch (e) {
    console.log(`Test channel (${testChannelName}) not found`)
    await createChannel(testChannelName, [
      apiUser.username, botUser.username, mockUser.username
    ])
    // if (!testChannelInfo.success) {
    //   throw new Error(`Test channel (${testChannelName}) could not be created`)
    // }
    console.log(`Test channel (${testChannelName}) created`)
  }
  try {
    // Verify or create private room for tests
    await privateInfo({ roomName: testPrivateName })
    console.log(`Test private room (${testPrivateName}) exists`)
  } catch (error) {
    const testPrivateInfo = await createPrivate(testPrivateName, [
      apiUser.username, botUser.username, mockUser.username
    ])
    console.log(`Test private room (${testPrivateInfo.name}) created`)
  }
  await api.logout()
}
