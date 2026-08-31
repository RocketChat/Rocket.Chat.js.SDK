import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  FakeWebSocket,
  connectionWork,
  driveToHandshake,
  fakeSockets,
  flushMicrotasks,
  hasScheduledReopen,
  openFakeConnection,
  subFrames,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

/** The delay a Scheduled Reopen waits out, read from the `reopen` option. */
const REOPEN_DELAY = 3000

const TIMEOUT = 9000

const PING_INTERVAL = 4000

const ABNORMAL_CLOSE = 1006
const NO_OPEN_CONNECTION = '[ddp] sending without open connection'

const createSocket = () => new Socket({
  host: 'localhost:3000',
  logger: createSilentLogger(),
  reopen: REOPEN_DELAY,
  timeout: TIMEOUT,
  ping: PING_INTERVAL
})

const methodCall = { msg: 'method', method: 'logout', params: [] }

describe('a send issued during the delayed recovery window', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
    transport.close(ABNORMAL_CLOSE)
  })

  it('detaches the lost transport, leaving the socket with nothing to write on', () => {
    expect(socket.connection).toBeUndefined()
    expect(transport.readyState).toBe(CLOSED)
    expect(socket.connected).toBe(false)
    expect(hasScheduledReopen(socket)).toBe(true)
  })

  it('refuses the send at once instead of waiting out the recovery', async () => {
    await expect(socket.send(methodCall)).rejects.toThrow(NO_OPEN_CONNECTION)
    expect(connectionWork(socket)).toBe('scheduled')
  })

  it('leaves the replacement carrying no frame from the refused send', async () => {
    await expect(socket.send(methodCall)).rejects.toThrow(NO_OPEN_CONNECTION)

    await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
    const replacement = fakeSockets[1]
    await driveToHandshake(replacement)

    expect(socket.connected).toBe(true)
    expect(replacement.sent.some((frame) => frame.includes('"method":"logout"'))).toBe(false)
  })

  it('records a subscribe instead, and re-sends it on the replacement transport', async () => {
    const subscription = await socket.subscribe('stream-room-messages', ['__my_messages__'])

    expect(subscription).toMatchObject({ name: 'stream-room-messages' })
    expect(socket.subscriptions[subscription!.id]).toBe(subscription)

    await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
    const replacement = fakeSockets[1]
    await driveToHandshake(replacement)
    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    replacement.receive({ msg: 'ready', subs: [subscription!.id] })
    await resubscribing

    expect(subFrames(replacement.sent)).toEqual([{
      msg: 'sub',
      id: subscription!.id,
      name: 'stream-room-messages',
      params: ['__my_messages__']
    }])
  })
})

describe('pinging after a transport is lost', () => {
  let socket: Socket

  beforeEach(async () => {
    socket = createSocket()
    const transport = await openFakeConnection(socket)
    transport.close(ABNORMAL_CLOSE)
  })

  it('recovers on the scheduled reopen alone and pings again on the replacement', async () => {
    await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
    const replacement = fakeSockets[1]
    await driveToHandshake(replacement)

    await jest.advanceTimersByTimeAsync(PING_INTERVAL)

    expect(replacement.sent.some((frame) => frame.includes('"msg":"ping"'))).toBe(true)
    expect(fakeSockets).toHaveLength(2)
  })
})

describe('a send issued with no transport attached at all', () => {
  it('is refused before any wait', async () => {
    const socket = createSocket()

    await expect(socket.send(methodCall)).rejects.toThrow(NO_OPEN_CONNECTION)
    expect(fakeSockets).toHaveLength(0)
  })
})
