import { Socket } from '../ddp'
import { silentLogger } from '../../../test/silentLogger'
import {
  connections,
  FakeServer,
  failNextConnection,
  openFakeConnection,
  useFakeServers
} from '../../../test/fakeServer'

jest.mock('universal-websocket-client', () => require('../../../test/fakeServer').fakeServerModule)

useFakeServers()

/** The code the driver closes with when *it* asked for the close. */
const INTENTIONAL_CLOSE = 4000

/**
 * The delay `reopen` schedules its retry on, read from the `reopen` option.
 * Deliberately *not* the 10000 default, and deliberately not the fallback below:
 * with either, a boundary assertion would pass whether or not the driver read
 * the option, and the two timers would be indistinguishable on the clock.
 */
const REOPEN_DELAY = 3000

/**
 * The hard fallback inside `reopenNow`, hardcoded in the driver rather than
 * configurable — so the number lives here as a constant the test names.
 */
const REOPEN_NOW_FALLBACK = 10000

/**
 * The ping interval is pushed far beyond every advance in this file on purpose:
 * a ping firing mid-test would move `lastPing` and send frames that none of the
 * assertions below are about. Nothing here is arithmetic about pinging — see
 * `ddp.liveness.spec.ts` for that.
 */
const createSocket = () => new Socket({
  host: 'localhost:3000',
  logger: silentLogger,
  reopen: REOPEN_DELAY,
  timeout: 10 * 60 * 1000
})

/**
 * Connecting and reconnecting. Every test starts from a real open connection
 * built through `openFakeConnection`, which asserts the mocked transport
 * constructor actually ran — so no assertion below can pass against a connection
 * the driver never built.
 *
 * Accepted gap: the fake's readiness is driven by hand, so "is connected" is
 * asserted against a value the test itself wrote. A real socket reporting OPEN
 * over a dead pipe — the grey zone `probe` exists for — is unreachable through
 * this seam. The replacement test below therefore proves the identity
 * comparison in `onClose`, not that a real zombie socket behaves the way that
 * guard assumes.
 */
describe('Socket connection lifecycle', () => {
  let socket: Socket
  let server: FakeServer

  beforeEach(async () => {
    socket = createSocket()
    server = await openFakeConnection(socket)
  })

  describe('a close from a replaced socket', () => {
    it('emits nothing and reopens nothing', async () => {
      const closeTheReplacedSocket = server.captureCloseHandler()
      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      const reopening = socket.reopenNow()
      const replacement = connections.latest
      expect(replacement).not.toBe(server)

      closeTheReplacedSocket(1006)

      // No 'close' emitted, no reopen scheduled, and — the harm the guard exists
      // to prevent — the live connection is still the replacement.
      expect(closeSeen).not.toHaveBeenCalled()
      expect(socket.openTimeout).toBeUndefined()
      expect(socket.connection).toBe(replacement)

      await replacement.accept()
      await reopening
    })
  })

  describe('a close from the live socket', () => {
    // A normal close and an abnormal one — the two shapes either side of the
    // single `code !== 4000` branch. More codes would add inputs, not coverage.
    it.each([1000, 1006])('schedules a reopen for code %i', (code) => {
      server.close(code)

      expect(socket.openTimeout).toBeDefined()
    })

    it(`schedules no reopen for the intentional code ${INTENTIONAL_CLOSE}`, () => {
      server.close(INTENTIONAL_CLOSE)

      expect(socket.openTimeout).toBeUndefined()
    })

    it('reopens once the scheduled delay has elapsed', async () => {
      server.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(connections.count).toBe(1)

      await jest.advanceTimersByTimeAsync(1)
      expect(connections.count).toBe(2)
      expect(socket.openTimeout).toBeUndefined()
    })
  })

  describe('opening over a previous connection', () => {
    it('detaches every handler and closes the predecessor with the intentional code', async () => {
      const reopening = socket.reopenNow()

      expect(server.attachedHandlers()).toEqual([])
      expect(server.closedWith).toEqual([INTENTIONAL_CLOSE])

      await connections.latest.accept()
      await reopening
    })

    it('replaces the predecessor even when tearing it down throws', async () => {
      server.failTeardown(new Error('teardown boom'))

      // `silentLogger` is a shared module singleton and `restoreMocks` does not
      // reset plain `jest.fn()`s, so the log assertion below would otherwise read
      // calls this test never made.
      const debug = silentLogger.debug as jest.Mock
      debug.mockClear()

      const reopening = socket.reopenNow()

      expect(debug).toHaveBeenCalledWith(
        '[ddp] open: previous connection teardown failed: teardown boom'
      )
      expect(connections.count).toBe(2)
      expect(socket.connection).toBe(connections.latest)

      await connections.latest.accept()
      await reopening
    })
  })

  describe('reopenNow', () => {
    it('builds one connection and shares one promise across concurrent callers', async () => {
      const disconnectSeen = jest.fn()
      socket.on('disconnected', disconnectSeen)

      const first = socket.reopenNow()
      const second = socket.reopenNow()

      expect(second).toBe(first)
      expect(connections.count).toBe(2)
      expect(socket.lastPing).toBe(0)
      expect(disconnectSeen).toHaveBeenCalledTimes(1)

      await connections.latest.accept()

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(socket.reopenPromise).toBeUndefined()
    })

    it('resolves on its hard fallback timer when no open ever arrives', async () => {
      const reopening = socket.reopenNow()

      await jest.advanceTimersByTimeAsync(REOPEN_NOW_FALLBACK - 1)
      expect(socket.reopenPromise).toBe(reopening)

      await jest.advanceTimersByTimeAsync(1)

      await expect(reopening).resolves.toBeUndefined()
      expect(socket.reopenPromise).toBeUndefined()
    })
  })

  describe('a transport constructor that throws', () => {
    it('rejects the open, logs the error, and builds nothing', async () => {
      const failure = new Error('transport unavailable')
      failNextConnection(failure)

      // Shared logger singleton, as above.
      const error = silentLogger.error as jest.Mock
      error.mockClear()

      // The existing connection has to stop being open first, or `open` short
      // circuits before it ever constructs anything.
      server.closeQuietly()

      await expect(socket.open()).rejects.toBe(failure)

      expect(error).toHaveBeenCalledWith(failure)
      expect(connections.count).toBe(1)
    })
  })

  describe('the retry interval', () => {
    /**
     * The `reopen` option is the only way to set the retry interval, so this
     * asserts a socket reconnected through `open` still retries on it.
     */
    it('comes from the reopen option after a reconnect', async () => {
      server.closeQuietly()
      const opening = socket.open()

      const reopened = connections.latest
      await reopened.accept()
      await opening

      expect(socket.config.reopen).toBe(REOPEN_DELAY)

      reopened.close(1006)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(connections.count).toBe(2)

      await jest.advanceTimersByTimeAsync(1)
      expect(connections.count).toBe(3)
    })
  })
})
