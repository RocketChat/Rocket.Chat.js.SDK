import { Socket } from '../ddp'
import { silentLogger } from '../../../test/silentLogger'
import {
  CLOSED,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  OPEN,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

/**
 * The interval the whole file is arithmetic about. Deliberately *not* the 10000
 * default: with the default, every boundary assertion below would pass whether
 * or not the socket read the option at all.
 */
const PING_INTERVAL = 3000

const createSocket = () => new Socket({
  host: 'localhost:3000',
  logger: silentLogger,
  timeout: PING_INTERVAL
})

/**
 * The rule for this file: `lastPing` is never assigned. It moves only by driving
 * the clock and delivering pongs through the incoming-message path, because the
 * arithmetic under test is exactly the distance between that stamp and now.
 * Assigning it would make every assertion below vacuous.
 *
 * A pong is therefore always delivered with `transport.receive`, never with
 * `socket.emit('pong')`: emitting resolves a pending send but never touches the
 * stamp, so the chain dies a few ticks later with every earlier assertion green.
 */
describe('Socket liveness', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
  })

  describe('alive', () => {
    it('is alive exactly up to twice the ping interval since the last ping', async () => {
      // The handshake stamped `lastPing`. The chain's ping does go out during
      // this advance, but nothing answers it — and only a pong moves the stamp —
      // so the clock alone walks the socket to the boundary.
      await jest.advanceTimersByTimeAsync(PING_INTERVAL * 2)

      expect(socket.alive()).toBe(true)
    })

    it('is not alive one millisecond past twice the ping interval', async () => {
      await jest.advanceTimersByTimeAsync(PING_INTERVAL * 2 + 1)

      expect(socket.alive()).toBe(false)
    })

    it('reports the interval it was configured with', () => {
      // The boundary tests are only meaningful if the socket read the option
      // rather than falling back to the 10000 default.
      expect(socket.config.ping).toBe(PING_INTERVAL)
    })
  })

  describe('connected', () => {
    it('needs both a ready socket and a fresh ping', () => {
      expect(transport.readyState).toBe(OPEN)
      expect(socket.alive()).toBe(true)
      expect(socket.connected).toBe(true)
    })

    it('is disconnected when the socket is not ready, however fresh the ping', () => {
      transport.readyState = CLOSED

      expect(socket.alive()).toBe(true)
      expect(socket.connected).toBe(false)
    })

    it('is disconnected when the ping is stale, however open the socket', async () => {
      await jest.advanceTimersByTimeAsync(PING_INTERVAL * 2 + 1)

      expect(transport.readyState).toBe(OPEN)
      expect(socket.connected).toBe(false)
    })

    it('closes a stale-ping socket rather than leaking it open', async () => {
      await jest.advanceTimersByTimeAsync(PING_INTERVAL * 2 + 1)

      await socket.close()

      expect(transport.closedWith).toEqual([4000]) // the user-disconnect code
      expect(transport.readyState).toBe(CLOSED)
    })
  })

  describe('probe', () => {
    it('fails immediately when there is no ready socket', async () => {
      transport.readyState = CLOSED

      await expect(socket.probe()).resolves.toBe(false)
    })

    it('succeeds on a pong that lands in the same millisecond as the probe', async () => {
      const stampBeforeProbe = socket.lastPing
      const pongSeen = jest.fn()
      socket.on('pong', pongSeen)

      const probing = socket.probe(2000)

      expect(transport.lastSent()).toEqual({ msg: 'ping' })
      transport.receive({ msg: 'pong' })

      expect(pongSeen).toHaveBeenCalled()
      expect(socket.lastPing).toBe(stampBeforeProbe)

      await expect(probing).resolves.toBe(true)
    })

    it('still settles on a later pong after one lands in the probe millisecond', async () => {
      const probing = socket.probe(2000)

      transport.receive({ msg: 'pong' })
      await jest.advanceTimersByTimeAsync(1)
      transport.receive({ msg: 'pong' })

      await expect(probing).resolves.toBe(true)

      // Only the ping chain's timer: the probe's deadline was cleared.
      expect(jest.getTimerCount()).toBe(1)
    })

    it('succeeds when the pong lands after the clock has moved', async () => {
      // The millisecond advance is the whole test: without it this passes for the
      // wrong reason, resolving false on the timeout instead of true on the pong.
      const probing = socket.probe(2000)

      await jest.advanceTimersByTimeAsync(1)
      transport.receive({ msg: 'pong' })

      await expect(probing).resolves.toBe(true)
    })
  })

  describe('the ping chain', () => {
    /**
     * One turn of the chain: fire the pending ping timer, answer it through the
     * incoming-message path, then flush so the reschedule — which sits behind a
     * promise — has actually happened before anything is asserted.
     *
     * Driven tick by tick rather than by one big advance on purpose: a single
     * large jump fires exactly one ping, because the next timer only exists once
     * the pong resolves. Running all timers is worse still — a self-rescheduling
     * chain hits the runner's timer-count abort.
     */
    const tick = async (deliverPong: boolean) => {
      await jest.advanceTimersToNextTimerAsync()
      if (deliverPong) transport.receive({ msg: 'pong' })
      await jest.advanceTimersByTimeAsync(0)
    }

    const tickWithPong = () => tick(true)
    const tickWithoutPong = () => tick(false)

    it('reschedules itself, leaving exactly one pending timer per tick', async () => {
      expect(jest.getTimerCount()).toBe(1)

      for (let turn = 1; turn <= 5; turn += 1) {
        await tickWithPong()

        // The invariant that stops a silently dead chain from passing green.
        expect(jest.getTimerCount()).toBe(1)
        expect(transport.lastSent()).toEqual({ msg: 'ping' })
        expect(socket.connected).toBe(true)
      }
    })

    it('reconnects when one pong is withheld', async () => {
      // This test used to pin the opposite: the chain died for good, because the
      // ping's send went out while `connected` was still true, waited forever on
      // a pong reply, and the `.catch(() => this.reopen())` behind it never ran.
      // `ping` now races its send against a deadline of its own, so the withheld
      // pong is what triggers the reconnect rather than what prevents it.
      await tickWithPong()
      await tickWithPong()

      await tickWithoutPong()

      // The ping's own deadline, the one timer the unanswered send leaves behind.
      expect(jest.getTimerCount()).toBe(1)

      // One millisecond past the deadline, which is also one past the aliveness
      // boundary — the stamp last moved on the pong two ticks ago.
      await jest.advanceTimersByTimeAsync(PING_INTERVAL + 1)

      // The stamp is stale by now, so the socket reads as disconnected, and the
      // expired ping has scheduled the reopen.
      expect(socket.alive()).toBe(false)
      expect(socket.connected).toBe(false)
      expect(socket.openTimeout).toBeDefined()

      // And the reopen actually builds a replacement transport once its delay
      // elapses — the socket is no longer abandoned open forever.
      await jest.advanceTimersByTimeAsync(socket.config.reopen)

      expect(fakeSockets).toHaveLength(2)
      await driveToHandshake(fakeSockets[1])
      expect(socket.connected).toBe(true)
    })

    it('clears both the ping and the reopen timer on close', async () => {
      // A close the driver did not ask for schedules a reopen, so both of the
      // socket's timers are pending at once.
      transport.close(1006)

      // Named rather than merely counted, so the assertion still means "the ping
      // and the reopen" if some other timer ever joins the count.
      expect(socket.pingTimeout).toBeDefined()
      expect(socket.openTimeout).toBeDefined()
      expect(jest.getTimerCount()).toBe(2)

      await socket.close()

      expect(jest.getTimerCount()).toBe(0)
    })
  })
})
