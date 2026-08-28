import RocketChatClient from '../Rocketchat'
import { Driver } from '../../drivers/driver'
import { logger as moduleLogger } from '../../log'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { FakeClient } from '../../../test/fakeClient'
import { loginResponse } from '../../../test/loginResponse'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

const createClient = (restClient?: FakeClient) =>
  new RocketChatClient({ host: 'localhost:3000', logger: createSilentLogger(), client: restClient })

const answerDdpLoginWith = (client: RocketChatClient, login: { id: string, token: string }) =>
  jest.spyOn(client.driver, 'login').mockResolvedValue(login as any)

const loggedInClient = async (ddpToken: string = 'fake-token') => {
  const restClient = new FakeClient()
  const client = createClient(restClient)
  answerDdpLoginWith(client, { id: 'fake-user-id', token: ddpToken })

  const pending = client.login({ username: 'user', password: 'pass' })
  restClient.lastRequest().resolve(loginResponse())
  await pending

  return client
}

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

  it('receives room subscriptions made on the client, with the arguments in order', async () => {
    const client = createClient()
    const subscribeRoom = jest.spyOn(client.driver, 'subscribeRoom').mockResolvedValue([])

    await client.subscribeRoom('GENERAL', false)

    expect(subscribeRoom).toHaveBeenCalledWith('GENERAL', false)
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

describe('client.login', () => {
  it('answers with the realtime session it resumed into', async () => {
    const restClient = new FakeClient()
    const client = createClient(restClient)
    answerDdpLoginWith(client, { id: 'fake-user-id', token: 'fake-token' })

    const pending = client.login({ username: 'user', password: 'pass' })
    restClient.lastRequest().resolve(loginResponse())

    expect(await pending).toMatchObject({ id: 'fake-user-id', token: 'fake-token' })
  })

  it('keeps the answered user on the current login', async () => {
    const client = await loggedInClient()

    expect(client.currentLogin!.result!.me).toMatchObject({ username: 'fake-username' })
  })
})

describe('client.resume', () => {
  const resumedClient = async () => {
    const client = createClient()
    answerDdpLoginWith(client, { id: 'fake-user-id', token: 'fake-token' })
    await client.resume({ token: 'fake-token' })
    return client
  }

  it('resumes the realtime session with the token as a resume credential', async () => {
    const client = createClient()
    const ddpLogin = answerDdpLoginWith(client, { id: 'fake-user-id', token: 'fake-token' })

    await client.resume({ token: 'fake-token' })

    expect(ddpLogin).toHaveBeenCalledWith({ resume: 'fake-token' })
  })

  it('leaves the client logged in for REST', async () => {
    expect((await resumedClient()).loggedIn()).toBe(true)
  })

  it('sets the REST auth headers', async () => {
    expect((await resumedClient()).client.headers).toMatchObject({
      'X-Auth-Token': 'fake-token',
      'X-User-Id': 'fake-user-id'
    })
  })

  it('replaces the login when the token has rotated', async () => {
    const client = await loggedInClient()
    answerDdpLoginWith(client, { id: 'fake-user-id', token: 'rotated' })

    await client.resume({ token: 'rotated' })

    expect(client.currentLogin).toMatchObject({ userId: 'fake-user-id', authToken: 'rotated', username: 'fake-username' })
  })

  it('drops the login result holding the superseded token', async () => {
    const client = await loggedInClient()
    answerDdpLoginWith(client, { id: 'fake-user-id', token: 'rotated' })

    await client.resume({ token: 'rotated' })

    expect(client.currentLogin!.result).toBeNull()
  })

  it('knows neither the username nor the result when there was no previous login', async () => {
    const client = await resumedClient()

    expect(client.currentLogin).toMatchObject({ username: null, result: null })
  })

  it('replaces the login when resuming as another user', async () => {
    const client = await loggedInClient()
    answerDdpLoginWith(client, { id: 'other-id', token: 'other-token' })

    await client.resume({ token: 'other-token' })

    expect(client.currentLogin).toMatchObject({
      username: null,
      userId: 'other-id',
      authToken: 'other-token',
      result: null
    })
  })
})

describe('client.login', () => {
  it('keeps its username but drops its result when the ddp login answers another token', async () => {
    const client = await loggedInClient('ddp-token')

    expect(client.currentLogin).toMatchObject({
      username: 'fake-username',
      authToken: 'ddp-token',
      result: null
    })
  })
})

describe('client.logout', () => {
  const loggedOutClient = async () => {
    const restClient = new FakeClient()
    const client = createClient(restClient)
    client.resumeLogin({ userId: 'fake-user-id', authToken: 'fake-token' })

    const pending = client.logout()
    restClient.lastRequest().resolve({ status: 200, data: {} })
    await pending

    return { client, restClient }
  }

  it('clears the REST auth headers', async () => {
    const { client } = await loggedOutClient()

    expect(client.client.headers).not.toHaveProperty('X-Auth-Token')
  })

  it('reports itself logged out', async () => {
    const { client } = await loggedOutClient()

    expect(client.loggedIn()).toBe(false)
  })

  it('still reaches the REST client with the Endpoint after logout', async () => {
    const { client, restClient } = await loggedOutClient()

    const pending = client.get('me', {})
    restClient.lastRequest().resolve({ status: 200, data: { success: true } })
    await pending

    expect(restClient.lastRequest().endpoint).toBe('me')
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
