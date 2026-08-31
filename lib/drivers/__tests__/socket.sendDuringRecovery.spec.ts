import { Socket } from '../socket'
import { createSocket } from '../../../test/createSocket'
import {
  CLOSED,
  FakeWebSocket,
  connectionWork,
  driveToHandshake,
  fakeSockets,
  hasScheduledReopen,
  openFakeConnection,
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

const socketOptions = { reopen: REOPEN_DELAY, timeout: TIMEOUT, ping: PING_INTERVAL }

const methodCall = { msg: 'method', method: 'logout', params: [] }

/**
 * A send issued after an unexpected transport loss, while the Socket is waiting
 * out a Scheduled Reopen. The lost Transport is released, so there is nothing
 * attached to write on and the send is refused rather than left waiting.
 */
describe('a send issued during the delayed recovery window', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket(socketOptions)
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

  it('drops a subscribe silently: the write is refused and nothing is recorded', async () => {
    const subscribing = socket.subscribe('stream-room-messages', ['__my_messages__'])

    await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
    await driveToHandshake(fakeSockets[1])

    await expect(subscribing).resolves.toBeUndefined()
    expect(socket.subscriptions).toEqual({})
  })
})

describe('pinging after a transport is lost', () => {
  let socket: Socket

  beforeEach(async () => {
    socket = createSocket(socketOptions)
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
    const socket = createSocket(socketOptions)

    await expect(socket.send(methodCall)).rejects.toThrow(NO_OPEN_CONNECTION)
    expect(fakeSockets).toHaveLength(0)
  })
})
