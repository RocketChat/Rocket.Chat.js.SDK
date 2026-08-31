import { Socket } from '../socket'
import { ILogger } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  CONNECTING,
  connectionWork,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  fakeTransportModule,
  hasScheduledReopen,
  wiredTransports,
  OPEN,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

/** The code the driver closes with when *it* asked for the close. */
const INTENTIONAL_CLOSE = 4000

/**
 * The delay a Scheduled Reopen waits out, read from the `reopen` option.
 * Deliberately *not* the 10000 default, and deliberately not the deadline below:
 * with either, a boundary assertion would pass whether or not the driver read
 * the option, and the two timers would be indistinguishable on the clock.
 */
const REOPEN_DELAY = 3000

/**
 * The `timeout` option: the Deadline of one Connection Attempt, and the bound a
 * send waits on its DDP response. Deliberately neither the 10000 default nor
 * `REOPEN_DELAY`, so the assertions distinguish all three.
 */
const TIMEOUT = 7000

/** Mirrors the bound `close` waits on the transport's close event. */
const CLOSE_DEADLINE = 2000

const PING_INTERVAL_OUTSIDE_TEST_WINDOW = 10 * 60 * 1000

const SUPERSEDED = '[ddp] connection attempt was superseded before it completed'
const ATTEMPT_DEADLINE = '[ddp] connection attempt did not complete before the deadline'
const TRANSPORT_FAILED = '[ddp] transport failed during the connection attempt'
const CLOSED_BEFORE_OPEN = '[ddp] connection closed before it opened'

const createSocket = (logger: ILogger) => new Socket({
  host: 'localhost:3000',
  logger,
  reopen: REOPEN_DELAY,
  timeout: TIMEOUT,
  ping: PING_INTERVAL_OUTSIDE_TEST_WINDOW
})

/**
 * Connecting and reconnecting. Unless a test needs a connection that never
 * opened, it starts from a real open one built through `openFakeConnection`,
 * which asserts the mocked transport constructor actually ran — so no assertion
 * below can pass against a socket the driver never built.
 *
 * Accepted gap: the fake's `readyState` is driven by hand, so "is connected" is
 * asserted against a value the test itself wrote. A real socket reporting OPEN
 * over a dead pipe — the grey zone `probe` exists for — is unreachable through
 * this seam. The replacement test below therefore proves the identity
 * comparison in `onClose`, not that a real replaced socket behaves the way that
 * guard assumes.
 */
