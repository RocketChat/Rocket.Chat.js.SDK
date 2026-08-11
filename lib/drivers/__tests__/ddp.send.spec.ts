import { Socket } from '../ddp'
import * as settings from '../../settings'
import { silentLogger } from '../../../test/silentLogger'
import {
  CLOSED,
  FakeWebSocket,
  fakeSockets,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. This is the whole seam:
// the driver constructs the fake through its normal code path.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createSocket = () => new Socket({ host: 'localhost:3000', logger: silentLogger })

describe('the transport seam', () => {
  it('constructs the transport with the driver arguments and the shared headers', async () => {
    // Replaced rather than assigned, for the same reason test/setup.ts does it:
    // jest owns the restore, so this cannot leak into the next test.
    jest.replaceProperty(settings, 'customHeaders', { 'X-Auth-Token': 'token' })
    await openFakeConnection(createSocket())

    expect(fakeSockets).toHaveLength(1)
    expect(fakeSockets[0].url).toBe('ws://localhost:3000/websocket')
    expect(fakeSockets[0].protocols).toBeNull()
    expect(fakeSockets[0].options).toEqual({ headers: { 'X-Auth-Token': 'token' } })
  })

  it('starts the next test with the shared headers already reset', async () => {
    // Nothing in this file resets them: test/setup.ts registers the reset with
    // jest, and `restoreMocks` in jest.config.js applies it.
    await openFakeConnection(createSocket())

    expect(fakeSockets[0].options).toEqual({ headers: {} })
  })

  it('fires the close handler with the code it was closed with', async () => {
    const socket = createSocket()
    const transport = await openFakeConnection(socket)
    const closed = jest.fn()
    socket.on('close', closed)

    // 4000 is the driver's own user-disconnect code; it is the branch that does
    // *not* schedule a reopen, so closing with it leaves no timer behind here.
    transport.close(4000)

    expect(transport.closedWith).toEqual([4000])
    expect(closed).toHaveBeenCalledWith({ code: 4000 })
    expect(socket.connected).toBe(false)
  })
})

describe('Socket.send', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
  })

  describe('request ids', () => {
    it('numbers ids from the count of frames already sent', async () => {
      // The handshake was frame 0, so the first send from a test is `ddp-1`.
      const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })

      expect(transport.lastSent()).toEqual({
        msg: 'method',
        method: 'getUsersOfRoom',
        params: [],
        id: 'ddp-1'
      })

      transport.receive({ msg: 'result', id: 'ddp-1', result: 'ok' })
      await sending
    })

    it('keeps an id the caller supplied', async () => {
      const sending = socket.send({ msg: 'sub', id: 'given-id', name: 'stream', params: [] })

      expect(transport.lastSent().id).toBe('given-id')

      transport.receive({ msg: 'ready', subs: ['given-id'] })
      await sending
    })

    it('sends the handshake, ping and pong without an id', async () => {
      // The three DDP messages the protocol matches by `msg` alone. The
      // handshake already proved `connect`; ping and pong are sent here.
      expect(JSON.parse(transport.sent[0])).toEqual({
        msg: 'connect',
        version: '1',
        support: ['1', 'pre2', 'pre1']
      })

      const pinging = socket.send({ msg: 'ping' })
      expect(transport.lastSent()).toEqual({ msg: 'ping' })
      transport.receive({ msg: 'pong' })
      await pinging

      await socket.send({ msg: 'pong' })
      expect(transport.lastSent()).toEqual({ msg: 'pong' })
    })

    it('strips the id from any msg merely containing connect, ping or pong', async () => {
      // The guard is a substring regex, not an equality check, so a longer name
      // is treated as one of the three. No DDP message today has such a name —
      // pinned so that adding one is a visible decision rather than a surprise.
      await socket.send({ msg: 'preconnect' })

      expect(transport.lastSent()).toEqual({ msg: 'preconnect' })
    })

    it('still counts the id-less frames', async () => {
      await socket.send({ msg: 'pong' })

      const sending = socket.send({ msg: 'method', method: 'ping', params: [] })
      expect(transport.lastSent().id).toBe('ddp-2')

      transport.receive({ msg: 'result', id: 'ddp-2' })
      await sending
    })
  })

  describe('reply matching', () => {
    it('matches an ordinary request on its own id, and echoes the id back', async () => {
      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      // Deliberately noisy: a reply carrying a different id must not resolve it.
      transport.receive({ msg: 'result', id: 'ddp-99', result: 'wrong' })
      transport.receive({ msg: 'result', id: 'ddp-1', result: 'right' })

      await expect(sending).resolves.toEqual({ id: 'ddp-1', result: 'right', error: undefined })
    })

    it('matches a ping on pong rather than on an id', async () => {
      const pinging = socket.send({ msg: 'ping' })

      transport.receive({ msg: 'pong' })

      // No `id` in the resolved value: the id-less requests get no id back.
      await expect(pinging).resolves.toEqual({ msg: 'pong' })
    })

    it('matches the handshake on connected rather than on an id', async () => {
      // Proven by the shared setup, which only completes because `onOpen`'s
      // `connect` send resolved on the `connected` message.
      expect(socket.session).toBe('fake-session')
    })

    it('resolves undefined for a request with neither a reply event nor an id', async () => {
      // `pong` is stripped of its id and is not itself awaited on `pong`, so
      // there is no listener to register: it resolves as soon as it is written.
      await expect(socket.send({ msg: 'pong' })).resolves.toBeUndefined()
    })
  })

  describe('failed replies', () => {
    it('rejects with an Error carrying the reason, and keeps its fields', async () => {
      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      const error = { error: 403, reason: 'User not found', errorType: 'Meteor.Error' }
      transport.receive({ msg: 'result', id: 'ddp-1', error })

      // Callers up the stack log `err.message`; the reason has to survive there.
      await expect(sending).rejects.toBeInstanceOf(Error)
      await expect(sending).rejects.toThrow('User not found')
      // The DDP error's own fields stay readable, so a caller branching on
      // `err.error` or `err.errorType` still works.
      await expect(sending).rejects.toMatchObject(error)
    })

    it('keeps the reason when the DDP error carries a message of its own', async () => {
      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      // Some server paths send both; `reason` is the one callers want to read.
      transport.receive({
        msg: 'result',
        id: 'ddp-1',
        error: { error: 403, reason: 'User not found', message: '[403] User not found' }
      })

      await expect(sending).rejects.toThrow('User not found')
    })

    it('falls back to the DDP error itself when it carries no reason', async () => {
      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      transport.receive({ msg: 'result', id: 'ddp-1', error: 'you must be logged in' })

      await expect(sending).rejects.toThrow('you must be logged in')
    })
  })

  describe('sending while the connection is not open', () => {
    it('waits forever for the connection to open, with no timeout', async () => {
      // The wait on the `open` event is unbounded, so a send issued
      // while the socket is down never settles.
      transport.readyState = CLOSED

      let settled = false
      socket.send({ msg: 'method', method: 'login', params: [] })
        .then(() => { settled = true }, () => { settled = true })

      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)

      expect(settled).toBe(false)
    })
  })
})
