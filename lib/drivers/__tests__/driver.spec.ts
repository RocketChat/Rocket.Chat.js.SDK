import { Driver } from '../driver'
import { ISocketOptions } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  openFakeConnection,
  USER_DISCONNECT,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Same seam as the socket specs: the driver builds its Socket, the Socket builds
// the fake through its normal code path. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

// Typed rather than `object`: the option names have to typecheck, or the pin on
// the discarded timeout would go green against a typo.
const createDriver = (options: ISocketOptions = {}) =>
  new Driver({ host: 'localhost:3000', logger: createSilentLogger(), ...options })

/**
 * Accepted gaps, on the record rather than silently skipped:
 *
 * - The fixed topic and event lists (`subscribeNotifyAll`, `subscribeLoggedNotify`,
 *   `subscribeNotifyUser`, `subscribeRoom`) are data, not behaviour. A test over
 *   them is a snapshot that goes red on every intentional product change, so the
 *   reshaping they all funnel through is pinned once, below, instead.
 * - The one-line pass-throughs (`probe`, `lastPing`, `pingInterval`,
 *   `subscribeRaw`, `unsubscribe`, `unsubscribeAll`, `methodCall`)
 *   forward their arguments to the socket and nothing else. They carry no
 *   logic, so a test over them asserts that a line of code exists. `disconnect`
 *   and `reopenNow` forward just as thinly, but what they forward to takes
 *   ownership of the socket, so the Driver-level races are pinned below.
 */

describe('new Driver', () => {
  it('strips the protocol from the host it was given', () => {
    const driver = createDriver({ host: 'https://open.rocket.chat' })

    expect(driver.config.host).toBe('open.rocket.chat')
    expect(driver['socket'].host).toBe('ws://open.rocket.chat/websocket')
  })

  it('leaves a host that carries no protocol alone', () => {
    expect(createDriver().config.host).toBe('localhost:3000')
  })

  it('keeps the caller\'s timeout, and the socket pings on it', () => {
    const driver = createDriver({ timeout: 250 })

    expect(driver.config.timeout).toBe(250)
    expect(driver['socket'].config.ping).toBe(250)
  })

  it('defaults the timeout to 10000 when the caller gives none', () => {
    expect(createDriver().config.timeout).toBe(10000)
  })
})

describe('Driver.subscribe', () => {
  it('reshapes its arguments on the way through', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])

    const subscribing = driver.subscribe('stream-notify-room', 'room-id/typing', false)

    // What the caller passed and what goes on the wire differ: the event name
    // and a wrapper object become the two params, and the caller's extra
    // arguments are buried under `args`.
    const { id } = transport.lastSent() as { id: string }
    expect(transport.lastSent()).toEqual({
      msg: 'sub',
      id,
      name: 'stream-notify-room',
      params: ['room-id/typing', { useCollection: false, args: [false] }]
    })

    transport.receive({ msg: 'ready', subs: [id] })

    await expect(subscribing).resolves.toMatchObject({
      id,
      name: 'stream-notify-room',
      params: ['room-id/typing', { useCollection: false, args: [false] }]
    })
    expect(Object.keys(driver['socket'].subscriptions)).toEqual([id])
  })
})

