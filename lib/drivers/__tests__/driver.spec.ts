import { Driver } from '../driver'
import { logger as defaultLogger } from '../../log'
import { createConnectedDriver, createDriver } from '../../../test/createDriver'
import {
  CLOSED,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

let driver: Driver
let transport: FakeWebSocket

const newDriver = () => { driver = createDriver() }

const connectDriver = async () => {
  ({ driver, transport } = await createConnectedDriver())
}

describe('new Driver', () => {
  it('strips the protocol from the host it was given', () => {
    const driver = createDriver({ host: 'https://open.rocket.chat' })

    expect(driver.config.host).toBe('open.rocket.chat')
    expect(driver['socket'].host).toBe('ws://open.rocket.chat/websocket')
  })

  it('leaves a host that carries no protocol alone', () => {
    expect(createDriver().config.host).toBe('localhost:3000')
  })

  it('sets both the config timeout and the socket ping to the caller\'s timeout', () => {
    const driver = createDriver({ timeout: 250 })

    expect(driver.config.timeout).toBe(250)
    expect(driver['socket'].config.ping).toBe(250)
  })

  it('defaults the host and the logger when constructed with no options', () => {
    const driver = new Driver()

    expect(driver.config.host).toBe('localhost:3000')
    expect(driver.logger).toBe(defaultLogger)
  })

  it('defaults the timeout to 10000 when the caller gives none', () => {
    expect(createDriver().config.timeout).toBe(10000)
  })
})

describe('Driver.subscribe', () => {
  beforeEach(connectDriver)

  it('sends the event name and a wrapper object as the two sub params, burying the caller\'s extra arguments under `args`', async () => {
    const subscribing = driver.subscribe('stream-notify-room', 'room-id/typing', false)

    const { id } = transport.lastSent() as { id: string }
    expect(transport.lastSent()).toEqual({
      msg: 'sub',
      id,
      name: 'stream-notify-room',
      params: ['room-id/typing', { useCollection: false, args: [false] }]
    })

    transport.receive({ msg: 'ready', subs: [id] })

    await expect(subscribing).resolves.toMatchObject({
      id,
      name: 'stream-notify-room',
      params: ['room-id/typing', { useCollection: false, args: [false] }]
    })
    expect(Object.keys(driver['socket'].subscriptions)).toEqual([id])
  })
})

describe('Driver.connect', () => {
  beforeEach(newDriver)

  it('keeps echoing open after a send has waited on it', async () => {
    // The driver holds a long-lived `open` listener that echoes the socket's
    // open as its own `connected`. A send that waits on open registers a `once`
    // beside it, and removing that `once` once it has fired must not take the
    // echo down with it, which would leave the driver permanently silent about
    // every later Reopen.
    const connecting = driver.connect()

    await driveToHandshake(fakeSockets[0])
    await connecting

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    fakeSockets[0].readyState = CLOSED
    const reopening = driver['socket'].open()
    const reopened = fakeSockets[1]
    const sending = driver['socket'].send({ msg: 'method', method: 'getUsersOfRoom', params: [] })

    await driveToHandshake(reopened)
    await reopening
    await jest.advanceTimersByTimeAsync(0)
    reopened.receive({ msg: 'result', id: 'ddp-2', result: 'ok' })
    await expect(sending).resolves.toMatchObject({ result: 'ok' })

    // The open the send rode in on is one echo; the next open has to produce
    // another, which is what the dropped listener made impossible.
    expect(connectedSeen).toHaveBeenCalledTimes(1)

    reopened.readyState = CLOSED
    const reopeningAgain = driver['socket'].open()
    await driveToHandshake(fakeSockets[2])
    await reopeningAgain

    expect(connectedSeen).toHaveBeenCalledTimes(2)
  })

  it('echoes open once however many times connect was called', async () => {
    const connecting = driver.connect()
    transport = fakeSockets[0]

    await driveToHandshake(transport)
    await connecting

    transport.close()

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    // A caller that calls `connect` on each foreground or network change
    // reaches it again with the socket down, so the early return does not cover
    // it. One open still means one `connected`.
    const connectingAgain = driver.connect()
    await driveToHandshake(fakeSockets[1])
    await connectingAgain

    expect(connectedSeen).toHaveBeenCalledTimes(1)
  })

  it('returns without opening a second connection when already connected', async () => {
    await openFakeConnection(driver['socket'])

    await expect(driver.connect()).resolves.toBe(driver)
    expect(fakeSockets).toHaveLength(1)
  })

  it('joins a second connect to the attempt already running', async () => {
    const joining = driver.connect()
    const joined = driver.connect()

    // One attempt, so one transport: the second caller builds nothing of its own.
    expect(fakeSockets).toHaveLength(1)

    await driveToHandshake(fakeSockets[0])

    await expect(joining).resolves.toBe(driver)
    await expect(joined).resolves.toBe(driver)
  })

  const failConnects = async (attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const socketsBeforeAttempt = fakeSockets.length
      const failing = driver.connect()
      fakeSockets[socketsBeforeAttempt].onerror?.(new Error('no route to host'))
      // A transport error event carries no reason the caller could act on, so
      // the attempt reports its own failure.
      await expect(failing).rejects
        .toThrow('[ddp] transport failed during the connection attempt')
    }
  }

  it('echoes no connected while connects fail', async () => {
    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    await failConnects(3)

    expect(connectedSeen).not.toHaveBeenCalled()
  })

  it('echoes connected once after earlier connects failed', async () => {
    const failedAttempts = 3

    await failConnects(failedAttempts)

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    const socketsBeforeConnect = fakeSockets.length
    const connecting = driver.connect()
    await driveToHandshake(fakeSockets[socketsBeforeConnect])
    await connecting

    expect(connectedSeen).toHaveBeenCalledTimes(1)
  })
})

describe('Driver.disconnect', () => {
  beforeEach(connectDriver)

  it('echoes no connected for the close it took', async () => {
    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    await driver.disconnect()

    expect(connectedSeen).not.toHaveBeenCalled()
  })

  it('leaves the driver free to connect again once it has settled', async () => {
    await driver.disconnect()

    const connecting = driver.connect()
    await driveToHandshake(fakeSockets[1])

    await expect(connecting).resolves.toBe(driver)
    expect(driver.connected).toBe(true)
  })
})

describe('Driver.logout', () => {
  beforeEach(newDriver)

  it('forwards a logout the socket must answer, however the socket reads', async () => {
    // The socket owns the whole decision, so a close that already made the
    // socket read as disconnected cannot turn a refusal into a silent success.
    const connecting = driver.connect()
    await driveToHandshake(fakeSockets[0])
    await connecting

    await driver.disconnect()
    expect(driver.connected).toBe(false)

    await expect(driver.logout())
      .rejects.toThrow('[ddp] connection closed before the response arrived')
  })
})
