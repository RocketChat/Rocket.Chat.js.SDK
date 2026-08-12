import ApiRocketChat, { userFields } from '../RocketChat'
import { FakeRestClient, loginPayload } from '../../../test/fakeRestClient'

const createApi = async () => {
  const client = new FakeRestClient()
  const api = new ApiRocketChat({ client })
  client.respond(loginPayload)
  await api.login({ username: 'user', password: 'pass' })
  client.requests = []
  client.respond({})
  return { client, api }
}

const onlineQuery = { query: { status: { $ne: 'offline' } } }

describe('the user queries', () => {
  it('asks for the default user fields and unwraps the users', async () => {
    const { client, api } = await createApi()
    client.respond({ users: [{ _id: 'user-id', username: 'user' }] })

    await expect(api.users.all()).resolves.toEqual([{ _id: 'user-id', username: 'user' }])
    expect(client.lastRequest).toMatchObject({
      method: 'GET',
      url: 'users.list',
      data: { fields: userFields }
    })
  })

  it('narrows to usernames', async () => {
    const { client, api } = await createApi()
    client.respond({ users: [{ username: 'user' }] })

    await expect(api.users.allNames()).resolves.toEqual(['user'])
    expect(client.lastRequest.data).toEqual({ fields: { username: 1 } })
  })

  it('narrows to ids', async () => {
    const { client, api } = await createApi()
    client.respond({ users: [{ _id: 'user-id' }] })

    await expect(api.users.allIDs()).resolves.toEqual(['user-id'])
    expect(client.lastRequest.data).toEqual({ fields: { _id: 1 } })
  })

  it('filters the online users by status', async () => {
    const { client, api } = await createApi()
    client.respond({ users: [] })

    await api.users.online()

    expect(client.lastRequest.data).toEqual({ fields: userFields, ...onlineQuery })
  })

  it('narrows the online users to usernames', async () => {
    const { client, api } = await createApi()
    client.respond({ users: [{ username: 'user' }] })

    await expect(api.users.onlineNames()).resolves.toEqual(['user'])
    expect(client.lastRequest.data).toEqual({ fields: { username: 1 }, ...onlineQuery })
  })

  it('narrows the online users to ids', async () => {
    const { client, api } = await createApi()
    client.respond({ users: [{ _id: 'user-id' }] })

    await expect(api.users.onlineIds()).resolves.toEqual(['user-id'])
    expect(client.lastRequest.data).toEqual({ fields: { _id: 1 }, ...onlineQuery })
  })

  it('looks one user up by username', async () => {
    const { client, api } = await createApi()
    client.respond({ user: { username: 'user' } })

    await expect(api.users.info('user')).resolves.toEqual({ username: 'user' })
    expect(client.lastRequest).toMatchObject({ url: 'users.info', data: { username: 'user' } })
  })
})