describe('Driver.waitForNotifyUserMediaSubs', () => {
  const userId = 'user-id'
  const topic = 'stream-notify-user'

  /**
   * Register a subscription on the Socket, as a successful sub would, and
   * return the id the driver derived for it. Through the Socket, so the entry
   * has the shape the readiness poll looks for — `name` the topic, `params[0]`
   * the user event.
   */
  const addSub = async (driver: Driver, transport: FakeWebSocket, ...params: any[]) => {
    const subscribing = driver['socket'].subscribe(topic, params)
    const { id } = transport.lastSent() as { id: string }
    transport.receive({ msg: 'ready', subs: [id] })
    await subscribing
    return id
  }

  /** Register a media subscription on the Socket, as a successful sub would. */
  const addMediaSub = (driver: Driver, transport: FakeWebSocket, name: string) =>
    addSub(driver, transport, `${userId}/${name}`)

  it('resolves false without a logged-in user, before scheduling anything', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    const sentBefore = transport.sent.length
    // The socket's own ping timer is pending here and stays that way; what the
    // guard has to avoid is adding the poll and the deadline on top of it.
    const timersBefore = jest.getTimerCount()

    await expect(driver.waitForNotifyUserMediaSubs()).resolves.toBe(false)

    expect(transport.sent).toHaveLength(sentBefore)
    expect(jest.getTimerCount()).toBe(timersBefore)
  })

  it('resolves ready after an immediate reopen, on the socket the reopen built', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    // A real reopen: a second transport is constructed and handshaken, and the
    // subscription map survives it — which is what makes the resubscribe below
    // reuse the ids rather than mint new ones.
    const reopening = driver.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]
    expect(reopened).not.toBe(transport)
    await driveToHandshake(reopened, 'reopened-session')
    await reopening

    const waiting = driver.waitForNotifyUserMediaSubs()
    // The resubscribes go out on the new socket, not the dead one.
    expect(reopened.sent.map((frame) => JSON.parse(frame).id))
      .toEqual(expect.arrayContaining([signalId, callsId]))
    reopened.receive({ msg: 'ready', subs: [signalId] })
    reopened.receive({ msg: 'ready', subs: [callsId] })

    await expect(waiting).resolves.toBe(true)
  })

  it('does not resubscribe again while a resubscribe is still in flight', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    const sentBefore = transport.sent.length
    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value }, () => { resolved = false })

    // The server never acks, so the first attempt stays in flight across many
    // poll ticks. Without the latch each tick would fire another pair of
    // resubscribes — a storm the server would see as repeated sub requests.
    await jest.advanceTimersByTimeAsync(1000)

    expect(transport.sent).toHaveLength(sentBefore + 2)
    expect(resolved).toBeUndefined()

    // Left settled so the pending timers do not outlive the test.
    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'ready', subs: [callsId] })
    await expect(waiting).resolves.toBe(true)
  })

  it('polls until both media subscriptions appear, then resubscribes on their own ids', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    // The field login writes. Assigning it keeps the reconnect being reproduced
    // here — subscriptions not yet restored — reachable without a login round.
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value }, () => { resolved = false })

    // Nothing to find yet, and one poll interval passing changes nothing.
    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    // Half of what it waits for is not enough: the poll wants both.
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    const callsId = await addMediaSub(driver, transport, 'media-calls')
    const sentBefore = transport.sent.length
    await jest.advanceTimersByTimeAsync(100)

    // Both resubscribes go out on the existing ids, so the server treats them as
    // the same subscriptions rather than minting new ones.
    const resent = transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame))
    expect(resent).toEqual([
      { msg: 'sub', id: signalId, name: topic, params: [`${userId}/media-signal`] },
      { msg: 'sub', id: callsId, name: topic, params: [`${userId}/media-calls`] }
    ])

    // Still pending until the server acks both: readiness is the ack, not the send.
    expect(resolved).toBeUndefined()
    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'ready', subs: [callsId] })

    await expect(waiting).resolves.toBe(true)
  })

  it('resolves false when the server refuses both resubscribes', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    transport.receive({ msg: 'nosub', id: signalId })
    transport.receive({ msg: 'nosub', id: callsId })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when only one of the two resubscribes is refused', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'nosub', id: callsId })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when a resubscribe is acked without a subscription id', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    // Answered, but carrying nothing to subscribe with: the stream is no more
    // restored than it is by a refusal.
    transport.receive({ msg: 'ready', id: signalId, subs: [] })
    transport.receive({ msg: 'ready', subs: [callsId] })

    await expect(waiting).resolves.toBe(false)
  })

  it('leaves the user\'s other streams on the same topic alone', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    await addSub(driver, transport, `${userId}/message`)
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    const sentBefore = transport.sent.length
    const waiting = driver.waitForNotifyUserMediaSubs()

    const resent = transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame).id)
    expect(resent).toEqual([signalId, callsId])

    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'ready', subs: [callsId] })
    await expect(waiting).resolves.toBe(true)
  })

  it('does not count another user\'s media streams as this user\'s', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    await addSub(driver, transport, 'other-user/media-signal')
    await addSub(driver, transport, 'other-user/media-calls')

    const sentBefore = transport.sent.length
    const waiting = driver.waitForNotifyUserMediaSubs(500)

    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
    expect(transport.sent).toHaveLength(sentBefore)
  })

  it('resubscribes every entry recorded for a media stream, and needs each acked', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    // A second entry the readiness poll finds for the same media stream: same
    // event, different params, so a stream of its own. Every entry found is
    // re-sent, and one refusal is enough.
    const collectedSignalId = await addSub(driver, transport, `${userId}/media-signal`, false)
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    const sentBefore = transport.sent.length
    const waiting = driver.waitForNotifyUserMediaSubs()

    const resent = transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame).id)
    expect(resent).toEqual([signalId, collectedSignalId, callsId])

    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'nosub', id: collectedSignalId })
    transport.receive({ msg: 'ready', subs: [callsId] })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves ready when the streams only land on the socket a reopen is still building', async () => {
    const driver = createDriver()
    await openFakeConnection(driver['socket'])
    driver.userId = userId

    const reopening = driver.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]

    // The gate opens before the new connection is even handshaken: nothing to
    // find yet, so it is the poll that has to carry it across the reopen.
    const waiting = driver.waitForNotifyUserMediaSubs()

    await driveToHandshake(reopened, 'reopened-session')
    await reopening

    const signalId = await addMediaSub(driver, reopened, 'media-signal')
    const callsId = await addMediaSub(driver, reopened, 'media-calls')

    const sentBefore = reopened.sent.length
    await jest.advanceTimersByTimeAsync(100)

    const resent = reopened.sent.slice(sentBefore).map((frame) => JSON.parse(frame).id)
    expect(resent).toEqual([signalId, callsId])

    reopened.receive({ msg: 'ready', subs: [signalId] })
    reopened.receive({ msg: 'ready', subs: [callsId] })
    await expect(waiting).resolves.toBe(true)
  })

  it('takes its deadline from the configured timeout when given none', async () => {
    const timeout = 4000
    const driver = createDriver({ timeout })
    await openFakeConnection(driver['socket'])
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value })

    await jest.advanceTimersByTimeAsync(timeout - 1)
    expect(resolved).toBeUndefined()

    await jest.advanceTimersByTimeAsync(1)
    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when the subscriptions never appear before the deadline', async () => {
    const driver = createDriver()
    await openFakeConnection(driver['socket'])
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value }, () => { resolved = false })

    await jest.advanceTimersByTimeAsync(499)
    expect(resolved).toBeUndefined()

    await jest.advanceTimersByTimeAsync(1)
    await expect(waiting).resolves.toBe(false)
  })

  it('leaves no timer behind once it settles', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
    const signalId = await addMediaSub(driver, transport, 'media-signal')
    const callsId = await addMediaSub(driver, transport, 'media-calls')

    // The socket's own ping timer is already pending and stays that way; only
    // what the wait itself scheduled has to be gone by the end.
    const timersBefore = jest.getTimerCount()

    const waiting = driver.waitForNotifyUserMediaSubs()
    // The first attempt runs synchronously, so both resubscribes are already out.
    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'ready', subs: [callsId] })
    await expect(waiting).resolves.toBe(true)

    // Both the poll interval and the deadline are cleared: a leaked interval
    // would keep resubscribing for the life of the process.
    expect(jest.getTimerCount()).toBe(timersBefore)
  })
})

