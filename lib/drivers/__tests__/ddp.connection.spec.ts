import { Socket } from '../ddp'
import { ILogger } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  CONNECTING,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  fakeTransportModule,
  OPEN,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

/** The code the driver closes with when *it* asked for the close. */
const INTENTIONAL_CLOSE = 4000

/**
 * The delay `reopen` schedules its retry on, read from the `reopen` option.
 * Deliberately *not* the 10000 default, and deliberately not the deadline below:
 * with either, a boundary assertion would pass whether or not the driver read
 * the option, and the two timers would be indistinguishable on the clock.
 */
const REOPEN_DELAY = 3000

/**
 * How long `reopenNow` waits for the new socket's `open` before resolving
 * anyway, read from the `timeout` option. Deliberately neither the 10000 default
 * nor `REOPEN_DELAY`, so the assertion below distinguishes all three.
 */
const REOPEN_NOW_DEADLINE = 7000

/**
 * The bound the tests below hand `close` for its wait on the transport's close
 * event. Distinct from every other delay in this file, so an assertion on it
 * passes only if the argument was read.
 */
const OVERRIDDEN_CLOSE_DEADLINE = 5000

/**
 * The ping interval is pushed far beyond every advance in this file on purpose:
 * a ping firing mid-test would move `lastPing` and send frames that none of the
 * assertions below are about. Nothing here is arithmetic about pinging — see
 * `ddp.liveness.spec.ts` for that.
 */
const createSocket = (logger: ILogger) => new Socket({
  host: 'localhost:3000',
  logger,
  reopen: REOPEN_DELAY,
  timeout: REOPEN_NOW_DEADLINE,
  ping: 10 * 60 * 1000
})

