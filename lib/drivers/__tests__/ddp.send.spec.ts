import { Socket } from '../socket'
import { DDPError } from '../ddpError'
import * as settings from '../../settings'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  FakeWebSocket,
  OPEN,
  driveToHandshake,
  fakeSockets,
  hasScheduledReopen,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. This is the whole seam:
// the driver constructs the fake through its normal code path.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createSocket = () => new Socket({ host: 'localhost:3000', logger: createSilentLogger() })

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

    it('keeps the request counter writable', async () => {
      socket.sent = 40

      const sending = socket.send({ msg: 'method', method: 'ping', params: [] })
      expect(transport.lastSent().id).toBe('ddp-40')

      transport.receive({ msg: 'result', id: 'ddp-40' })
      await sending
      expect(socket.sent).toBe(41)
    })
  })

  it('uses a replacement logger for request messages', async () => {
    const logger = createSilentLogger()
    socket.logger = logger

    await socket.send({ msg: 'pong' })

    expect(logger.debug).toHaveBeenCalledWith('[ddp] sending message: {"msg":"pong"}')
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

    it('takes the session from the connected handshake', async () => {
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
  })

  describe('sending while the connection is not open', () => {
    it('rejects on the deadline rather than waiting on open forever', async () => {
      transport.readyState = CLOSED

      // Asserted before the clock moves: the rejection lands inside the advance,
      // and an unattached handler at that point is an unhandled rejection.
      const rejected = expect(socket.send({ msg: 'method', method: 'login', params: [] }))
        .rejects.toThrow('[ddp] timed out waiting for the connection to open')

      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)

      await rejected
      expect(transport.sent).toHaveLength(1) // the handshake only
    })

    it('sends once the connection opens inside the deadline', async () => {
      transport.readyState = CLOSED
      const opening = socket.open()
      const attempting = fakeSockets[1]

      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      // `open` is emitted at the end of the handshake, so the whole attempt has
      // to succeed before the waiting send can go out.
      await driveToHandshake(attempting)
      await opening
      await jest.advanceTimersByTimeAsync(0)

      // The handshake writes on the same tick, so the waiting send is not
      // necessarily the last frame, only written at all.
      expect(attempting.sent.map(frame => JSON.parse(frame)))
        .toContainEqual({ msg: 'method', method: 'login', params: [], id: 'ddp-2' })
      attempting.receive({ msg: 'result', id: 'ddp-2', result: 'ok' })
      await expect(sending).resolves.toMatchObject({ result: 'ok' })
    })

    it('sends on the open socket it already has when the last ping has gone stale', async () => {
      // An unanswered ping lapses `alive()` and schedules a reopen, while the
      // transport stays open. No attempt is running, so no `open` event is
      // coming for a send to wait on.
      await jest.advanceTimersByTimeAsync(socket.config.ping * 2 + 1)

      expect(hasScheduledReopen(socket)).toBe(true)
      expect(socket.connected).toBe(false)
      expect(socket.transportOpen).toBe(true)
      expect(fakeSockets).toHaveLength(1)

      const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })

      expect(transport.lastSent()).toEqual({
        msg: 'method', method: 'getUsersOfRoom', params: [], id: 'ddp-2'
      })

      transport.receive({ msg: 'result', id: 'ddp-2', result: 'ok' })
      await expect(sending).resolves.toMatchObject({ result: 'ok' })
      expect(fakeSockets).toHaveLength(1)
    })

    it('rejects the send when there is no connection at all', async () => {
      // The guard used to sit inside an async promise executor, which dropped
      // the throw as an unhandled rejection instead of failing the caller.
      await expect(createSocket().send({ msg: 'method', method: 'login', params: [] }))
        .rejects.toThrow('[ddp] sending without open connection')
    })
  })
})

/**
 * Every test below has more than one listener registered for the same event at
 * the same time — the shape `tiny-events` mishandled by mutating the listener
 * array by index. They are driver-level rather than emitter-level on purpose:
 * the emitter specs pin the mechanism, these pin that a send actually survives
 * it.
 *
 * The ping interval is pushed far beyond every advance here, so no ping frame
 * joins the ones being counted. The reopen delay is the arithmetic.
 */
