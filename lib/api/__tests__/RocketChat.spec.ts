import { userFields } from '../RocketChat'
import { anonymousApiRocketChatWithFakeClient } from '../../../test/apiFixtures'

const reply = (data: any) => ({ status: 200, data })

const apiAnswering = (...replies: any[]) => {
  const { api, restClient } = anonymousApiRocketChatWithFakeClient()
  restClient.enqueueReply(...replies.map(reply))
  return { api, restClient }
}

describe('users', () => {
  it('lists the users under the default fields', async () => {
    const { api, restClient } = apiAnswering({ users: [{ username: 'first' }] })

    await expect(api.users.all()).resolves.toEqual([{ username: 'first' }])
    expect(restClient.lastRequest()).toMatchObject({
      method: 'GET',
      endpoint: 'users.list',
      data: { fields: userFields }
    })
  })

  it('lists the users under the fields the caller asked for', async () => {
    const { api, restClient } = apiAnswering({ users: [] })

    await api.users.all({ emails: 1 })

    expect(restClient.lastRequest().data).toEqual({ fields: { emails: 1 } })
  })

  it('answers only the usernames when asked for all names', async () => {
    const { api, restClient } = apiAnswering({ users: [{ username: 'first' }, { username: 'second' }] })

    await expect(api.users.allNames()).resolves.toEqual(['first', 'second'])
    expect(restClient.lastRequest().data).toEqual({ fields: { username: 1 } })
  })

  it('answers only the ids when asked for all ids', async () => {
    const { api, restClient } = apiAnswering({ users: [{ _id: 'one' }, { _id: 'two' }] })

    await expect(api.users.allIDs()).resolves.toEqual(['one', 'two'])
    expect(restClient.lastRequest().data).toEqual({ fields: { _id: 1 } })
  })

  it('queries out the offline users when asked for the online ones', async () => {
    const { api, restClient } = apiAnswering({ users: [{ username: 'online' }] })

    await expect(api.users.online()).resolves.toEqual([{ username: 'online' }])
    expect(restClient.lastRequest().data).toEqual({
      fields: userFields,
      query: { status: { $ne: 'offline' } }
    })
  })

  it('queries the online users under the fields the caller asked for', async () => {
    const { api, restClient } = apiAnswering({ users: [] })

    await api.users.online({ emails: 1 })

    expect(restClient.lastRequest().data).toMatchObject({ fields: { emails: 1 } })
  })

  it('answers only the usernames when asked for the online names', async () => {
    const { api, restClient } = apiAnswering({ users: [{ username: 'online' }] })

    await expect(api.users.onlineNames()).resolves.toEqual(['online'])
    expect(restClient.lastRequest().data).toEqual({
      fields: { username: 1 },
      query: { status: { $ne: 'offline' } }
    })
  })

  it('answers only the ids when asked for the online ids', async () => {
    const { api, restClient } = apiAnswering({ users: [{ _id: 'one' }] })

    await expect(api.users.onlineIds()).resolves.toEqual(['one'])
    expect(restClient.lastRequest().data).toEqual({
      fields: { _id: 1 },
      query: { status: { $ne: 'offline' } }
    })
  })

  it('answers the user the info endpoint holds under the username', async () => {
    const { api, restClient } = apiAnswering({ user: { _id: 'one', username: 'first' } })

    await expect(api.users.info('first')).resolves.toEqual({ _id: 'one', username: 'first' })
    expect(restClient.lastRequest()).toMatchObject({ endpoint: 'users.info', data: { username: 'first' } })
  })
})