/**
 * Connecting and reconnecting. Every test starts from a real open connection
 * built through `openFakeConnection`, which asserts the mocked transport
 * constructor actually ran — so no assertion below can pass against a socket
 * the driver never built.
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
      expect(socket.openTimeout).toBeUndefined()
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

      expect(socket.openTimeout).toBeDefined()
    })

    it(`schedules no reopen for the intentional code ${INTENTIONAL_CLOSE}`, () => {
      transport.close(INTENTIONAL_CLOSE)

      expect(socket.openTimeout).toBeUndefined()
    })

    it('reopens once the scheduled delay has elapsed', async () => {
      transport.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(fakeSockets).toHaveLength(1)

      await jest.advanceTimersByTimeAsync(1)
      expect(fakeSockets).toHaveLength(2)
      expect(socket.openTimeout).toBeUndefined()
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
        '[ddp] open: previous connection teardown failed: teardown boom'
      )
      expect(fakeSockets).toHaveLength(2)
      expect(socket.connection).toBe(fakeSockets[1])

      await driveToHandshake(fakeSockets[1])
      await reopening
    })
  })

  describe('reopenNow', () => {
    it('constructs one transport and shares one promise across concurrent callers', async () => {
      const disconnectSeen = jest.fn()
      socket.on('disconnected', disconnectSeen)

      const first = socket.reopenNow()
      const second = socket.reopenNow()

      expect(second).toBe(first)
      expect(fakeSockets).toHaveLength(2)
      expect(socket.lastPing).toBe(0)
      expect(disconnectSeen).toHaveBeenCalledTimes(1)

      await driveToHandshake(fakeSockets[1])

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(socket.reopenPromise).toBeUndefined()
    })

    it('resolves on the configured timeout when no open ever arrives', async () => {
      const reopening = socket.reopenNow()

      await jest.advanceTimersByTimeAsync(REOPEN_NOW_DEADLINE - 1)
      expect(socket.reopenPromise).toBe(reopening)

      await jest.advanceTimersByTimeAsync(1)

      await expect(reopening).resolves.toBeUndefined()
      expect(socket.reopenPromise).toBeUndefined()
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

      expect(socket.openTimeout).toBeUndefined()
      expect(fakeSockets).toHaveLength(2)
    })

    it('logs rather than leaving checkAndReopen an unhandled rejection', async () => {
      // `checkAndReopen` opens without awaiting, so the rejection has nowhere to
      // go but the global handler of the consuming app.
      const error = logger.error as jest.Mock
      transport.readyState = CLOSED

      socket.checkAndReopen()
      await handshakeInFlight()
      await socket.close()
      await jest.advanceTimersByTimeAsync(0)

      expect(error).toHaveBeenCalledWith(
        '[ddp] Reopen error: [ddp] connection closed before the response arrived'
      )
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

      await expect(socket.open()).rejects.toBe(failure)

      expect(error).toHaveBeenCalledWith(failure)
      expect(fakeSockets).toHaveLength(1)
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
    })

    it('settles without waiting when the transport refuses to close', async () => {
      transport.closeError = new Error('already gone')
      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      const settled = jest.fn()
      socket.close(OVERRIDDEN_CLOSE_DEADLINE).then(settled)
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

    describe('when the peer never answers', () => {
      beforeEach(() => {
        transport.answersClose = false
      })

      it('settles on the deadline it was given instead of waiting for a close that never arrives', async () => {
        const settled = jest.fn()

        socket.close(OVERRIDDEN_CLOSE_DEADLINE).then(settled)

        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE - 1)
        expect(settled).not.toHaveBeenCalled()

        await jest.advanceTimersByTimeAsync(1)
        expect(settled).toHaveBeenCalled()
      })

      it('drops the socket, so a second close waits for nothing', async () => {
        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)
        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE)
        await closing
        expect(socket.connection).toBeUndefined()

        const settled = jest.fn()
        socket.close(OVERRIDDEN_CLOSE_DEADLINE).then(settled)
        await jest.advanceTimersByTimeAsync(0)

        expect(settled).toHaveBeenCalled()
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      })

      it('detaches the socket, so a peer that revives reaches nothing', async () => {
        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)
        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE)
        await closing

        expect(transport.onopen).toBeNull()
        expect(transport.onmessage).toBeNull()
        expect(transport.onerror).toBeNull()
        expect(transport.onclose).toBeNull()
      })

      it('announces the close it never got, so a wait on this connection ends', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)
        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE)
        await closing

        expect(closeSeen).toHaveBeenCalledWith({
          code: INTENTIONAL_CLOSE,
          reason: 'the transport did not answer the close',
          wasClean: false
        })
      })

      it('leaves a connection installed during the wait wired and held', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)

        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE - 1)
        const reopening = socket.reopenNow()
        const replacement = fakeSockets[1]
        await driveToHandshake(replacement)
        await reopening

        await jest.advanceTimersByTimeAsync(1)
        await closing

        expect(socket.connection).toBe(replacement)
        expect(replacement.onclose).not.toBeNull()
        expect(replacement.onmessage).not.toBeNull()
        expect(closeSeen).not.toHaveBeenCalled()
      })

      it('announces no close for a connection it did not close, so sends on the replacement survive', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)

        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE - 1)
        const reopening = socket.reopenNow()
        const replacement = fakeSockets[1]
        await driveToHandshake(replacement)
        await reopening

        const calling = socket.call('getRoomByTypeAndName')
        const { id } = replacement.lastSent()

        await jest.advanceTimersByTimeAsync(1)
        await closing

        replacement.receive({ msg: 'result', id, result: 'answered' })

        await expect(calling).resolves.toBe('answered')
        expect(closeSeen).not.toHaveBeenCalled()
      })

      it('leaves the subscriptions of a connection installed during the wait alone', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)

        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE - 1)
        const reopening = socket.reopenNow()
        const replacement = fakeSockets[1]
        await driveToHandshake(replacement)
        await reopening

        const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
        const { id } = replacement.lastSent()
        replacement.receive({ msg: 'ready', subs: [id] })
        await subscribing

        await jest.advanceTimersByTimeAsync(1)
        await closing

        expect(Object.keys(socket.subscriptions)).toEqual([id])
        expect(closeSeen).not.toHaveBeenCalled()
      })

      it('is not kept alive by a revived peer it has already detached', async () => {
        const stampAtClose = socket.lastPing
        const messageSeen = jest.fn()
        socket.on('updated', messageSeen)

        const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)
        await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE)
        await closing

        transport.receive({ msg: 'updated' })

        expect(messageSeen).not.toHaveBeenCalled()
        expect(socket.lastPing).toBe(stampAtClose)
      })
    })
  })

  /**
   * A close shares the driver with the reopen machinery, and each of these pins
   * one way that interplay goes wrong: a reopen the close should have cancelled
   * surviving it, a close ending on the wrong socket's event, and an open left
   * hanging by the teardown.
   */
  describe('close racing a reopen', () => {
    it('deletes the pending reopen it cancels, so a later close can schedule one again', async () => {
      transport.close(1006)
      expect(socket.openTimeout).toBeDefined()

      await socket.close()
      expect(socket.openTimeout).toBeUndefined()

      // A reopen still arms on the next connection: the field being left set
      // would read as "already scheduled" to every reopen from here on.
      const reopened = await openFakeConnection(socket)
      reopened.close(1006)
      expect(socket.openTimeout).toBeDefined()
    })

    it('does not let a reopen armed during the wait survive it', async () => {
      // The close arrives by hand below with a code that is not 4000, which
      // arms a reopen.
      transport.answersClose = false
      const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)
      await jest.advanceTimersByTimeAsync(0)

      transport.onclose?.({ code: 1006 })
      await closing

      expect(socket.openTimeout).toBeUndefined()
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(1)
    })

    it('is not ended by a different socket closing', async () => {
      transport.answersClose = false
      const settled = jest.fn()
      const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE).then(settled)
      await jest.advanceTimersByTimeAsync(0)

      const reopening = socket.reopenNow()
      const replacement = fakeSockets[1]
      await driveToHandshake(replacement)
      await reopening

      // The replacement's own close is none of this wait's business: only the
      // socket close() asked to close can end it.
      replacement.close(INTENTIONAL_CLOSE)
      await jest.advanceTimersByTimeAsync(0)
      expect(settled).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE)
      await closing
      expect(settled).toHaveBeenCalled()
    })

    it('rejects a pending open rather than hanging it when the connecting socket is closed', async () => {
      transport.readyState = CLOSED
      const opening = socket.open()
      const connecting = fakeSockets[1]
      expect(connecting.readyState).toBe(CONNECTING)

      await socket.close()

      await expect(opening).rejects.toThrow('[ddp] connection closed before it opened')
      expect(socket.connection).toBeUndefined()
    })

    it('leaves the next open free to build a socket when it interrupted a forced reconnect', async () => {
      const reopening = socket.reopenNow()
      const closing = socket.close()
      await jest.advanceTimersByTimeAsync(0)
      await closing

      const opening = socket.open()
      await jest.advanceTimersByTimeAsync(REOPEN_NOW_DEADLINE)
      await reopening

      const rebuilt = fakeSockets[2]
      expect(rebuilt).toBeDefined()
      await driveToHandshake(rebuilt)
      await expect(opening).resolves.toBe(rebuilt)
    })

    it('writes nothing of its own to a replacement installed during the wait', async () => {
      const id = 'sub-1'
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'], undefined, id)
      transport.receive({ msg: 'ready', subs: [id] })
      await subscribing

      transport.answersClose = false
      const closing = socket.close(OVERRIDDEN_CLOSE_DEADLINE)
      await jest.advanceTimersByTimeAsync(0)

      const reopening = socket.reopenNow()
      const replacement = fakeSockets[1]
      await driveToHandshake(replacement)
      await reopening

      const before = [...replacement.sent]

      await jest.advanceTimersByTimeAsync(OVERRIDDEN_CLOSE_DEADLINE)
      await closing

      expect(replacement.sent).toEqual(before)
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

      expect(socket.config.reopen).toBe(REOPEN_DELAY)

      reopened.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(fakeSockets).toHaveLength(2)

      await jest.advanceTimersByTimeAsync(1)
      expect(fakeSockets).toHaveLength(3)
    })
  })
})
