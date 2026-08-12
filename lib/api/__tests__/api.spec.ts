import Api from '../api'
import { createApiWith, loginPayload, logIn } from '../../../test/fakeRestClient'

const createApi = () => createApiWith(client => new Api({ client }))

const createLoggedInApi = async () => {
  const { client, api } = createApi()
  await logIn(client, api)
  return { client, api }
}

describe('the REST request seam', () => {
  it('forwards the method it was asked for', async () => {
    const { client, api } = await createLoggedInApi()

    await api.get('info')
    await api.post('chat.sendMessage')
    await api.put('chat.update')
    await api.del('chat.delete')

    expect(client.requests.map(request => request.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE'])
    expect(client.requests.map(request => request.url)).toEqual([
      'info',
      'chat.sendMessage',
      'chat.update',
      'chat.delete'
    ])
  })

  it('defaults the payload to an empty object and the api version to v1', async () => {
    const { client, api } = await createLoggedInApi()

    await api.get('info')

    expect(client.lastRequest.data).toEqual({})
    expect(client.lastRequest.apiVersion).toBe('v1')
  })

  it('passes an explicit payload and api version through', async () => {
    const { client, api } = await createLoggedInApi()

    await api.get('rooms.info', { rid: 'room-id' }, true, undefined, {}, 'v2')

    expect(client.lastRequest.data).toEqual({ rid: 'room-id' })
    expect(client.lastRequest.apiVersion).toBe('v2')
  })

  it('keeps the caller options and adds its own abort signal', async () => {
    const { client, api } = await createLoggedInApi()

    await api.get('info', {}, true, undefined, { customHeaders: { 'X-Custom': '1' } })

    expect(client.lastRequest.options.customHeaders).toEqual({ 'X-Custom': '1' })
    expect(client.lastRequest.options.signal).toBeInstanceOf(AbortSignal)
    expect(client.lastRequest.options.signal.aborted).toBe(false)
  })

  it('replaces a signal the caller supplied with its own', async () => {
    const { client, api } = await createLoggedInApi()
    const callerSignal = new AbortController().signal

    await api.get('info', {}, true, undefined, { signal: callerSignal })

    expect(client.lastRequest.options.signal).not.toBe(callerSignal)
  })
})

describe('the login requirement', () => {
  it('reaches the client for an endpoint that does not need auth', async () => {
    const { client, api } = createApi()

    await api.get('info', {}, false)

    expect(client.lastRequest.url).toBe('info')
  })

  // https://github.com/RocketChat/Rocket.Chat.js.SDK/issues/270
  it('sends an endpoint that needs auth even with no current login', async () => {
    const { client, api } = createApi()

    expect(api.currentLogin).toBeNull()
    expect(api.loggedIn()).toBe(true)
    await api.get('info', {}, true)

    expect(client.lastRequest.url).toBe('info')
  })
})

describe('reading the result', () => {
  it('returns the payload the server sent', async () => {
    const { client, api } = await createLoggedInApi()
    client.respond({ info: { version: '7.0.0' } })

    await expect(api.get('info')).resolves.toEqual({ info: { version: '7.0.0' } })
  })

  it('rejects with the whole result on a failure status', async () => {
    const { client, api } = await createLoggedInApi()
    client.respond({ error: 'unauthorized' }, 401)

    await expect(api.get('info')).rejects.toEqual({ status: 401, data: { error: 'unauthorized' } })
  })

  it('accepts a failure status the caller asked to ignore', async () => {
    const { client, api } = await createLoggedInApi()
    client.respond({ error: 'not-found' }, 404)

    await expect(api.get('info', {}, true, /404/)).resolves.toEqual({ error: 'not-found' })
  })

  it('rejects when the client resolves with nothing', async () => {
    const { client, api } = await createLoggedInApi()
    client.respondWith = () => undefined

    await expect(api.get('info')).rejects.toThrow('API GET info result undefined')
  })

  it('returns the whole result for a DELETE that carries no payload', async () => {
    const { client, api } = await createLoggedInApi()
    client.respondWith = () => ({ status: 200 })

    await expect(api.del('chat.delete')).resolves.toEqual({ status: 200 })
  })
})

describe('abort', () => {
  it('aborts the signal the in-flight requests were given', async () => {
    const { client, api } = await createLoggedInApi()
    await api.get('info')

    api.abort()

    expect(client.lastRequest.options.signal.aborted).toBe(true)
  })

  it('leaves the client usable, with a fresh signal for the next request', async () => {
    const { client, api } = await createLoggedInApi()
    await api.get('info')
    api.abort()

    await api.get('info')

    expect(client.lastRequest.options.signal.aborted).toBe(false)
  })
})

describe('login', () => {
  it('records the current login and authorizes the client', async () => {
    const { client, api } = createApi()
    client.respond(loginPayload)

    await api.login({ username: 'user', password: 'pass' })

    expect(client.lastRequest.url).toBe('login')
    expect(api.currentLogin).toEqual({
      username: 'user',
      userId: 'user-id',
      authToken: 'auth-token',
      result: loginPayload.data
    })
    expect(api.userId).toBe('user-id')
    expect(api.username).toBe('user')
    expect(api.loggedIn()).toBe(true)
    expect(client.headers).toEqual({ 'X-Auth-Token': 'auth-token', 'X-User-Id': 'user-id' })
  })

  it('logs out to nothing when there is no current login', async () => {
    const { client, api } = createApi()

    await expect(api.logout()).resolves.toBeNull()
    expect(client.requests).toHaveLength(0)
  })

  it('clears the current login on logout', async () => {
    const { client, api } = await createLoggedInApi()

    await api.logout()

    expect(client.lastRequest.url).toBe('logout')
    expect(api.currentLogin).toBeNull()
    expect(api.userId).toBe('')
  })
})

describe('prepareMessage', () => {
  it('addresses the message to the room it was given', () => {
    const { api } = createApi()

    expect(api.prepareMessage('hello', 'room-id')).toMatchObject({ msg: 'hello', rid: 'room-id' })
  })
})
