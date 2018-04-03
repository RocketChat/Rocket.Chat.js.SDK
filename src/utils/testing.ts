import { get, post, login, logout } from './api'
import { apiUser, botUser, mockUser } from './config'
import { IMessageAPI, IMessageUpdateAPI, IMessageResultAPI, INewUserAPI, IUserResultAPI, IRoomResultAPI } from './interfaces'

/** Define common attributes for DRY tests */
const messageDefaults: IMessageAPI = {
  roomId: 'GENERAL'
}

/** Create a user and catch the error if they exist already */
export function createUser (user: INewUserAPI): Promise<IUserResultAPI | undefined> {
  return post('/api/v1/users.create', user, true, /already in use/i)
}

/** Send message from mock user to channel for tests to listen and respond */
export async function sendFromUser (payload: any): Promise<IMessageResultAPI | undefined> {
  const data: IMessageAPI = Object.assign({}, messageDefaults, payload)
  await login({ username: mockUser.username, password: mockUser.password })
  const result = await post('/api/v1/chat.postMessage', data, true)
  await logout()
  return result
}

/** Update message sent from mock user */
export async function updateFromUser (payload: IMessageUpdateAPI): Promise<IMessageResultAPI | undefined> {
  await login({ username: mockUser.username, password: mockUser.password })
  const result = await post('/api/v1/chat.update', payload, true)
  await logout()
  return result
}

/** Create a direct message session with the mock user */
export async function setupDirectFromUser (): Promise<IRoomResultAPI | undefined> {
  await login({ username: mockUser.username, password: mockUser.password })
  const result = await post('/api/v1/im.create', { username: botUser.username }, true)
  await logout()
  return result
}

/** Get user data, to check if they're online or have attributes set */
export async function getUserData (payload: { userId?: string, username?: string }): Promise<IUserResultAPI | undefined> {
  await login(apiUser)
  let param = '?'
  if (payload.userId) param += `userId=${payload.userId}`
  else if (payload.username) param += `username=${payload.username}`
  else throw new Error('User data endpoint requires either userId or username')
  const result = await get('/api/v1/users.info' + param, true)
  await logout()
  return result
}

/** Initialise testing instance with the required users for SDK/bot tests */
export async function setup () {
  await login(apiUser)
  await createUser(botUser)  // Create user for bot
  await createUser(mockUser) // Create mock user user
  await logout()
}