describe('Socket.send with several listeners on one event', () => {
  const REOPEN_DELAY = 3000

  let socket: Socket
  let transport: FakeWebSocket

  const createSocket = () => new Socket({
    host: 'localhost:3000',
    logger: createSilentLogger(),
    reopen: REOPEN_DELAY,
    ping: 10 * 60 * 1000
  })

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
  })

  it('writes every send that was waiting on open, not just one', async () => {
    transport.readyState = CLOSED
    const opening = socket.open()
    const attempting = fakeSockets[1]

    const sends = [1, 2, 3].map(() =>
      socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    )

    await driveToHandshake(attempting)
    await opening
    await jest.advanceTimersByTimeAsync(0)

    const written = attempting.sent.map(frame => JSON.parse(frame))
    for (const id of ['ddp-2', 'ddp-3', 'ddp-4']) {
      expect(written).toContainEqual({ msg: 'method', method: 'getUsersOfRoom', params: [], id })
      attempting.receive({ msg: 'result', id, result: 'ok' })
    }

    await expect(Promise.all(sends)).resolves.toHaveLength(3)
  })

  it('rejects every in-flight send on one reopenNow', async () => {
    const sends = [1, 2, 3, 4].map(() =>
      socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    )

    // Both halves, as ADR-0001 established: an `Error`, and the message the
    // caller will actually read, since callers up the stack log `err.message`.
    const rejections = sends.flatMap(sending => [
      expect(sending).rejects.toBeInstanceOf(Error),
      expect(sending).rejects.not.toBeInstanceOf(DDPError),
      expect(sending).rejects.toThrow('[ddp] connection reopened before the response arrived')
    ])

    socket.reopenNow()

    await Promise.all(rejections)
  })

  it('rejects the send when the transport throws on the write', async () => {
    // A real websocket throws from `send` when the socket closed under it. The
    // failure used to be logged and swallowed, leaving the caller's promise
    // pending forever.
    const failure = new Error('transport write failed')
    transport.sendError = failure

    await expect(socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] }))
      .rejects.toThrow('transport write failed')
  })

  describe('when the connection the send went out on goes away', () => {
    const inFlight = () => [1, 2, 3].map(() =>
      socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    )

    const CLOSED_MESSAGE = '[ddp] connection closed before the response arrived'
    const REPLACED_MESSAGE = '[ddp] connection replaced before the message was written'
    const REOPENED_MESSAGE = '[ddp] connection reopened before the response arrived'

    const expectAllToReject = (sends: Promise<any>[], message: string) =>
      Promise.all(sends.flatMap(sending => [
        expect(sending).rejects.toBeInstanceOf(Error),
        expect(sending).rejects.toThrow(message)
      ]))

    it('rejects every in-flight send when the socket is closed', async () => {
      const sends = inFlight()
      const rejections = expectAllToReject(sends, CLOSED_MESSAGE)

      await socket.close()

      await rejections
    })

    it('rejects every in-flight send when the transport drops', async () => {
      const sends = inFlight()
      const rejections = expectAllToReject(sends, CLOSED_MESSAGE)

      transport.close(1006)

      await rejections
    })

    it('rejects every in-flight send when a scheduled reopen replaces the connection', async () => {
      // The transport is not open any more, but nothing fired `onclose`, so the
      // replacement announces itself only as `connecting`.
      const sends = inFlight()
      const rejections = expectAllToReject(sends, REOPENED_MESSAGE)

      transport.readyState = CLOSED
      socket.reopen()
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)

      expect(fakeSockets).toHaveLength(2)
      await rejections
    })

    const listenerCounts = () => {
      const counts: { [event: string]: number } = {}
      Object.entries((socket as any)._listeners).forEach(([event, listeners]) => {
        const { length } = listeners as any[]
        if (length) counts[event] = length
      })
      return counts
    }

    it('leaves no listener behind for a send it abandoned', async () => {
      const before = listenerCounts()

      const sends = inFlight()
      const rejections = expectAllToReject(sends, CLOSED_MESSAGE)
      await socket.close()
      await rejections

      expect(listenerCounts()).toEqual(before)
    })

    it('leaves no listener behind when a scheduled reopen abandons the send', async () => {
      const before = listenerCounts()

      const sends = inFlight()
      const rejections = expectAllToReject(sends, REOPENED_MESSAGE)

      transport.readyState = CLOSED
      socket.reopen()
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      await rejections

      expect(listenerCounts()).toEqual(before)
    })

    it('leaves no listener behind for a send that got its response', async () => {
      const before = listenerCounts()

      const sends = inFlight()
      sends.forEach((_, index) =>
        transport.receive({ msg: 'result', id: `ddp-${index + 1}`, result: 'ok' })
      )
      await Promise.all(sends)

      expect(listenerCounts()).toEqual(before)
    })

    it('rejects a send whose connection went away as its wait on open ended', async () => {
      transport.readyState = CLOSED

      const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
      const rejection = expect(sending).rejects.toThrow(CLOSED_MESSAGE)

      socket.emit('open')
      await jest.advanceTimersByTimeAsync(0)

      await rejection
    })

    it('carries a send released onto an open socket whose ping went stale', async () => {
      socket.lastPing = Date.now() - socket.config.ping * 3

      const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })

      socket.emit('open')
      await jest.advanceTimersByTimeAsync(0)

      transport.receive({ msg: 'result', id: 'ddp-1', result: 'ok' })

      await expect(sending).resolves.toMatchObject({ result: 'ok' })
    })

    it('keeps the first ending when a second one follows', async () => {
      const sends = inFlight()
      const rejections = expectAllToReject(sends, CLOSED_MESSAGE)

      transport.close(1006)
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)

      await rejections
    })

    it('abandons a send issued before the connection came back rather than writing it on the new one', async () => {
      // The DDP session belongs to the connection the send was issued on. The
      // new one has its own session and is not logged in yet.
      transport.close(1006)

      const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
      const abandoned = expect(sending).rejects.toThrow(REPLACED_MESSAGE)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)
      await jest.advanceTimersByTimeAsync(0)

      await abandoned
      expect(reopened.sent.map((frame: string) => JSON.parse(frame).msg)).not.toContain('method')
    })

    it('fails the open when the transport drops mid-handshake', async () => {
      // The handshake is the one send with no caller of its own: what `open()`
      // reports is the verdict on the attempt, not the abandoned wait.
      const opening = createSocket().open()
      const handshaking = fakeSockets[1]
      handshaking.readyState = OPEN
      handshaking.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      const rejected = expect(opening).rejects
        .toThrow('[ddp] transport failed during the connection attempt')
      handshaking.close(1006)

      await rejected
    })
  })

  it('waits for open up to twice the reopen delay, and no longer', async () => {
    // The deadline has to outlast the retry `reopen()` merely *schedules* at
    // `config.reopen`: at exactly `reopen` it expires as the reconnect begins,
    // so every send issued at a drop fails. Both boundaries are asserted, so
    // reverting the default to `config.reopen` fails here.
    transport.readyState = CLOSED

    const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    const settled = jest.fn()
    sending.then(settled, settled)

    await jest.advanceTimersByTimeAsync(REOPEN_DELAY * 2 - 1)
    expect(settled).not.toHaveBeenCalled()

    const rejected = expect(sending).rejects.toThrow('[ddp] timed out waiting for the connection to open')
    await jest.advanceTimersByTimeAsync(1)

    await rejected
  })
})

