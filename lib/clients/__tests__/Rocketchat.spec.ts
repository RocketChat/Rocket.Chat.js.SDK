import RocketChatClient from '../Rocketchat'
import { Driver } from '../../drivers/driver'
import { logger as moduleLogger } from '../../log'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { FakeClient } from '../../../test/fakeClient'
import { loginResponse } from '../../../test/loginResponse'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

const createClient = (client?: FakeClient) =>
  new RocketChatClient({ host: 'localhost:3000', logger: createSilentLogger(), client })

describe('client.driver', () => {
  it('is the Driver', () => {
    const client = createClient()

    expect(client.driver).toBeInstanceOf(Driver)
  })

  it('receives method calls made on the client', async () => {
    const client = createClient()
    const methodCall = jest.spyOn(client.driver, 'methodCall').mockResolvedValue(undefined as any)

    await client.methodCall('getRoomIdByNameOrId', 'general')

    expect(methodCall).toHaveBeenCalledWith('getRoomIdByNameOrId', 'general')
  })

  it('receives room subscriptions made on the client', async () => {
    const client = createClient()
    const subscribeRoom = jest.spyOn(client.driver, 'subscribeRoom').mockResolvedValue([])

    await client.subscribeRoom('GENERAL')

    expect(subscribeRoom).toHaveBeenCalledWith('GENERAL')
  })

  it('receives subscriptions made on the client, with the arguments in order', async () => {
    const client = createClient()
    const subscribe = jest.spyOn(client.driver, 'subscribe').mockResolvedValue(undefined)

    await client.subscribe('stream-room-messages', 'GENERAL', false)

    expect(subscribe).toHaveBeenCalledWith('stream-room-messages', 'GENERAL', false)
  })

  it('is not exposed on the client under a socket field', () => {
    expect('socket' in createClient()).toBe(false)
  })
})

describe('client.resume', () => {
  const resumed = async () => {
    const client = createClient()
    jest.spyOn(client.driver, 'login').mockResolvedValue({ id: 'id', token: 'token' } as any)
    await client.resume({ token: 'token' })
    return client
  }

  it('leaves the client logged in for REST', async () => {
    expect((await resumed()).loggedIn()).toBe(true)
  })

  it('sets the REST auth headers', async () => {
    expect((await resumed()).client.headers).toMatchObject({
      'X-Auth-Token': 'token',
      'X-User-Id': 'id'
    })
  })

  const loggedInClient = async () => {
    const rest = new FakeClient()
    const client = createClient(rest)
    jest.spyOn(client.driver, 'login').mockResolvedValue({ id: 'id', token: 'token' } as any)

    const pending = client.login({ username: 'user', password: 'pass' })
    rest.lastRequest().resolve(loginResponse())
    await pending

    return client
  }

  it('leaves an existing login with the same credentials untouched', async () => {
    const client = await loggedInClient()

    await client.resume({ token: 'token' })

    expect(client.currentLogin).toMatchObject({ username: 'user', authToken: 'token' })
  })

  it('replaces the login when the token has rotated', async () => {
    const client = await loggedInClient()
    jest.spyOn(client.driver, 'login').mockResolvedValue({ id: 'id', token: 'rotated' } as any)

    await client.resume({ token: 'rotated' })

    expect(client.currentLogin).toMatchObject({ userId: 'id', authToken: 'rotated', username: 'user' })
  })

  it('drops the login result holding the superseded token', async () => {
    const client = await loggedInClient()
    jest.spyOn(client.driver, 'login').mockResolvedValue({ id: 'id', token: 'rotated' } as any)

    await client.resume({ token: 'rotated' })

    expect(client.currentLogin!.result).toBeNull()
  })

  it('replaces the login when resuming as another user', async () => {
    const client = await loggedInClient()
    jest.spyOn(client.driver, 'login').mockResolvedValue({ id: 'other-id', token: 'other-token' } as any)

    await client.resume({ token: 'other-token' })

    expect(client.currentLogin).toMatchObject({ userId: 'other-id', authToken: 'other-token' })
  })
})

describe('client.logout', () => {
  const loggedOutClient = async () => {
    const rest = new FakeClient()
    const client = createClient(rest)
    client.resumeLogin({ userId: 'id', authToken: 'token' })

    const pending = client.logout()
    rest.lastRequest().resolve({ status: 200, data: {} })
    await pending

    return client
  }

  it('clears the REST auth headers', async () => {
    expect((await loggedOutClient()).client.headers).not.toHaveProperty('X-Auth-Token')
  })

  it('leaves the guard refusing an authenticated request', async () => {
    const client = await loggedOutClient()

    expect(client.loggedIn()).toBe(false)
    await expect(client.get('me', {})).rejects.toThrow(/requires a login/)
  })
})

describe('client.logger', () => {
  it('is the logger the client was handed', () => {
    const logger = createSilentLogger()

    expect(new RocketChatClient({ host: 'localhost:3000', logger }).logger).toBe(logger)
  })

  it('falls back to the module logger when the client is handed none', () => {
    expect(new RocketChatClient({ host: 'localhost:3000' }).logger).toBe(moduleLogger)
  })
})

describe('client.url', () => {
  it('resolves to the driver host', async () => {
    expect(await createClient().url).toBe('localhost:3000')
  })
})