describe('Driver.connect', () => {
  it('keeps echoing open after a send has waited on it', async () => {
    // The driver holds a long-lived `open` listener that echoes the socket's
    // open as its own `connected`. A send that waits on open registers a `once`
    // beside it, and removing that `once` once it has fired must not take the
    // echo down with it, which would leave the driver permanently silent about
    // every later Reopen.
    const driver = createDriver()
    const connecting = driver.connect()

    await driveToHandshake(fakeSockets[0])
    await connecting

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    fakeSockets[0].readyState = CLOSED
    const reopening = driver['socket'].open()
    const reopened = fakeSockets[1]
    const sending = driver['socket'].send({ msg: 'method', method: 'getUsersOfRoom', params: [] })

    await driveToHandshake(reopened)
    await reopening
    await jest.advanceTimersByTimeAsync(0)
    reopened.receive({ msg: 'result', id: 'ddp-2', result: 'ok' })
    await expect(sending).resolves.toMatchObject({ result: 'ok' })

    // The open the send rode in on is one echo; the next open has to produce
    // another, which is what the dropped listener made impossible.
    expect(connectedSeen).toHaveBeenCalledTimes(1)

    reopened.readyState = CLOSED
    const reopeningAgain = driver['socket'].open()
    await driveToHandshake(fakeSockets[2])
    await reopeningAgain

    expect(connectedSeen).toHaveBeenCalledTimes(2)
  })

  it('echoes open once however many times connect was called', async () => {
    const driver = createDriver()
    const connecting = driver.connect()
    const transport = fakeSockets[0]

    await driveToHandshake(transport)
    await connecting

    transport.close()

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    // A caller that calls `connect` on each foreground or network change
    // reaches it again with the socket down, so the early return does not cover
    // it. One open still means one `connected`.
    const connectingAgain = driver.connect()
    await driveToHandshake(fakeSockets[1])
    await connectingAgain

    expect(connectedSeen).toHaveBeenCalledTimes(1)
  })

  it('joins a second connect to the attempt already running', async () => {
    const driver = createDriver()

    const joining = driver.connect()
    const joined = driver.connect()

    // One attempt, so one transport: the second caller builds nothing of its own.
    expect(fakeSockets).toHaveLength(1)

    await driveToHandshake(fakeSockets[0])

    await expect(joining).resolves.toBe(driver)
    await expect(joined).resolves.toBe(driver)
  })

  const failConnects = async (driver: Driver, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const socketsBeforeAttempt = fakeSockets.length
      const failing = driver.connect()
      fakeSockets[socketsBeforeAttempt].onerror?.(new Error('no route to host'))
      // A transport error event carries no reason the caller could act on, so
      // the attempt reports its own failure.
      await expect(failing).rejects
        .toThrow('[ddp] transport failed during the connection attempt')
    }
  }

  it('echoes no connected while connects fail', async () => {
    const driver = createDriver()
    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    await failConnects(driver, 3)

    expect(connectedSeen).not.toHaveBeenCalled()
  })

  it('echoes connected once after earlier connects failed', async () => {
    const driver = createDriver()
    const failedAttempts = 3

    await failConnects(driver, failedAttempts)

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    const socketsBeforeConnect = fakeSockets.length
    const connecting = driver.connect()
    await driveToHandshake(fakeSockets[socketsBeforeConnect])
    await connecting

    expect(connectedSeen).toHaveBeenCalledTimes(1)
  })
})