describe('a send on a connection that stays up and stays silent', () => {
  const REOPEN_DELAY = 3000
  const EXPIRED_MESSAGE = '[ddp] no response arrived before the deadline'
  const PATIENT_TIMEOUT = 30000

  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = new Socket({
      host: 'localhost:3000',
      logger: createSilentLogger(),
      reopen: REOPEN_DELAY,
      ping: 10 * 60 * 1000
    })
    transport = await openFakeConnection(socket)
  })

  it('ends the wait at the timeout, and no sooner', async () => {
    const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    const settled = jest.fn()
    sending.then(settled, settled)

    await jest.advanceTimersByTimeAsync(socket.config.timeout - 1)
    transport.receive({ msg: 'changed', collection: 'stream-room-messages' })
    expect(settled).not.toHaveBeenCalled()

    const rejected = Promise.all([
      expect(sending).rejects.toBeInstanceOf(Error),
      expect(sending).rejects.toThrow(EXPIRED_MESSAGE)
    ])
    await jest.advanceTimersByTimeAsync(1)

    expect(fakeSockets).toHaveLength(1)
    await rejected
  })

  it('takes its bound from the timeout option', async () => {
    const patient = new Socket({
      host: 'localhost:3000',
      logger: createSilentLogger(),
      reopen: REOPEN_DELAY,
      ping: 10 * 60 * 1000,
      timeout: PATIENT_TIMEOUT
    })
    await openFakeConnection(patient)

    const sending = patient.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    const settled = jest.fn()
    sending.then(settled, settled)

    await jest.advanceTimersByTimeAsync(PATIENT_TIMEOUT - 1)
    expect(settled).not.toHaveBeenCalled()

    const rejected = expect(sending).rejects.toThrow(EXPIRED_MESSAGE)
    await jest.advanceTimersByTimeAsync(1)

    await rejected
  })

  it('leaves no listener and no timer behind for a send it ended', async () => {
    const before = jest.getTimerCount()

    const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    const rejected = expect(sending).rejects.toThrow(EXPIRED_MESSAGE)
    await jest.advanceTimersByTimeAsync(socket.config.timeout)
    await rejected

    expect(jest.getTimerCount()).toBe(before)
  })

  it('arms no deadline for a send with no response to wait for', async () => {
    const before = jest.getTimerCount()

    await expect(socket.send({ msg: 'pong' })).resolves.toBeUndefined()

    expect(jest.getTimerCount()).toBe(before)
  })

  it('clears the deadline when the response arrives in time', async () => {
    const before = jest.getTimerCount()

    const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    transport.receive({ msg: 'result', id: 'ddp-1', result: 'ok' })

    await expect(sending).resolves.toMatchObject({ result: 'ok' })
    expect(jest.getTimerCount()).toBe(before)
  })
})
