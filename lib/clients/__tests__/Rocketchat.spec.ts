import RocketChatClient from '../Rocketchat'
import { Protocols } from '../../drivers'
import { logger as Logger } from '../../log'
import { silentLogger } from '../../../test/silentLogger'

const mockDrivers: any[] = []

jest.mock('../../drivers/ddp', () => ({
  DDPDriver: class {
    options: any
    config: any
    connect = jest.fn(async () => 'connected')
    disconnect = jest.fn(async () => 'disconnected')
    checkAndReopen = jest.fn()
    onStreamData = jest.fn(async () => 'stream-data')
    subscribe = jest.fn(async () => 'subscribed')
    subscribeRaw = jest.fn(async () => 'subscribed-raw')
    unsubscribe = jest.fn(async () => 'unsubscribed')
    unsubscribeAll = jest.fn(async () => 'unsubscribed-all')
    subscribeRoom = jest.fn(async () => ['room'])
    subscribeNotifyAll = jest.fn(async () => 'notify-all')
    subscribeLoggedNotify = jest.fn(async () => 'logged-notify')
    subscribeNotifyUser = jest.fn(async () => 'notify-user')
    onMessage = jest.fn(async () => 'on-message')
    methodCall = jest.fn(async () => 'method-result')
    login = jest.fn(async () => 'realtime-login')

    constructor (options: any) {
      this.options = options
      this.config = { host: options.host }
      mockDrivers.push(this)
    }
  }
}))

const clientWithDriver = async (options: any = {}) => {
  const client = new RocketChatClient({ logger: silentLogger, ...options })
  const driver: any = await client.socket

  return { client, driver }
}

beforeEach(() => {
  mockDrivers.length = 0
})

describe('new RocketChatClient', () => {
  it('forwards the server options to the driver', async () => {
    const { driver } = await clientWithDriver({
      host: 'https://open.rocket.chat',
      useSsl: true,
      timeout: 250,
      ping: 500,
      reopen: 1000
    })

    expect(driver.options).toMatchObject({
      host: 'https://open.rocket.chat',
      useSsl: true,
      timeout: 250,
      ping: 500,
      reopen: 1000
    })
  })

  it('keeps the options the client consumes itself out of the driver options', async () => {
    const { driver } = await clientWithDriver({
      protocol: Protocols.DDP,
      allPublic: true,
      rooms: ['general'],
      integrationId: 'js.SDK'
    })

    expect(driver.options).not.toHaveProperty('protocol')
    expect(driver.options).not.toHaveProperty('allPublic')
    expect(driver.options).not.toHaveProperty('rooms')
    expect(driver.options).not.toHaveProperty('integrationId')
  })

  it('gives the driver the same logger it keeps', async () => {
    const { client, driver } = await clientWithDriver()

    expect(client.logger).toBe(silentLogger)
    expect(driver.options.logger).toBe(silentLogger)
  })

  it('defaults the logger when none is given', async () => {
    const client = new RocketChatClient({})
    const driver: any = await client.socket

    expect(client.logger).toBe(Logger)
    expect(driver.options.logger).toBe(Logger)
  })

  it('builds exactly one driver', async () => {
    await clientWithDriver()

    expect(mockDrivers).toHaveLength(1)
  })

  it('exposes the resolved driver as `ddp`', async () => {
    const { client, driver } = await clientWithDriver()

    expect(client.ddp).toBe(driver)
  })

  it('rejects a protocol it has no driver for', () => {
    expect(() => new RocketChatClient({ protocol: 'mqtt' as Protocols, logger: silentLogger }))
      .toThrow('Invalid Protocol: mqtt, valids: MQTT,DDP')
  })
})

describe('RocketChatClient realtime delegation', () => {
  it('delegates connect with the given socket options', async () => {
    const { client, driver } = await clientWithDriver()

    await expect(client.connect({ timeout: 250 })).resolves.toBe('connected')
    expect(driver.connect).toHaveBeenCalledWith({ timeout: 250 })
  })

  it('delegates subscribe with every argument', async () => {
    const { client, driver } = await clientWithDriver()

    await client.subscribe('stream-room-messages', 'rid', false)

    expect(driver.subscribe).toHaveBeenCalledWith('stream-room-messages', 'rid', false)
  })

  it('delegates a method call with every argument', async () => {
    const { client, driver } = await clientWithDriver()

    await expect(client.methodCall('loadHistory', 'rid', 20)).resolves.toBe('method-result')
    expect(driver.methodCall).toHaveBeenCalledWith('loadHistory', 'rid', 20)
  })

  it('delegates the remaining socket calls to the driver', async () => {
    const { client, driver } = await clientWithDriver()
    const callback = jest.fn()
    const subscription: any = { id: 'sub-1' }

    await client.disconnect()
    await client.checkAndReopen()
    await client.onStreamData('event', callback)
    await client.subscribeRaw('raw')
    await client.unsubscribe(subscription)
    await client.unsubscribeAll()
    await client.subscribeRoom('rid', 'arg')
    await client.subscribeNotifyAll()
    await client.subscribeLoggedNotify()
    await client.subscribeNotifyUser()
    await client.onMessage(callback)

    expect(driver.disconnect).toHaveBeenCalled()
    expect(driver.checkAndReopen).toHaveBeenCalled()
    expect(driver.onStreamData).toHaveBeenCalledWith('event', callback)
    expect(driver.subscribeRaw).toHaveBeenCalledWith('raw')
    expect(driver.unsubscribe).toHaveBeenCalledWith(subscription)
    expect(driver.unsubscribeAll).toHaveBeenCalled()
    expect(driver.subscribeRoom).toHaveBeenCalledWith('rid', 'arg')
    expect(driver.subscribeNotifyAll).toHaveBeenCalled()
    expect(driver.subscribeLoggedNotify).toHaveBeenCalled()
    expect(driver.subscribeNotifyUser).toHaveBeenCalled()
    expect(driver.onMessage).toHaveBeenCalledWith(callback)
  })

  it('reads the url off the driver config', async () => {
    const { client } = await clientWithDriver({ host: 'https://open.rocket.chat' })

    await expect(client.url).resolves.toBe('https://open.rocket.chat')
  })
})

describe('RocketChatClient login', () => {
  const restClient = () => ({
    headers: {},
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    post: jest.fn(async () => ({
      data: { data: { userId: 'user-id', authToken: 'auth-token', me: { username: 'user' } } }
    }))
  })

  it('resumes the realtime side with the token from the rest login', async () => {
    const { client, driver } = await clientWithDriver({ client: restClient() })

    await client.login({ username: 'user', password: 'pass' } as any)

    expect(driver.login).toHaveBeenCalledWith({ token: 'auth-token' }, {})
  })

  it('resumes with the token it is given', async () => {
    const { client, driver } = await clientWithDriver()

    await expect(client.resume({ token: 'a-token' })).resolves.toBe('realtime-login')
    expect(driver.login).toHaveBeenCalledWith({ token: 'a-token' }, {})
  })
})