describe('the room queries', () => {
  it('reads a room by id', async () => {
    const { client, api } = await createApi()

    await api.rooms.info({ rid: 'room-id' })

    expect(client.lastRequest).toMatchObject({
      method: 'GET',
      url: 'rooms.info',
      data: { rid: 'room-id' }
    })
  })

  it('joins a channel by room id', async () => {
    const { client, api } = await createApi()

    await api.joinRoom({ rid: 'room-id' })

    expect(client.lastRequest).toMatchObject({
      method: 'POST',
      url: 'channels.join',
      data: { roomId: 'room-id' }
    })
  })

  it('leaves a room and answers with the room id', async () => {
    const { client, api } = await createApi()

    await expect(api.leaveRoom('room-id')).resolves.toBe('room-id')
    expect(client.lastRequest).toMatchObject({ method: 'POST', url: 'rooms.leave', data: { rid: 'room-id' } })
  })

  it('creates a direct message from a username', async () => {
    const { client, api } = await createApi()
    client.respond({ room: { _id: 'room-id', t: 'd' } })

    await expect(api.createDirectMessage('user')).resolves.toEqual({ _id: 'room-id', t: 'd' })
    expect(client.lastRequest).toMatchObject({ method: 'POST', url: 'im.create' })
  })

  it('reads a channel', async () => {
    const { client, api } = await createApi()
    client.respond({ channel: { _id: 'room-id', t: 'c' } })

    await expect(api.channelInfo({ roomName: 'general' })).resolves.toEqual({ _id: 'room-id', t: 'c' })
    expect(client.lastRequest).toMatchObject({ url: 'channels.info', data: { roomName: 'general' } })
  })

  it('reads a private group', async () => {
    const { client, api } = await createApi()
    client.respond({ group: { _id: 'room-id', t: 'p' } })

    await expect(api.privateInfo({ roomId: 'room-id' })).resolves.toEqual({ _id: 'room-id', t: 'p' })
    expect(client.lastRequest).toMatchObject({ url: 'groups.info', data: { roomId: 'room-id' } })
  })

  it('resolves a room id from a name', async () => {
    const { client, api } = await createApi()

    await api.getRoomIdByNameOrId('general')

    expect(client.lastRequest).toMatchObject({ url: 'chat.getRoomIdByNameOrId', data: { name: 'general' } })
  })

  it('resolves a room name from an id', async () => {
    const { client, api } = await createApi()
    client.respond({ name: 'general' })

    await expect(api.getRoomNameById('room-id')).resolves.toBe('general')
    expect(client.lastRequest).toMatchObject({ url: 'chat.getRoomNameById', data: { rid: 'room-id' } })
  })

  it('finds a room by name', async () => {
    const { client, api } = await createApi()

    await api.getRoomId('general')

    expect(client.lastRequest).toMatchObject({ url: 'chat.find', data: { name: 'general' } })
  })
})

describe('the message requests', () => {
  it('addresses a sent message to its room and unwraps the receipt', async () => {
    const { client, api } = await createApi()
    client.respond({ message: { _id: 'message-id' } })

    await expect(api.sendMessage('hello', 'room-id')).resolves.toEqual({ _id: 'message-id' })
    expect(client.lastRequest).toMatchObject({ method: 'POST', url: 'chat.sendMessage' })
    expect(client.lastRequest.data.message).toMatchObject({ msg: 'hello', rid: 'room-id' })
  })

  it('edits an existing message by its id', async () => {
    const { client, api } = await createApi()

    await api.editMessage({ _id: 'message-id', rid: 'room-id', msg: 'edited' } as any)

    expect(client.lastRequest).toMatchObject({
      method: 'POST',
      url: 'chat.update',
      data: { roomId: 'room-id', msgId: 'message-id', text: 'edited' }
    })
  })

  it('reacts to an existing message', async () => {
    const { client, api } = await createApi()

    await api.setReaction(':thumbsup:', 'message-id')

    expect(client.lastRequest).toMatchObject({
      method: 'POST',
      url: 'chat.react',
      data: { emoji: ':thumbsup:', messageId: 'message-id' }
    })
  })

  it('syncs a room history from a timestamp', async () => {
    const { client, api } = await createApi()
    client.respond({ result: { updated: [], deleted: [] } })

    await expect(api.loadHistory('room-id', new Date('2026-01-01T00:00:00.000Z'))).resolves.toEqual({
      updated: [],
      deleted: []
    })
    expect(client.lastRequest).toMatchObject({
      method: 'GET',
      url: 'chat.syncMessages',
      data: { roomId: 'room-id', lastUpdate: '2026-01-01T00:00:00.000Z' }
    })
  })
})

describe('the server info request', () => {
  it('unwraps the server info', async () => {
    const { client, api } = await createApi()
    client.respond({ info: { version: '7.0.0' } })

    await expect(api.info()).resolves.toEqual({ version: '7.0.0' })
    expect(client.lastRequest).toMatchObject({ method: 'GET', url: 'info' })
  })
})
