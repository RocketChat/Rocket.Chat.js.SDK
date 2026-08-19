import { ISocketOptions } from '../../../interfaces'
import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  OPEN,
  fakeTransportModule,
  openFakeConnection,
  USER_DISCONNECT,
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

const createSocket = (overrides: ISocketOptions = {}) => new Socket({
  host: 'localhost:3000',
  logger: createSilentLogger(),
  timeout: PING_INTERVAL,
  ...overrides
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

  describe('a server sending only unreadable DDP messages', () => {
    const deliverAtBoundaryThenStepPast = async (deliver: () => void) => {
      await jest.advanceTimersByTimeAsync(PING_INTERVAL * 2)
      deliver()
      await jest.advanceTimersByTimeAsync(1)
    }

    it('is not kept alive by an empty DDP message', async () => {
      await deliverAtBoundaryThenStepPast(() => transport.receiveRaw(''))

      expect(socket.alive()).toBe(false)
    })

    it('is not kept alive by a malformed DDP message', async () => {
      await deliverAtBoundaryThenStepPast(() => transport.receiveRaw('not json'))

      expect(socket.alive()).toBe(false)
    })

    it('is not kept alive by a DDP message that parses to nothing', async () => {
      await deliverAtBoundaryThenStepPast(() => transport.receiveRaw('null'))

      expect(socket.alive()).toBe(false)
    })

    it('is still kept alive by a DDP message it can read, so a healthy socket is never reconnected', async () => {
      await deliverAtBoundaryThenStepPast(() => transport.receive({ msg: 'updated' }))

      expect(socket.alive()).toBe(true)
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

      expect(transport.closedWith).toEqual([USER_DISCONNECT])
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
    const tick = async (deliver?: () => void) => {
      await jest.advanceTimersToNextTimerAsync()
      deliver?.()
      await jest.advanceTimersByTimeAsync(0)
    }

    const tickWithPong = () => tick(() => transport.receive({ msg: 'pong' }))
    const tickWithoutPong = () => tick()
    const tickWithUnreadableMessage = () => tick(() => transport.receiveRaw('not json'))

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

    it('leaves the reconnect to the close when a ping is abandoned by it', async () => {
      // A ping abandoned because its connection was replaced must not schedule a
      // reopen of its own: the close that replaced it already scheduled one, and
      // the replacement starts its own chain.
      await tickWithPong()

      transport.close(1006)
      await jest.advanceTimersToNextTimerAsync()

      await jest.advanceTimersByTimeAsync(socket.config.reopen)
      expect(fakeSockets).toHaveLength(2)

      await driveToHandshake(fakeSockets[1])
      transport = fakeSockets[1]

      await tickWithPong()
      expect(fakeSockets).toHaveLength(2)
      expect(transport.lastSent()).toEqual({ msg: 'ping' })
      expect(socket.connected).toBe(true)
    })

    it('does not reopen a socket the caller closed while a ping was in flight', async () => {
      await jest.advanceTimersToNextTimerAsync()
      expect(transport.lastSent()).toEqual({ msg: 'ping' })

      await socket.close()
      await jest.advanceTimersByTimeAsync(0)

      expect(socket.openTimeout).toBeUndefined()
      expect(jest.getTimerCount()).toBe(0)

      // And no replacement is built once the reopen delay it might have scheduled
      // would have elapsed.
      await jest.advanceTimersByTimeAsync(socket.config.reopen * 2)
      expect(fakeSockets).toHaveLength(1)
    })

    it('schedules no second reopen when a reopen replaces the connection mid-ping', async () => {
      await jest.advanceTimersToNextTimerAsync()
      expect(transport.lastSent()).toEqual({ msg: 'ping' })

      // No close event, and inside the ping's own deadline, so `connecting` from
      // the replacement is the only thing that can end the ping's wait.
      transport.readyState = CLOSED
      const opening = socket.open()
      await driveToHandshake(fakeSockets[1])
      await opening

      // Nothing queued a reopen against the connection that just came back.
      expect(fakeSockets).toHaveLength(2)
      expect(socket.connected).toBe(true)
      expect(socket.openTimeout).toBeUndefined()
    })

    it('schedules a reopen when the server closes with the user-disconnect code mid-ping', async () => {
      await jest.advanceTimersToNextTimerAsync()
      expect(transport.lastSent()).toEqual({ msg: 'ping' })

      transport.close(USER_DISCONNECT)
      await jest.advanceTimersByTimeAsync(0)

      expect(socket.openTimeout).toBeDefined()

      await jest.advanceTimersByTimeAsync(socket.config.reopen)
      expect(fakeSockets).toHaveLength(2)
    })

    it('keeps the reopen scheduled when a pong completes a ping on a transport that is gone', async () => {
      await jest.advanceTimersToNextTimerAsync()
      expect(transport.lastSent()).toEqual({ msg: 'ping' })

      transport.readyState = CLOSED
      socket.reopen()
      expect(socket.openTimeout).toBeDefined()

      transport.receive({ msg: 'pong' })
      await jest.advanceTimersByTimeAsync(0)

      expect(socket.openTimeout).toBeDefined()

      await jest.advanceTimersByTimeAsync(socket.config.reopen)
      expect(fakeSockets).toHaveLength(2)
    })

    it('reconnects when a server answers pings with nothing readable', async () => {
      await tickWithPong()

      await tickWithUnreadableMessage()

      await jest.advanceTimersByTimeAsync(PING_INTERVAL + 1)

      expect(socket.alive()).toBe(false)
      expect(socket.connected).toBe(false)
      expect(socket.openTimeout).toBeDefined()

      await jest.advanceTimersByTimeAsync(socket.config.reopen)

      expect(fakeSockets).toHaveLength(2)
    })

    const scheduleReopenByWithholdingPong = async () => {
      await tickWithoutPong()
      await jest.advanceTimersByTimeAsync(PING_INTERVAL + 1)
      expect(socket.openTimeout).toBeDefined()
    }

    const receiveUnrelatedFrame = async () => {
      await jest.advanceTimersByTimeAsync(PING_INTERVAL)
      transport.receive({ msg: 'updated', methods: ['1'] })
    }

    const advanceToScheduledReopen = async () => {
      await jest.advanceTimersToNextTimerAsync()
      return fakeSockets[fakeSockets.length - 1]
    }

    const replacementAfterHandshake = async () => {
      const replacement = await advanceToScheduledReopen()
      await driveToHandshake(replacement)
      return replacement
    }

    const replacementWithoutHandshake = async () => {
      const replacement = await advanceToScheduledReopen()

      replacement.readyState = OPEN
      replacement.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      replacement.receive({ msg: 'updated', methods: ['1'] })
      await jest.advanceTimersByTimeAsync(socket.config.timeout)
      return replacement
    }

    it('replaces the connection when a scheduled reopen finds the socket alive again', async () => {
      await tickWithPong()
      await scheduleReopenByWithholdingPong()
      await receiveUnrelatedFrame()
      expect(socket.connected).toBe(true)

      transport = await replacementAfterHandshake()

      expect(fakeSockets).toHaveLength(2)
      expect(socket.connected).toBe(true)

      await tickWithPong()
      expect(jest.getTimerCount()).toBe(1)
      expect(transport.lastSent()).toEqual({ msg: 'ping' })
      expect(socket.connected).toBe(true)
    })

    it('ends a send left pending by rebuilding, however alive the socket reads', async () => {
      const pending = socket.send({ msg: 'method', method: 'anything' })
      const settled = jest.fn()
      pending.then(settled, settled)

      await scheduleReopenByWithholdingPong()
      await receiveUnrelatedFrame()
      expect(socket.connected).toBe(true)
      expect(settled).not.toHaveBeenCalled()

      transport = await replacementAfterHandshake()

      expect(fakeSockets).toHaveLength(2)
      await expect(pending).rejects.toThrow('[ddp] connection reopened before the response arrived')
    })

    it('rebuilds for a server that keeps sending frames and never answers a ping', async () => {
      const pending = socket.send({ msg: 'method', method: 'anything' })
      pending.catch(() => undefined)

      await scheduleReopenByWithholdingPong()

      await receiveUnrelatedFrame()
      await receiveUnrelatedFrame()
      expect(socket.connected).toBe(true)

      transport = await replacementAfterHandshake()

      expect(fakeSockets).toHaveLength(2)
      await expect(pending).rejects.toThrow('[ddp] connection reopened before the response arrived')
    })

    it('schedules another reopen when the replacement never completes its handshake', async () => {
      const pending = socket.send({ msg: 'method', method: 'anything' })
      const settled = jest.fn()
      pending.then(settled, settled)

      await scheduleReopenByWithholdingPong()
      await receiveUnrelatedFrame()

      const replacement = await replacementWithoutHandshake()
      transport = replacement

      expect(socket.connected).toBe(true)
      expect(socket.pingTimeout).toBeUndefined()
      expect(socket.openTimeout).toBeDefined()

      await expect(pending).rejects.toThrow('[ddp] connection reopened before the response arrived')

      await jest.advanceTimersByTimeAsync(socket.config.reopen)
      expect(fakeSockets).toHaveLength(3)
      expect(fakeSockets[fakeSockets.length - 1]).not.toBe(replacement)
    })

    it('schedules no reopen behind a handshake that lands after the reopen deadline', async () => {
      await scheduleReopenByWithholdingPong()

      await jest.advanceTimersToNextTimerAsync()
      const replacement = fakeSockets[fakeSockets.length - 1]
      await jest.advanceTimersByTimeAsync(socket.config.timeout)
      expect(socket.openTimeout).toBeDefined()

      transport = replacement
      await driveToHandshake(transport)

      expect(socket.pingTimeout).toBeDefined()
      expect(socket.openTimeout).toBeUndefined()
      expect(jest.getTimerCount()).toBe(1)

      await tickWithPong()
      expect(fakeSockets).toHaveLength(2)
      expect(transport.lastSent()).toEqual({ msg: 'ping' })
      expect(socket.connected).toBe(true)
    })

    it('keeps rebuilding when a consumer listener on disconnected throws', async () => {
      socket.on('disconnected', () => {
        throw new Error('consumer listener')
      })

      const pending = socket.send({ msg: 'method', method: 'anything' })
      pending.catch(() => undefined)

      await scheduleReopenByWithholdingPong()
      await receiveUnrelatedFrame()

      transport = await replacementAfterHandshake()

      expect(fakeSockets).toHaveLength(2)
      expect(socket.connected).toBe(true)
      await expect(pending).rejects.toThrow('[ddp] connection reopened before the response arrived')

      await tickWithPong()
      expect(jest.getTimerCount()).toBe(1)
      expect(transport.lastSent()).toEqual({ msg: 'ping' })
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

describe('Socket close whose wait outlasts the reopen delay', () => {
  const REOPEN_DELAY_SHORTER_THAN_CLOSE_DEADLINE = 400
  const PAST_THE_CLOSE_DEADLINE = PING_INTERVAL

  it('leaves neither a connection nor a reopen behind', async () => {
    const socket = createSocket({ reopen: REOPEN_DELAY_SHORTER_THAN_CLOSE_DEADLINE })

    socket.open().catch(() => undefined)
    socket.reopenNow()
    expect(fakeSockets).toHaveLength(2)

    fakeSockets[1].answersClose = false
    const closing = socket.close()
    await jest.advanceTimersByTimeAsync(PAST_THE_CLOSE_DEADLINE)
    await closing

    expect(fakeSockets).toHaveLength(2)
    expect(socket.connection).toBeUndefined()
    expect(socket.openTimeout).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('Socket close superseded by a reopen mid-wait', () => {
  const THE_CLOSE_DEADLINE = 2000
  const REOPEN_DELAY = 400
  const REBUILD_DEADLINE = 400
  const PING_INTERVAL_INSIDE_THE_CLOSE_WAIT = 500

  const closeSupersededByAReopen = async () => {
    const socket = createSocket({
      reopen: REOPEN_DELAY,
      timeout: REBUILD_DEADLINE,
      ping: PING_INTERVAL_INSIDE_THE_CLOSE_WAIT
    })
    const transport = await openFakeConnection(socket)
    transport.answersClose = false

    const closing = socket.close()
    await jest.advanceTimersByTimeAsync(THE_CLOSE_DEADLINE)
    await closing

    return socket
  }

  it('schedules no reopen once the close it superseded returns', async () => {
    const socket = await closeSupersededByAReopen()

    expect(fakeSockets).toHaveLength(2)
    expect(socket.openTimeout).toBeUndefined()

    await jest.advanceTimersByTimeAsync(REOPEN_DELAY * 4)
    expect(fakeSockets).toHaveLength(2)
  })

  it('lets go of the connection the reopen built rather than leaving it unwatched', async () => {
    const socket = await closeSupersededByAReopen()

    expect(fakeSockets).toHaveLength(2)
    expect(socket.connection).toBeUndefined()
    expect(socket.pingTimeout).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('Socket close superseded by an open mid-wait', () => {
  const THE_CLOSE_DEADLINE = 2000
  const REOPEN_DELAY_PAST_THE_CLOSE_DEADLINE = 4000
  const PING_INTERVAL_INSIDE_THE_CLOSE_WAIT = 500
  const AFTER_THE_UNANSWERED_PING = PING_INTERVAL_INSIDE_THE_CLOSE_WAIT * 2

  it('leaves a connection whose handshake an open is still waiting on alone', async () => {
    const socket = createSocket({
      reopen: REOPEN_DELAY_PAST_THE_CLOSE_DEADLINE,
      ping: PING_INTERVAL_INSIDE_THE_CLOSE_WAIT
    })
    const transport = await openFakeConnection(socket)
    transport.answersClose = false

    const closing = socket.close()
    await jest.advanceTimersByTimeAsync(AFTER_THE_UNANSWERED_PING)
    expect(socket.pingTimeout).toBeUndefined()

    transport.readyState = CLOSED
    const opening = socket.open()
    const replacement = fakeSockets[1]

    await jest.advanceTimersByTimeAsync(THE_CLOSE_DEADLINE)
    await closing

    expect(socket.connection).toBe(replacement)
    expect(replacement.onmessage).not.toBeNull()

    await driveToHandshake(replacement)
    await opening
    expect(socket.connected).toBe(true)
  })

  it('lets go of a connection whose open has landed and whose chain has since died', async () => {
    const socket = createSocket({
      reopen: REOPEN_DELAY_PAST_THE_CLOSE_DEADLINE,
      ping: PING_INTERVAL_INSIDE_THE_CLOSE_WAIT
    })
    const transport = await openFakeConnection(socket)
    transport.answersClose = false

    const closing = socket.close()
    await jest.advanceTimersByTimeAsync(AFTER_THE_UNANSWERED_PING)

    transport.readyState = CLOSED
    const opening = socket.open()
    const replacement = fakeSockets[1]
    await driveToHandshake(replacement)
    await opening

    replacement.sendError = new Error('the transport refused the write')
    await jest.advanceTimersByTimeAsync(PING_INTERVAL_INSIDE_THE_CLOSE_WAIT)
    expect(socket.pingTimeout).toBeUndefined()

    await jest.advanceTimersByTimeAsync(THE_CLOSE_DEADLINE - AFTER_THE_UNANSWERED_PING - PING_INTERVAL_INSIDE_THE_CLOSE_WAIT)
    await closing

    expect(socket.connection).toBeUndefined()
    expect(replacement.closedWith).toEqual([USER_DISCONNECT])
  })

  it('lets go of a connection whose open has already failed', async () => {
    const socket = createSocket({
      reopen: REOPEN_DELAY_PAST_THE_CLOSE_DEADLINE,
      ping: PING_INTERVAL_INSIDE_THE_CLOSE_WAIT
    })
    const transport = await openFakeConnection(socket)
    transport.answersClose = false

    const closing = socket.close()
    await jest.advanceTimersByTimeAsync(AFTER_THE_UNANSWERED_PING)

    transport.readyState = CLOSED
    const opening = socket.open()
    const replacement = fakeSockets[1]
    replacement.sendError = new Error('the transport refused the write')
    replacement.readyState = OPEN
    replacement.onopen?.({})
    await expect(opening).rejects.toBe(replacement.sendError)

    await jest.advanceTimersByTimeAsync(THE_CLOSE_DEADLINE)
    await closing

    expect(socket.connection).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })
})

describe('Socket reopen settling on its deadline', () => {
  const PING_LONGER_THAN_THE_REOPEN_DEADLINE = PING_INTERVAL * 4

  const createSocketWithSlowPing = () =>
    createSocket({ ping: PING_LONGER_THAN_THE_REOPEN_DEADLINE })

  it('re-arms the chain when nothing else is running behind it', async () => {
    const socket = createSocket()
    socket.open().catch(() => undefined)

    const reopening = socket.reopenNow()
    await jest.advanceTimersByTimeAsync(socket.config.timeout)
    await reopening

    expect(fakeSockets).toHaveLength(2)
    expect(socket.connected).toBe(false)
    expect(socket.pingTimeout).toBeUndefined()
    expect(socket.openTimeout).toBeDefined()

    await jest.advanceTimersByTimeAsync(socket.config.reopen)
    expect(fakeSockets).toHaveLength(3)
  })

  const pingLeftInFlightOnAClosedTransport = async (socket: Socket) => {
    const transport = await openFakeConnection(socket)
    transport.readyState = CLOSED
    await jest.advanceTimersByTimeAsync(socket.config.ping)
    expect(socket.pingTimeout).toBeUndefined()
  }

  it('arms a reopen behind a ping in flight on the connection it replaced', async () => {
    const socket = createSocketWithSlowPing()
    await pingLeftInFlightOnAClosedTransport(socket)

    const reopening = socket.reopenNow()
    await jest.advanceTimersByTimeAsync(socket.config.timeout)
    await reopening

    expect(fakeSockets).toHaveLength(2)
    expect(socket.pingTimeout).toBeUndefined()
    expect(socket.openTimeout).toBeDefined()

    await jest.advanceTimersByTimeAsync(socket.config.reopen)
    expect(fakeSockets).toHaveLength(3)
  })

  it('arms no reopen behind a ping in flight on the connection it still has', async () => {
    const socket = createSocketWithSlowPing()
    await pingLeftInFlightOnAClosedTransport(socket)

    jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => {
      throw new Error('transport unavailable')
    })

    const reopening = socket.reopenNow()
    await jest.advanceTimersByTimeAsync(socket.config.timeout)
    await reopening

    expect(fakeSockets).toHaveLength(1)
    expect(socket.openTimeout).toBeUndefined()
  })
})

describe('Socket handshake arming the liveness chain', () => {
  it('arms the chain before it emits open, which is what a reopen reads', async () => {
    const socket = createSocket()
    const armedWhenOpenEmitted = jest.fn()
    socket.on('open', () => armedWhenOpenEmitted(socket.pingTimeout !== undefined))

    await openFakeConnection(socket)

    expect(armedWhenOpenEmitted).toHaveBeenCalledWith(true)
  })
})

describe('Socket failure at a public entry point', () => {
  it('schedules a reopen when the handshake write fails', async () => {
    const socket = createSocket()
    socket.open().catch(() => undefined)

    const transport = fakeSockets[0]
    transport.sendError = new Error('the transport refused the write')
    transport.readyState = OPEN
    transport.onopen?.({})
    await jest.advanceTimersByTimeAsync(0)

    expect(socket.pingTimeout).toBeUndefined()
    expect(socket.openTimeout).toBeDefined()

    await jest.advanceTimersByTimeAsync(socket.config.reopen)
    expect(fakeSockets).toHaveLength(2)
  })

  it('schedules a reopen when checkAndReopen cannot open a connection', async () => {
    const socket = createSocket()
    socket.checkAndReopen()

    fakeSockets[0].onerror?.(new Error('the transport never connected'))
    await jest.advanceTimersByTimeAsync(0)

    expect(socket.openTimeout).toBeDefined()

    await jest.advanceTimersByTimeAsync(socket.config.reopen)
    expect(fakeSockets).toHaveLength(2)
  })
})
