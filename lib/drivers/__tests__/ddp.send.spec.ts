import { Socket } from '../socket'
import { DDPError } from '../ddpError'
import * as settings from '../../settings'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { createSocket, PING_INTERVAL_OUTSIDE_TEST_WINDOW, REOPEN_DELAY } from '../../../test/createSocket'
import {
  CLOSED,
  FakeWebSocket,
  OPEN,
  driveToHandshake,
  fakeSockets,
  hasScheduledReopen,
  INTENTIONAL_CLOSE,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

describe('the transport seam', () => {
  it('constructs the transport with the driver arguments and the shared headers', async () => {
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

    transport.close(INTENTIONAL_CLOSE)

    expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
    expect(closed).toHaveBeenCalledWith({ code: INTENTIONAL_CLOSE })
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
      await socket.send({ msg: 'preconnect' })

      expect(transport.lastSent()).toEqual({ msg: 'preconnect' })
    })

    it('gives a message with no msg an id and matches its reply by that id', async () => {
      const sending = socket.send({ method: 'getUsersOfRoom', params: [] })

      expect(transport.lastSent()).toEqual({
        method: 'getUsersOfRoom',
        params: [],
        id: 'ddp-1'
      })

      transport.receive({ msg: 'result', id: 'ddp-1', result: 'ok' })
      await expect(sending).resolves.toMatchObject({ id: 'ddp-1', result: 'ok' })
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

  it('logs the sent message to the logger it was handed', async () => {
    const logger = createSilentLogger()
    socket.logger = logger

    await socket.send({ msg: 'pong' })

    expect(logger.debug).toHaveBeenCalledWith('[ddp] sending message: {"msg":"pong"}')
  })

  describe('reply matching', () => {
    it('matches an ordinary request on its own id, ignores a reply carrying another id, and echoes the id back', async () => {
      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      transport.receive({ msg: 'result', id: 'ddp-99', result: 'wrong' })
      transport.receive({ msg: 'result', id: 'ddp-1', result: 'right' })

      await expect(sending).resolves.toEqual({ id: 'ddp-1', result: 'right', error: undefined })
    })

    it('matches a ping on pong rather than on an id, and resolves it without an id', async () => {
      const pinging = socket.send({ msg: 'ping' })

      transport.receive({ msg: 'pong' })

      await expect(pinging).resolves.toEqual({ msg: 'pong' })
    })

    it('takes the session from the connected handshake', async () => {
      expect(socket.session).toBe('fake-session')
    })

    it('resolves undefined for a request with neither a reply event nor an id', async () => {
      await expect(socket.send({ msg: 'pong' })).resolves.toBeUndefined()
    })
  })

  describe('failed replies', () => {
    it('rejects with an Error carrying the reason, and keeps its fields', async () => {
      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      const error = { error: 403, reason: 'User not found', errorType: 'Meteor.Error' }
      transport.receive({ msg: 'result', id: 'ddp-1', error })

      await expect(sending).rejects.toBeInstanceOf(Error)
      await expect(sending).rejects.toThrow('User not found')
      await expect(sending).rejects.toMatchObject(error)
    })
  })

  describe('sending while the connection is not open', () => {
    it('rejects on the deadline without writing the message, rather than waiting on open forever', async () => {
      transport.readyState = CLOSED

      const rejected = expect(socket.send({ msg: 'method', method: 'login', params: [] }))
        .rejects.toThrow('[ddp] timed out waiting for the connection to open')

      await jest.advanceTimersByTimeAsync(10 * 60 * 1000)

      await rejected
      expect(transport.sent).toHaveLength(1)
    })

    it('sends once the connection opens inside the deadline', async () => {
      transport.readyState = CLOSED
      const opening = socket.open()
      const attempting = fakeSockets[1]

      const sending = socket.send({ msg: 'method', method: 'login', params: [] })

      await driveToHandshake(attempting)
      await opening
      await jest.advanceTimersByTimeAsync(0)

      expect(attempting.sent.map(frame => JSON.parse(frame)))
        .toContainEqual({ msg: 'method', method: 'login', params: [], id: 'ddp-2' })
      attempting.receive({ msg: 'result', id: 'ddp-2', result: 'ok' })
      await expect(sending).resolves.toMatchObject({ result: 'ok' })
    })

    it('sends on the open socket it already has when the last ping has gone stale', async () => {
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
      await expect(createSocket().send({ msg: 'method', method: 'login', params: [] }))
        .rejects.toThrow('[ddp] sending without open connection')
    })
  })
})

describe('Socket.send with several listeners on one event', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket({ reopen: REOPEN_DELAY, ping: PING_INTERVAL_OUTSIDE_TEST_WINDOW })
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

    const rejections = sends.flatMap(sending => [
      expect(sending).rejects.toBeInstanceOf(Error),
      expect(sending).rejects.not.toBeInstanceOf(DDPError),
      expect(sending).rejects.toThrow('[ddp] connection reopened before the response arrived')
    ])

    socket.reopenNow()

    await Promise.all(rejections)
  })

  it('rejects the send when the transport throws on the write', async () => {
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
    const NO_CONNECTION_MESSAGE = '[ddp] sending without open connection'
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

    it('refuses a send issued before the connection came back rather than writing it on the new one', async () => {
      transport.close(1006)

      const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
      const refused = expect(sending).rejects.toThrow(NO_CONNECTION_MESSAGE)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)
      await jest.advanceTimersByTimeAsync(0)

      await refused
      expect(reopened.sent.map((frame: string) => JSON.parse(frame).msg)).not.toContain('method')
    })

    it('fails the open when the transport drops mid-handshake', async () => {
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

  it('rejects a send waiting on open when a forced reopen replaced the connection, and writes nothing on the replacement', async () => {
    transport.readyState = CLOSED
    const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
    await jest.advanceTimersByTimeAsync(0)

    const rejected = expect(sending).rejects
      .toThrow('[ddp] connection replaced before the message was written')

    const reopening = socket.reopenNow()
    const replacement = fakeSockets[1]
    await driveToHandshake(replacement)
    await reopening
    await jest.advanceTimersByTimeAsync(0)

    await rejected
    expect(replacement.sent.map((frame: string) => JSON.parse(frame).msg)).not.toContain('method')
  })

  it('waits for open up to twice the reopen delay, and no longer', async () => {
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
  const EXPIRED_MESSAGE = '[ddp] no response arrived before the deadline'
  const PATIENT_TIMEOUT = 30000

  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket({ reopen: REOPEN_DELAY, ping: PING_INTERVAL_OUTSIDE_TEST_WINDOW })
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
    const patient = createSocket({ reopen: REOPEN_DELAY, ping: PING_INTERVAL_OUTSIDE_TEST_WINDOW, timeout: PATIENT_TIMEOUT })
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