describe('Driver.disconnect', () => {
  const CLOSE_DEADLINE = 2000

  it('joins a concurrent disconnect to one close of the socket', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    transport.answersClose = false

    const first = driver.disconnect()
    const second = driver.disconnect()

    await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(transport.closedWith).toEqual([USER_DISCONNECT])
  })

  it('refuses a connect issued while it owns the socket', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    transport.readyState = CLOSED

    const disconnecting = driver.disconnect()
    const connecting = driver.connect()

    await expect(connecting).rejects.toThrow('[ddp] connection closed before it opened')
    await disconnecting
    expect(fakeSockets).toHaveLength(1)
  })

  it('refuses a forced reopen issued while it owns the socket', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver['socket'])
    transport.answersClose = false

    const disconnecting = driver.disconnect()

    await expect(driver.reopenNow()).rejects.toThrow('[ddp] connection closed before it opened')
    expect(fakeSockets).toHaveLength(1)

    await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
    await disconnecting
  })

  it('echoes no connected for the close it took', async () => {
    const driver = createDriver()
    await openFakeConnection(driver['socket'])

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    await driver.disconnect()

    expect(connectedSeen).not.toHaveBeenCalled()
  })

  it('leaves the driver free to connect again once it has settled', async () => {
    const driver = createDriver()
    await openFakeConnection(driver['socket'])
    await driver.disconnect()

    const connecting = driver.connect()
    await driveToHandshake(fakeSockets[1])

    await expect(connecting).resolves.toBe(driver)
    expect(driver.connected).toBe(true)
  })
})

describe('Driver.logout', () => {
  it('forwards a logout the socket must answer, however the socket reads', async () => {
    // The socket owns the whole decision, so a close that already made the
    // socket read as disconnected cannot turn a refusal into a silent success.
    const driver = createDriver()
    const connecting = driver.connect()
    await driveToHandshake(fakeSockets[0])
    await connecting

    await driver.disconnect()
    expect(driver.connected).toBe(false)

    await expect(driver.logout())
      .rejects.toThrow('[ddp] connection closed before the response arrived')
  })
})
