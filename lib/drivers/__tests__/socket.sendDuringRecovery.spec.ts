import { Socket } from '../socket'
import { createSocket } from '../../../test/createSocket'
import {
  FakeWebSocket,
  connectionWork,
  driveToHandshake,
  fakeSockets,
  openFakeConnection,
  resubscribeAllAndReceiveReady,
  subFrames,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const REOPEN_DELAY = 3000

const TIMEOUT = 9000

const PING_INTERVAL = 4000

const ABNORMAL_CLOSE = 1006
const NO_OPEN_CONNECTION = '[ddp] sending without open connection'

const socketOptions = { reopen: REOPEN_DELAY, timeout: TIMEOUT, ping: PING_INTERVAL }

const methodCall = { msg: 'method', method: 'logout', params: [] }

describe('a send issued after an unexpected close, while the scheduled reopen is pending', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket(socketOptions)
    transport = await openFakeConnection(socket)
    transport.close(ABNORMAL_CLOSE)
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
    await resubscribeAllAndReceiveReady(socket, replacement, subscription!.id)

    expect(subFrames(replacement.sent)).toEqual([{
      msg: 'sub',
      id: subscription!.id,
      name: 'stream-room-messages',
      params: ['__my_messages__']
    }])
  })
})

describe('a send issued with no transport attached at all', () => {
  it('is refused before any wait', async () => {
    const socket = createSocket(socketOptions)

    await expect(socket.send(methodCall)).rejects.toThrow(NO_OPEN_CONNECTION)
    expect(fakeSockets).toHaveLength(0)
  })
})