describe('rooms', () => {
  it('asks the rooms info endpoint for the room id', async () => {
    const { api, restClient } = apiAnswering({ room: { _id: 'GENERAL' } })

    await expect(api.rooms.info({ rid: 'GENERAL' })).resolves.toEqual({ room: { _id: 'GENERAL' } })
    expect(restClient.lastRequest()).toMatchObject({ endpoint: 'rooms.info', data: { rid: 'GENERAL' } })
  })

  it('joins a room by posting the room id as roomId', async () => {
    const { api, restClient } = apiAnswering({ success: true })

    await expect(api.joinRoom({ rid: 'GENERAL' })).resolves.toEqual({ success: true })
    expect(restClient.lastRequest()).toMatchObject({
      method: 'POST',
      endpoint: 'channels.join',
      data: { roomId: 'GENERAL' }
    })
  })

  it('leaves a room and answers the room id it left', async () => {
    const { api, restClient } = apiAnswering({ success: true })

    await expect(api.leaveRoom('GENERAL')).resolves.toBe('GENERAL')
    expect(restClient.lastRequest()).toMatchObject({
      method: 'POST',
      endpoint: 'rooms.leave',
      data: { rid: 'GENERAL' }
    })
  })

  it('asks chat.getRoomIdByNameOrId for the name and answers its result untouched', async () => {
    const { api, restClient } = apiAnswering({ _id: 'GENERAL' })

    await expect(api.getRoomIdByNameOrId('general')).resolves.toEqual({ _id: 'GENERAL' })
    expect(restClient.lastRequest()).toMatchObject({
      endpoint: 'chat.getRoomIdByNameOrId',
      data: { name: 'general' }
    })
  })

  it('asks chat.find for the name and answers its result untouched', async () => {
    const { api, restClient } = apiAnswering({ _id: 'GENERAL' })

    await expect(api.getRoomId('general')).resolves.toEqual({ _id: 'GENERAL' })
    expect(restClient.lastRequest()).toMatchObject({ endpoint: 'chat.find', data: { name: 'general' } })
  })

  it('asks chat.getRoomNameById for the room id and answers the name it holds', async () => {
    const { api, restClient } = apiAnswering({ name: 'general' })

    await expect(api.getRoomName('GENERAL')).resolves.toBe('general')
    expect(restClient.lastRequest()).toMatchObject({
      endpoint: 'chat.getRoomNameById',
      data: { rid: 'GENERAL' }
    })
  })

  it('asks chat.getRoomNameById under the id-specific name too', async () => {
    const { api, restClient } = apiAnswering({ name: 'general' })

    await expect(api.getRoomNameById('GENERAL')).resolves.toBe('general')
    expect(restClient.lastRequest().endpoint).toBe('chat.getRoomNameById')
  })

  it('answers the room a direct message creation holds', async () => {
    const { api, restClient } = apiAnswering({ room: { _id: 'direct' } })

    await expect(api.createDirectMessage('first')).resolves.toEqual({ _id: 'direct' })
    expect(restClient.lastRequest()).toMatchObject({
      method: 'POST',
      endpoint: 'im.create',
      data: { username: 'first' }
    })
  })

  it('answers the channel the public info endpoint holds', async () => {
    const { api, restClient } = apiAnswering({ channel: { _id: 'GENERAL' } })

    await expect(api.channelInfo({ roomName: 'general' })).resolves.toEqual({ _id: 'GENERAL' })
    expect(restClient.lastRequest()).toMatchObject({
      endpoint: 'channels.info',
      data: { roomName: 'general' }
    })
  })

  it('answers the group the private info endpoint holds', async () => {
    const { api, restClient } = apiAnswering({ group: { _id: 'private' } })

    await expect(api.privateInfo({ roomId: 'private' })).resolves.toEqual({ _id: 'private' })
    expect(restClient.lastRequest()).toMatchObject({
      endpoint: 'groups.info',
      data: { roomId: 'private' }
    })
  })
})

describe('messages', () => {
  it('sends a message text prepared for the room', async () => {
    const { api, restClient } = apiAnswering({ message: { _id: 'sent' } })

    await expect(api.sendMessage('hello', 'GENERAL')).resolves.toEqual({ _id: 'sent' })
    expect(restClient.lastRequest()).toMatchObject({
      method: 'POST',
      endpoint: 'chat.sendMessage',
      data: { message: { msg: 'hello', rid: 'GENERAL', roomId: 'GENERAL' } }
    })
  })

  it('sends a message object addressed to the room', async () => {
    const { api, restClient } = apiAnswering({ message: { _id: 'sent' } })

    await api.sendMessage({ msg: 'hello', alias: 'bot' }, 'GENERAL')

    expect(restClient.lastRequest().data.message).toMatchObject({
      msg: 'hello',
      alias: 'bot',
      rid: 'GENERAL'
    })
  })

  it('edits a message by its room, id and text', async () => {
    const { api, restClient } = apiAnswering({ message: { _id: 'edited' } })

    await expect(api.editMessage({ _id: 'edited', rid: 'GENERAL', msg: 'new text' }))
      .resolves.toEqual({ message: { _id: 'edited' } })
    expect(restClient.lastRequest()).toMatchObject({
      method: 'POST',
      endpoint: 'chat.update',
      data: { roomId: 'GENERAL', msgId: 'edited', text: 'new text' }
    })
  })

  it('reacts to a message by emoji and message id', async () => {
    const { api, restClient } = apiAnswering({ success: true })

    await expect(api.setReaction(':thumbsup:', 'sent')).resolves.toEqual({ success: true })
    expect(restClient.lastRequest()).toMatchObject({
      method: 'POST',
      endpoint: 'chat.react',
      data: { emoji: ':thumbsup:', messageId: 'sent' }
    })
  })

  it('answers the sync result and sends the last update as an iso string', async () => {
    const { api, restClient } = apiAnswering({ result: { updated: [], deleted: [] } })

    await expect(api.loadHistory('GENERAL', new Date('2026-08-31T00:00:00.000Z')))
      .resolves.toEqual({ updated: [], deleted: [] })
    expect(restClient.lastRequest()).toMatchObject({
      endpoint: 'chat.syncMessages',
      data: { roomId: 'GENERAL', lastUpdate: '2026-08-31T00:00:00.000Z' }
    })
  })
})

describe('server info', () => {
  it('answers the info the endpoint holds', async () => {
    const { api, restClient } = apiAnswering({ info: { version: '7.0.0' } })

    await expect(api.info()).resolves.toEqual({ version: '7.0.0' })
    expect(restClient.lastRequest()).toMatchObject({ endpoint: 'info', data: {} })
  })
})
