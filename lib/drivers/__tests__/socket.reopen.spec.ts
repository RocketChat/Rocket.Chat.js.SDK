import { Socket } from '../socket'
import { createSocket } from '../../../test/createSocket'
import {
  CLOSED,
  connectionWork,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
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

const PING_INTERVAL_OUTSIDE_TEST_WINDOW = 10 * 60 * 1000

const socketOptions = { reopen: REOPEN_DELAY, timeout: TIMEOUT, ping: PING_INTERVAL_OUTSIDE_TEST_WINDOW }

describe('Socket connection lifecycle', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket(socketOptions)
    transport = await openFakeConnection(socket)
  })

  /**
   * Accepted gap: the fake's `readyState` is driven by hand, so "is connected" is
   * asserted against a value the test itself wrote. A real socket reporting OPEN
   * over a dead pipe is unreachable through this seam. The replacement test below
   * therefore proves the identity comparison in `onClose`, not that a real
   * replaced socket behaves the way that guard assumes.
   */
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
})