describe('Socket connection lifecycle', () => {
  let socket: Socket
  let transport: FakeWebSocket
  let logger: ILogger

  beforeEach(async () => {
    logger = createSilentLogger()
    socket = createSocket(logger)
    transport = await openFakeConnection(socket)
  })

  describe('a close from a replaced socket', () => {
    it('emits nothing and reopens nothing', async () => {
      // The handler has to be captured *before* the replacement, because the
      // teardown nulls it — and calling the captured handler is the only way to
      // reach `onClose` with a socket the driver has already swapped out. The
      // handler is the real one the driver installed, closed over the old fake.
      const closeTheReplacedSocket = transport.onclose!
      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      const reopening = socket.reopenNow()
      const replacement = fakeSockets[1]
      expect(replacement).toBeDefined()
      expect(replacement).not.toBe(transport)

      closeTheReplacedSocket({ code: 1006 })

      // No 'close' emitted, no reopen scheduled, and — the harm the guard exists
      // to prevent — the live connection is still the replacement.
      expect(closeSeen).not.toHaveBeenCalled()
      expect(hasScheduledReopen(socket)).toBe(false)
      expect(socket.connection).toBe(replacement)

      await driveToHandshake(replacement)
      await reopening
    })
  })

  describe('a close from the live socket', () => {
    // A normal close and an abnormal one — the two shapes either side of the
    // single `code !== 4000` branch. More codes would add inputs, not coverage.
    it.each([1000, 1006])('schedules a reopen for code %i', (code) => {
      transport.close(code)

      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it(`schedules no reopen for the intentional code ${INTENTIONAL_CLOSE}`, () => {
      transport.close(INTENTIONAL_CLOSE)

      expect(hasScheduledReopen(socket)).toBe(false)
    })

    it('announces one close however many times the transport reports it', () => {
      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      const closeAgain = transport.onclose!
      transport.close(1006)
      closeAgain({ code: 1006 })

      expect(closeSeen).toHaveBeenCalledTimes(1)
    })

    it('detaches the lost transport, so no late frame can reach the socket', async () => {
      await jest.advanceTimersByTimeAsync(1000)
      const pingBeforeClose = socket.lastPing

      transport.close(1006)
      await jest.advanceTimersByTimeAsync(1000)

      expect(socket.connection).toBeUndefined()
      expect([transport.onopen, transport.onmessage, transport.onerror, transport.onclose])
        .toEqual([null, null, null, null])

      transport.receive({ msg: 'updated' })

      expect(socket.lastPing).toBe(pingBeforeClose)
    })

    it('attaches the replacement the scheduled reopen builds', async () => {
      transport.close(1006)
      expect(socket.connection).toBeUndefined()

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)

      expect(socket.connection).toBe(fakeSockets[1])
      expect(transport.closedWith).toEqual([1006])
      expect(wiredTransports()).toEqual([fakeSockets[1]])
    })

    it('reopens once the scheduled delay has elapsed', async () => {
      transport.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(fakeSockets).toHaveLength(1)

      await jest.advanceTimersByTimeAsync(1)
      expect(fakeSockets).toHaveLength(2)
      expect(connectionWork(socket)).toBe('attempting')
    })

    it('shares the one Scheduled Reopen with every later recovery request', async () => {
      transport.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      socket.reopen()
      socket.reopen()

      await jest.advanceTimersByTimeAsync(1)
      expect(fakeSockets).toHaveLength(2)
    })
  })

  describe('opening over a previous connection', () => {
    it('nulls all four handlers and closes the predecessor with the intentional code', async () => {
      const reopening = socket.reopenNow()

      expect(transport.onopen).toBeNull()
      expect(transport.onmessage).toBeNull()
      expect(transport.onerror).toBeNull()
      expect(transport.onclose).toBeNull()
      expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])

      await driveToHandshake(fakeSockets[1])
      await reopening
    })

    it('replaces the predecessor even when tearing it down throws', async () => {
      transport.closeError = new Error('teardown boom')

      const debug = logger.debug as jest.Mock

      const reopening = socket.reopenNow()

      expect(debug).toHaveBeenCalledWith(
        '[ddp] the transport refused to close: teardown boom'
      )
      expect(fakeSockets).toHaveLength(2)
      expect(socket.connection).toBe(fakeSockets[1])

      await driveToHandshake(fakeSockets[1])
      await reopening
    })

    it('rejects the superseded attempt rather than leaving it pending', async () => {
      const stillConnecting = createSocket(logger)
      const superseded = stillConnecting.open()
      const socketsBeforeReplacement = fakeSockets.length

      const forced = stillConnecting.reopenNow()
      const replacement = fakeSockets[socketsBeforeReplacement]

      await expect(superseded).rejects.toThrow(SUPERSEDED)
      expect(hasScheduledReopen(stillConnecting)).toBe(false)

      await driveToHandshake(replacement)
      await forced
    })

    it('schedules no Reopen for the superseded attempt', async () => {
      const stillConnecting = createSocket(logger)
      const superseded = stillConnecting.open()
      const socketsBeforeReplacement = fakeSockets.length

      const forced = stillConnecting.reopenNow()

      await expect(superseded).rejects.toThrow(SUPERSEDED)
      await driveToHandshake(fakeSockets[socketsBeforeReplacement])
      await forced

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(socketsBeforeReplacement + 1)
    })
  })

  describe('sharing one connection attempt', () => {
    it('builds one transport for concurrent ordinary opens, and fulfills both', async () => {
      transport.readyState = CLOSED

      const first = socket.open()
      const second = socket.open()

      expect(fakeSockets).toHaveLength(2)

      await driveToHandshake(fakeSockets[1])

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(connectionWork(socket)).toBe('idle')
    })

    it('retains a usable transport without attempting anything', async () => {
      await expect(socket.open()).resolves.toBeUndefined()

      expect(fakeSockets).toHaveLength(1)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('joins an ordinary attempt to the forced one that replaced it', async () => {
      transport.readyState = CLOSED

      const superseded = socket.open().catch((err) => err)
      const forced = socket.reopenNow()
      const joining = socket.open()

      expect(fakeSockets).toHaveLength(3)
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      await driveToHandshake(fakeSockets[2])
      await expect(forced).resolves.toBeUndefined()
      await expect(joining).resolves.toBeUndefined()
    })

    it('consumes the scheduled reopen rather than leaving it to fire behind an attempt', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      const opening = socket.open()
      expect(connectionWork(socket)).toBe('attempting')

      await driveToHandshake(fakeSockets[1])
      await opening

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)
    })

    it('builds a replacement for a lost transport even if it reports itself open again', async () => {
      transport.close(1006)
      transport.readyState = OPEN

      const opening = socket.open()

      expect(fakeSockets).toHaveLength(2)
      await driveToHandshake(fakeSockets[1])
      await expect(opening).resolves.toBeUndefined()
    })

    it('builds nothing for a recovery request during an ordinary attempt, and reopens once it fails', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      socket.reopen()

      expect(connectionWork(socket)).toBe('attempting')

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)

      fakeSockets[1].onerror?.(new Error('no route to host'))
      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)

      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it('schedules no reopen when the ordinary attempt a recovery request joined succeeds', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      socket.reopen()

      await driveToHandshake(fakeSockets[1])
      await opening

      expect(hasScheduledReopen(socket)).toBe(false)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)
    })

    it('builds nothing for a recovery request during a forced attempt, and leaves its deadline alone', async () => {
      const reopening = socket.reopenNow().catch((err) => err)
      socket.reopen()

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)

      await jest.advanceTimersByTimeAsync(TIMEOUT - REOPEN_DELAY - 1)
      expect(connectionWork(socket)).toBe('attempting')

      await jest.advanceTimersByTimeAsync(1)

      await expect(reopening).resolves.toThrow(ATTEMPT_DEADLINE)
      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it('hands both callers of one attempt the same failure', async () => {
      transport.readyState = CLOSED

      const first = socket.open().catch((err) => err)
      const second = socket.open().catch((err) => err)

      fakeSockets[1].onerror?.(new Error('no route to host'))

      await expect(first).resolves.toThrow(TRANSPORT_FAILED)
      await expect(second).resolves.toThrow(TRANSPORT_FAILED)
    })
  })

  describe('a scheduled reopen', () => {
    it('waits out one delay when asked to recover with no usable transport', async () => {
      transport.readyState = CLOSED

      socket.reopen()
      expect(hasScheduledReopen(socket)).toBe(true)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(fakeSockets).toHaveLength(1)

      await jest.advanceTimersByTimeAsync(1)
      expect(fakeSockets).toHaveLength(2)
    })

    it('builds nothing when the delay it waited out finds the transport usable', async () => {
      socket.reopen()
      expect(hasScheduledReopen(socket)).toBe(true)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)

      expect(fakeSockets).toHaveLength(1)
      expect(socket.connection).toBe(transport)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('follows each failed recovery attempt with exactly one more', async () => {
      transport.close(1006)

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
        expect(fakeSockets).toHaveLength(attempt + 1)

        fakeSockets[attempt].onerror?.(new Error('no route to host'))
        expect(hasScheduledReopen(socket)).toBe(true)
      }
    })
  })

  describe('the transport the socket observes', () => {
    it('is only the newest one across a forced replacement', async () => {
      const reopening = socket.reopenNow()

      expect(wiredTransports()).toEqual([fakeSockets[1]])
      expect(socket.connection).toBe(fakeSockets[1])

      await driveToHandshake(fakeSockets[1])
      await reopening

      expect(wiredTransports()).toEqual([fakeSockets[1]])
      expect(socket.connection).toBe(fakeSockets[1])
    })

    it('is only the newest one across an ordinary attempt superseded by a forced one', async () => {
      transport.readyState = CLOSED

      const superseded = socket.open().catch((err) => err)
      const forced = socket.reopenNow()
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      expect(wiredTransports()).toEqual([fakeSockets[2]])
      expect(socket.connection).toBe(fakeSockets[2])

      await driveToHandshake(fakeSockets[2])
      await forced
    })

    it('is none of them once a close has let the last one go', async () => {
      await socket.close()

      expect(wiredTransports()).toEqual([])
      expect(socket.connection).toBeUndefined()
    })
  })

  describe('lifecycle events', () => {
    it('announces one connecting for an attempt, and none for the caller that joined it', async () => {
      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)
      transport.readyState = CLOSED

      const first = socket.open()
      const joining = socket.open()

      expect(connectingSeen).toHaveBeenCalledTimes(1)

      await driveToHandshake(fakeSockets[1])
      await first
      await joining

      expect(connectingSeen).toHaveBeenCalledTimes(1)
    })

    it('announces no connecting for a transport it retained', async () => {
      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)

      await expect(socket.open()).resolves.toBeUndefined()

      expect(connectingSeen).not.toHaveBeenCalled()
    })

    it('announces no connecting for a scheduled reopen until it owns a transport', async () => {
      transport.close(1006)

      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(hasScheduledReopen(socket)).toBe(true)
      expect(connectingSeen).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(1)
      expect(connectingSeen).toHaveBeenCalledTimes(1)
    })

    it('has committed the work, the transport and the session before it announces the open', async () => {
      transport.readyState = CLOSED
      const observed: unknown[][] = []
      socket.on('open', () =>
        observed.push([connectionWork(socket), socket.connection, socket.session]))

      const opening = socket.open()
      await driveToHandshake(fakeSockets[1], 'reopened-session')
      await opening

      expect(observed).toEqual([['idle', fakeSockets[1], 'reopened-session']])
    })

    it('announces exactly one open for an attempt that succeeded', async () => {
      transport.readyState = CLOSED
      const announced = jest.fn()
      socket.on('open', announced)

      const opening = socket.open()
      await driveToHandshake(fakeSockets[1])
      await opening

      expect(announced).toHaveBeenCalledTimes(1)
    })

    it('has already scheduled the reopen by the time it announces the close', () => {
      const workAtClose: string[] = []
      socket.on('close', () => workAtClose.push(connectionWork(socket)))

      transport.close(1006)

      expect(workAtClose).toEqual(['scheduled'])
    })

    it('is idle by the time it announces a close it will not recover from', () => {
      const workAtClose: string[] = []
      socket.on('close', () => workAtClose.push(connectionWork(socket)))

      transport.close(INTENTIONAL_CLOSE)

      expect(workAtClose).toEqual(['idle'])
    })

    it('announces no close for a socket that never owned a transport', async () => {
      const untouched = createSocket(logger)
      const closeSeen = jest.fn()
      untouched.on('close', closeSeen)

      await untouched.close()

      expect(closeSeen).not.toHaveBeenCalled()
    })

    it('announces no disconnected when the transport is lost', () => {
      const retiredEventSeen = jest.fn()
      socket.on('disconnected', retiredEventSeen)

      transport.close(1006)

      expect(retiredEventSeen).not.toHaveBeenCalled()
    })
  })

  describe('reopenNow', () => {
    it('constructs one transport for concurrent callers and fulfills both', async () => {
      const retiredEventSeen = jest.fn()
      socket.on('disconnected', retiredEventSeen)

      const first = socket.reopenNow()
      const second = socket.reopenNow()

      expect(fakeSockets).toHaveLength(2)
      expect(retiredEventSeen).not.toHaveBeenCalled()

      await driveToHandshake(fakeSockets[1])

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(connectionWork(socket)).toBe('idle')
    })

    it('rejects its callers on the attempt deadline instead of resolving them', async () => {
      const reopening = socket.reopenNow()
      const settled = jest.fn()
      reopening.then(settled, settled)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      expect(settled).not.toHaveBeenCalled()

      const rejected = expect(reopening).rejects.toThrow(ATTEMPT_DEADLINE)
      await jest.advanceTimersByTimeAsync(1)
      await rejected
    })

    it('does not reset the deadline of the forced attempt a later caller joins', async () => {
      const first = socket.reopenNow().catch((err) => err)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      const joining = socket.reopenNow().catch((err) => err)

      await jest.advanceTimersByTimeAsync(1)

      await expect(first).resolves.toThrow(ATTEMPT_DEADLINE)
      await expect(joining).resolves.toThrow(ATTEMPT_DEADLINE)
      expect(fakeSockets).toHaveLength(2)
    })

    it('schedules one reopen once the deadline has rejected its callers', async () => {
      const reopening = socket.reopenNow()

      await jest.advanceTimersByTimeAsync(TIMEOUT)
      await expect(reopening).rejects.toThrow(ATTEMPT_DEADLINE)

      expect(hasScheduledReopen(socket)).toBe(true)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(3)
      expect(connectionWork(socket)).toBe('attempting')
    })

    it('gives the forced replacement a whole deadline, not what the ordinary attempt left', async () => {
      transport.readyState = CLOSED
      const ordinary = socket.open().catch((err) => err)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      const forced = socket.reopenNow().catch((err) => err)
      await expect(ordinary).resolves.toThrow(SUPERSEDED)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      expect(connectionWork(socket)).toBe('attempting')

      await jest.advanceTimersByTimeAsync(1)
      await expect(forced).resolves.toThrow(ATTEMPT_DEADLINE)
    })

    it('starts one forced attempt when there is no usable transport to replace', async () => {
      transport.readyState = CLOSED

      const reopening = socket.reopenNow()

      expect(fakeSockets).toHaveLength(2)
      expect(connectionWork(socket)).toBe('attempting')
      expect(wiredTransports()).toEqual([fakeSockets[1]])

      await driveToHandshake(fakeSockets[1])
      await expect(reopening).resolves.toBeUndefined()
    })

    it('cancels the scheduled reopen it replaces', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      const reopening = socket.reopenNow()
      expect(connectionWork(socket)).toBe('attempting')

      await driveToHandshake(fakeSockets[1])
      await reopening

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)
    })
  })

  describe('a transport that fails during the attempt', () => {
    it('rejects the attempt when the transport reports an error', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      fakeSockets[1].onerror?.(new Error('no route to host'))

      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('rejects the attempt when the transport closes before the handshake completes', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      const connecting = fakeSockets[1]
      connecting.readyState = OPEN
      connecting.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      connecting.close(1006)

      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
    })

    it('rejects the attempt when the transport closes while it is still being wired', async () => {
      // The close lands from the `connecting` emission, before `open()` has been
      // handed the transport. The attempt has to own it by then, or nothing but
      // the Deadline can end the caller's wait.
      transport.readyState = CLOSED
      socket.once('connecting', () => fakeSockets[1].close(1006))

      const opening = socket.open()

      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('closes the transport of the attempt it abandoned', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      const abandoned = fakeSockets[1]
      abandoned.onerror?.(new Error('no route to host'))
      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)

      expect(abandoned.closedWith).toEqual([INTENTIONAL_CLOSE])
      expect(abandoned.readyState).toBe(CLOSED)
    })

    it('rejects the attempt with the reason the server refused the handshake with', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      const connecting = fakeSockets[1]
      connecting.readyState = OPEN
      connecting.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      connecting.receive({ msg: 'connected', error: { reason: 'unsupported DDP version' } })

      await expect(opening).rejects.toThrow('unsupported DDP version')
    })

    it('closes the transport of the attempt it superseded', async () => {
      transport.readyState = CLOSED
      const superseded = socket.open().catch((err) => err)
      const abandoned = fakeSockets[1]

      const forced = socket.reopenNow()
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      expect(abandoned.closedWith).toEqual([INTENTIONAL_CLOSE])
      expect(abandoned.readyState).toBe(CLOSED)

      await driveToHandshake(fakeSockets[2])
      await expect(forced).resolves.toBeUndefined()
    })

    it('does not let a superseded transport fail the attempt that replaced it', async () => {
      transport.readyState = CLOSED

      const superseded = socket.open().catch((err) => err)
      const abandoned = fakeSockets[1]
      const failAbandoned = abandoned.onerror!
      const closeAbandoned = abandoned.onclose!

      const forced = socket.reopenNow()
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      failAbandoned(new Error('no route to host'))
      closeAbandoned({ code: 1006 })

      expect(closeSeen).not.toHaveBeenCalled()
      expect(connectionWork(socket)).toBe('attempting')

      await driveToHandshake(fakeSockets[2])
      await expect(forced).resolves.toBeUndefined()
    })

    it('schedules one reopen for a recovery attempt that failed, and none for a plain open', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      fakeSockets[1].onerror?.(new Error('no route to host'))
      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
      expect(hasScheduledReopen(socket)).toBe(false)

      const recovering = socket.reopenNow()
      fakeSockets[2].onerror?.(new Error('no route to host'))
      await expect(recovering).rejects.toThrow(TRANSPORT_FAILED)
      expect(hasScheduledReopen(socket)).toBe(true)
    })
  })

  describe('an open abandoned by a close mid-handshake', () => {
    const handshakeInFlight = async () => {
      const replacement = fakeSockets[1]
      replacement.readyState = OPEN
      replacement.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)
    }

    it('schedules no further reopen behind the one that was abandoned', async () => {
      transport.close(1006)
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      await handshakeInFlight()

      await socket.close()
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY * 2)

      expect(hasScheduledReopen(socket)).toBe(false)
      expect(fakeSockets).toHaveLength(2)
    })
  })

  describe('a handshake the server never answers', () => {
    it('rejects the attempt on one deadline that spans the transport connection', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      expect(fakeSockets).toHaveLength(2)
      const replacement = fakeSockets[1]

      // Half the budget goes on the transport connection, so the handshake gets
      // only what is left of it rather than a fresh `timeout`.
      await jest.advanceTimersByTimeAsync(TIMEOUT / 2)
      replacement.readyState = OPEN
      replacement.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      expect(replacement.lastSent()).toMatchObject({ msg: 'connect' })

      const settled = jest.fn()
      opening.then(settled, settled)

      await jest.advanceTimersByTimeAsync(TIMEOUT / 2 - 1)
      expect(settled).not.toHaveBeenCalled()

      const rejected = expect(opening).rejects.toThrow(ATTEMPT_DEADLINE)
      await jest.advanceTimersByTimeAsync(1)
      await rejected
    })

    it('rejects an attempt whose transport never opens at all', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      expect(fakeSockets[1].readyState).toBe(CONNECTING)

      const rejected = expect(opening).rejects.toThrow(ATTEMPT_DEADLINE)
      await jest.advanceTimersByTimeAsync(TIMEOUT)
      await rejected
    })
  })

  describe('a transport constructor that throws', () => {
    it('rejects the open, logs the error, and builds nothing', async () => {
      // Replacing the mocked module's export is the only seam that reaches the
      // driver's `catch` around `new WebSocket(...)`: the driver reads the
      // export at call time, and `restoreMocks` puts it back afterwards.
      const failure = new Error('transport unavailable')
      jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => { throw failure })

      const error = logger.error as jest.Mock

      // The existing socket has to stop being connected first, or `open` short
      // circuits before it ever constructs anything.
      transport.readyState = CLOSED

      await expect(socket.open()).rejects.toThrow('transport unavailable')

      expect(error).toHaveBeenCalledWith(failure)
      expect(fakeSockets).toHaveLength(1)
    })

    it('reports its own failure when the constructor throws something that is not an Error', async () => {
      jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => {
        throw 'transport unavailable'
      })
      transport.readyState = CLOSED

      await expect(socket.open()).rejects.toThrow(TRANSPORT_FAILED)
    })

    it('emits no connecting for a transport it never constructed', async () => {
      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)
      jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => {
        throw new Error('transport unavailable')
      })
      transport.readyState = CLOSED

      await expect(socket.open()).rejects.toThrow('transport unavailable')

      expect(connectingSeen).not.toHaveBeenCalled()
    })
  })

  describe('close', () => {
    it('resolves on the close event itself, without waiting out the deadline', async () => {
      const settled = jest.fn()

      socket.close().then(settled)
      await jest.advanceTimersByTimeAsync(0)

      expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      expect(settled).toHaveBeenCalled()
      expect(socket.connection).toBeUndefined()
      expect([transport.onopen, transport.onmessage, transport.onerror, transport.onclose])
        .toEqual([null, null, null, null])
    })

    it('settles without waiting when the transport refuses to close', async () => {
      transport.closeError = new Error('already gone')
      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      const settled = jest.fn()
      socket.close().then(settled)
      await jest.advanceTimersByTimeAsync(0)

      expect(settled).toHaveBeenCalled()
      expect(closeSeen).toHaveBeenCalledWith({
        code: INTENTIONAL_CLOSE,
        reason: 'the transport refused to close',
        wasClean: false
      })
      expect(socket.connection).toBeUndefined()
    })

    it('leaves no subscription behind for a sub it abandoned', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])

      await socket.close()
      await subscribing

      expect(socket.connection).toBeUndefined()
      expect(socket.subscriptions).toEqual({})
    })

    it('leaves the socket idle with no session, liveness or recovery intent', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      await socket.close()

      expect(connectionWork(socket)).toBe('idle')
      expect(socket.connection).toBeUndefined()
      expect(socket.session).toBeUndefined()
      expect(socket.lastPing).toBe(0)
      expect(socket.connected).toBe(false)
    })

    it('joins a concurrent close to the same void outcome, asking the transport once', async () => {
      transport.answersClose = false

      const first = socket.close()
      const second = socket.close()

      await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
    })

    it('rejects a logout issued after it settled, rather than resolving silently', async () => {
      await socket.close()

      await expect(socket.logout())
        .rejects.toThrow('[ddp] connection closed before the response arrived')
    })

    it('leaves a logout on a socket that never connected a no-op', async () => {
      await expect(createSocket(logger).logout()).resolves.toBeUndefined()
    })

    it('admits connection work again once it has settled', async () => {
      await socket.close()

      const reopened = await openFakeConnection(socket)

      expect(socket.connection).toBe(reopened)
      expect(socket.connected).toBe(true)
    })

    describe('while it owns the socket', () => {
      beforeEach(() => {
        transport.answersClose = false
      })

      it('refuses a new open', async () => {
        const closing = socket.close()

        await expect(socket.open()).rejects.toThrow(CLOSED_BEFORE_OPEN)
        expect(fakeSockets).toHaveLength(1)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('refuses a new forced reopen', async () => {
        const closing = socket.close()

        await expect(socket.reopenNow()).rejects.toThrow(CLOSED_BEFORE_OPEN)
        expect(fakeSockets).toHaveLength(1)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('records no recovery intent for an internal reopen', async () => {
        const closing = socket.close()

        socket.reopen()
        expect(hasScheduledReopen(socket)).toBe(false)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
        expect(fakeSockets).toHaveLength(1)
      })

      it('refuses a new DDP send', async () => {
        const closing = socket.close()

        await expect(socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] }))
          .rejects.toThrow('[ddp] connection closed before the response arrived')

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('rejects a logout before it clears the login or writes anything', async () => {
        const login = { id: 'user-id', token: 'resume-token', createCipher: { $date: 0 } }
        socket.resume = login
        const closing = socket.close()
        const sentBefore = transport.sent.length

        await expect(socket.logout()).rejects.toThrow('[ddp] connection closed before the response arrived')
        expect(socket.resume).toEqual(login)
        expect(transport.sent).toHaveLength(sentBefore)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('writes no probe of its own', async () => {
        const closing = socket.close()
        const sentBefore = transport.sent.length

        await expect(socket.probe()).resolves.toBe(false)
        expect(transport.sent).toHaveLength(sentBefore)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('settles and announces one close when the transport reports the close it never answered', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)
        const settled = jest.fn()

        const closing = socket.close()
        closing.then(settled, settled)
        await jest.advanceTimersByTimeAsync(0)

        transport.onclose?.({ code: 1006 })
        await closing

        expect(settled).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledWith({ code: 1006 })
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
        expect([transport.onopen, transport.onmessage, transport.onerror, transport.onclose])
          .toEqual([null, null, null, null])
      })

      it('announces one close for a transport that reports its close twice', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)
        const settled = jest.fn()

        const closing = socket.close()
        closing.then(settled, settled)
        await jest.advanceTimersByTimeAsync(0)

        const reportClose = transport.onclose!
        reportClose({ code: 1006 })
        reportClose({ code: 1006 })
        await closing

        expect(settled).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledTimes(1)
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      })

      it('refuses a send that was still waiting for the transport to open', async () => {
        transport.readyState = CLOSED
        const sentBefore = transport.sent.length
        const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
        await jest.advanceTimersByTimeAsync(0)

        const closing = socket.close()

        await expect(sending).rejects.toThrow('[ddp] connection closed before the response arrived')
        expect(transport.sent).toHaveLength(sentBefore)

        await closing
      })
    })

    describe('when the peer never answers', () => {
      beforeEach(() => {
        transport.answersClose = false
      })

      it('settles on its deadline instead of waiting for a close that never arrives', async () => {
        const settled = jest.fn()

        socket.close().then(settled)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE - 1)
        expect(settled).not.toHaveBeenCalled()

        await jest.advanceTimersByTimeAsync(1)
        expect(settled).toHaveBeenCalled()
      })

      it('drops the socket, so a second close waits for nothing', async () => {
        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
        expect(socket.connection).toBeUndefined()

        const settled = jest.fn()
        socket.close().then(settled)
        await jest.advanceTimersByTimeAsync(0)

        expect(settled).toHaveBeenCalled()
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      })

      it('detaches the socket, so a peer that revives reaches nothing', async () => {
        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        expect(transport.onopen).toBeNull()
        expect(transport.onmessage).toBeNull()
        expect(transport.onerror).toBeNull()
        expect(transport.onclose).toBeNull()
      })

      it('announces the close it never got, so a wait on this connection ends', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        expect(closeSeen).toHaveBeenCalledWith({
          code: INTENTIONAL_CLOSE,
          reason: 'the transport did not answer the close',
          wasClean: false
        })
      })

      it('ignores a late transport close that lands after the deadline answered for it', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close()
        // The sync advance fires the deadline — the driver answers itself —
        // without draining the microtask continuation that detaches the
        // socket. That is the window a transport's trailing close event lands
        // in; the async advance would close it before the event could arrive.
        jest.advanceTimersByTime(CLOSE_DEADLINE)
        transport.onclose?.({ code: 1006 })

        expect(closeSeen).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledWith({
          code: INTENTIONAL_CLOSE,
          reason: 'the transport did not answer the close',
          wasClean: false
        })
        expect(hasScheduledReopen(socket)).toBe(false)

        await closing
        expect(socket.connection).toBeUndefined()
      })

      it('is not kept alive by a revived peer it has already detached', async () => {
        const messageSeen = jest.fn()
        socket.on('updated', messageSeen)

        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        transport.receive({ msg: 'updated' })

        expect(messageSeen).not.toHaveBeenCalled()
        expect(socket.lastPing).toBe(0)
      })
    })
  })

  /**
   * A close shares the driver with the reopen machinery, and each of these pins
   * one way that interplay goes wrong: a reopen the close should have cancelled
   * surviving it, and an attempt left hanging by the teardown.
   */
  describe('close racing a reopen', () => {
    it('deletes the pending reopen it cancels, so a later close can schedule one again', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      await socket.close()
      expect(hasScheduledReopen(socket)).toBe(false)

      const reopened = await openFakeConnection(socket)
      reopened.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it('does not let a reopen armed during the wait survive it', async () => {
      transport.answersClose = false
      const closing = socket.close()
      await jest.advanceTimersByTimeAsync(0)

      transport.onclose?.({ code: 1006 })
      await closing

      expect(hasScheduledReopen(socket)).toBe(false)
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(1)
    })

    it('rejects a forced attempt that never got its open, so its awaiter is not left hanging', async () => {
      const reopening = socket.reopenNow()
      const replacement = fakeSockets[1]
      expect(replacement.readyState).toBe(CONNECTING)

      const rejected = expect(reopening).rejects.toThrow(CLOSED_BEFORE_OPEN)
      await socket.close()
      await rejected

      expect(socket.connected).toBe(false)
      expect(socket.connection).toBeUndefined()
    })

    it('rejects a pending open rather than hanging it when the connecting socket is closed', async () => {
      transport.readyState = CLOSED
      const opening = socket.open()
      const connecting = fakeSockets[1]
      expect(connecting.readyState).toBe(CONNECTING)

      await socket.close()

      await expect(opening).rejects.toThrow(CLOSED_BEFORE_OPEN)
      expect(socket.connection).toBeUndefined()
    })

    it('leaves the next open free to build a socket when it interrupted a forced reconnect', async () => {
      const reopening = socket.reopenNow()
      const rejected = expect(reopening).rejects.toThrow(CLOSED_BEFORE_OPEN)
      await socket.close()
      await rejected

      const rebuilt = await openFakeConnection(socket)
      expect(socket.connection).toBe(rebuilt)
    })
  })

  describe('the retry interval', () => {
    /**
     * The `reopen` option is the only way to set the retry interval, so this
     * asserts a socket reconnected through `open` still retries on it.
     */
    it('comes from the reopen option after a reconnect', async () => {
      transport.readyState = CLOSED
      const opening = socket.open()

      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)
      await opening

      reopened.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(fakeSockets).toHaveLength(2)

      await jest.advanceTimersByTimeAsync(1)
      expect(fakeSockets).toHaveLength(3)
    })
  })
})
