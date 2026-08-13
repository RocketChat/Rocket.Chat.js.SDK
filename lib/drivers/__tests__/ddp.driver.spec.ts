import { DDPDriver } from '../ddp'
import { ISocketOptions } from '../../../interfaces'
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

// Same seam as the socket specs: the driver builds its Socket, the Socket builds
// the fake through its normal code path. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

// Typed rather than `object`: the option names have to typecheck, or the pin on
// the discarded timeout would go green against a typo.
const createDriver = (options: ISocketOptions = {}) =>
  new DDPDriver({ host: 'localhost:3000', logger: silentLogger, ...options })

/**
 * Accepted gaps, on the record rather than silently skipped:
 *
 * - The fixed topic and event lists (`subscribeNotifyAll`, `subscribeLoggedNotify`,
 *   `subscribeNotifyUser`, `subscribeRoom`) are data, not behaviour. A test over
 *   them is a snapshot that goes red on every intentional product change, so the
 *   reshaping they all funnel through is pinned once, below, instead.
 * - The one-line pass-throughs (`disconnect`, `checkAndReopen`, `reopenNow`,
 *   `probe`, `lastPing`, `pingInterval`, `subscribeRaw`, `unsubscribe`,
 *   `unsubscribeAll`, `methodCall`, `logout`) forward their arguments to the
 *   socket and nothing else. They carry no logic, so a test over them asserts
 *   that a line of code exists.
 */

describe('new DDPDriver', () => {
  it('strips the protocol from the host it was given', () => {
    const driver = createDriver({ host: 'https://open.rocket.chat' })

    expect(driver.config.host).toBe('open.rocket.chat')
    expect(driver.ddp.host).toBe('ws://open.rocket.chat/websocket')
  })

  it('leaves a host that carries no protocol alone', () => {
    expect(createDriver().config.host).toBe('localhost:3000')
  })

  it('keeps the caller\'s timeout, and the socket pings on it', () => {
    const driver = createDriver({ timeout: 250 })

    expect(driver.config.timeout).toBe(250)
    expect(driver.ddp.config.ping).toBe(250)
  })

  it('defaults the timeout to 10000 when the caller gives none', () => {
    expect(createDriver().config.timeout).toBe(10000)
  })
})

describe('DDPDriver.subscribe', () => {
  it('reshapes its arguments and drops the id on the way through', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)

    const subscribing = driver.subscribe('stream-notify-room', 'room-id/typing', false)

    // What the caller passed and what goes on the wire differ: the event name
    // and a wrapper object become the two params, and the caller's extra
    // arguments are buried under `args`.
    //
    // The id is dropped on the way through — the socket's `subscribe` takes one,
    // the driver's does not and never passes it — so the frame carries a fresh
    // send-time id instead. Resubscribing through this method therefore cannot
    // reuse an existing subscription's id; `waitForNotifyUserMediaSubs` goes
    // through the raw socket for exactly that reason.
    expect(transport.lastSent()).toEqual({
      msg: 'sub',
      id: 'ddp-1',
      name: 'stream-notify-room',
      params: ['room-id/typing', { useCollection: false, args: [false] }]
    })

    transport.receive({ msg: 'ready', subs: ['ddp-1'] })

    // And the subscription is filed under that send-time id, holding the
    // reshaped params rather than the ones the caller passed.
    await expect(subscribing).resolves.toMatchObject({
      id: 'ddp-1',
      name: 'stream-notify-room',
      params: ['room-id/typing', { useCollection: false, args: [false] }]
    })
    expect(Object.keys(driver.ddp.subscriptions)).toEqual(['ddp-1'])
  })
})

describe('DDPDriver.waitForNotifyUserMediaSubs', () => {
  const userId = 'user-id'
  const topic = 'stream-notify-user'

  /** Register a media subscription on the socket, as a successful sub would. */
  const addMediaSub = async (driver: DDPDriver, transport: FakeWebSocket, name: string) => {
    const id = `sub-${name}`
    // Through the raw socket, with an explicit id: this is the shape the
    // readiness poll looks for — `name` the topic, `params[0]` the user event.
    const subscribing = driver.ddp.subscribe(topic, [`${userId}/${name}`], undefined, id)
    transport.receive({ msg: 'ready', subs: [id] })
    await subscribing
  }

  it('resolves false without a logged-in user, before scheduling anything', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
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
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

    // A real reopen: a second transport is constructed and handshaken, and the
    // subscription map survives it — which is what makes the resubscribe below
    // reuse the ids rather than mint new ones.
    const reopening = driver.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]
    expect(reopened).not.toBe(transport)
    reopened.readyState = OPEN
    reopened.onopen?.({})
    await jest.advanceTimersByTimeAsync(0)
    reopened.receive({ msg: 'connected', session: 'reopened-session' })
    await reopening

    const waiting = driver.waitForNotifyUserMediaSubs()
    // The resubscribes go out on the new socket, not the dead one.
    expect(reopened.sent.map((frame) => JSON.parse(frame).id))
      .toEqual(expect.arrayContaining(['sub-media-signal', 'sub-media-calls']))
    reopened.receive({ msg: 'ready', subs: ['sub-media-signal'] })
    reopened.receive({ msg: 'ready', subs: ['sub-media-calls'] })

    await expect(waiting).resolves.toBe(true)
  })

  it('does not resubscribe again while a resubscribe is still in flight', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

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
    transport.receive({ msg: 'ready', subs: ['sub-media-signal'] })
    transport.receive({ msg: 'ready', subs: ['sub-media-calls'] })
    await expect(waiting).resolves.toBe(true)
  })

  it('polls until both media subscriptions appear, then resubscribes on their own ids', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
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
    await addMediaSub(driver, transport, 'media-signal')
    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    await addMediaSub(driver, transport, 'media-calls')
    const sentBefore = transport.sent.length
    await jest.advanceTimersByTimeAsync(100)

    // Both resubscribes go out on the existing ids, so the server treats them as
    // the same subscriptions rather than minting new ones.
    const resent = transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame))
    expect(resent).toEqual([
      { msg: 'sub', id: 'sub-media-signal', name: topic, params: [`${userId}/media-signal`] },
      { msg: 'sub', id: 'sub-media-calls', name: topic, params: [`${userId}/media-calls`] }
    ])

    // Still pending until the server acks both: readiness is the ack, not the send.
    expect(resolved).toBeUndefined()
    transport.receive({ msg: 'ready', subs: ['sub-media-signal'] })
    transport.receive({ msg: 'ready', subs: ['sub-media-calls'] })

    await expect(waiting).resolves.toBe(true)
  })

  it('resolves false when the server refuses both resubscribes', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    transport.receive({ msg: 'nosub', id: 'sub-media-signal' })
    transport.receive({ msg: 'nosub', id: 'sub-media-calls' })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when only one of the two resubscribes is refused', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    transport.receive({ msg: 'ready', subs: ['sub-media-signal'] })
    transport.receive({ msg: 'nosub', id: 'sub-media-calls' })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when a resubscribe is acked without a subscription id', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    // Answered, but carrying nothing to subscribe with: the stream is no more
    // restored than it is by a refusal.
    transport.receive({ msg: 'ready', id: 'sub-media-signal', subs: [] })
    transport.receive({ msg: 'ready', subs: ['sub-media-calls'] })

    await expect(waiting).resolves.toBe(false)
  })

  it('takes its deadline from the configured timeout when given none', async () => {
    const timeout = 4000
    const driver = createDriver({ timeout })
    await openFakeConnection(driver.ddp)
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
    await openFakeConnection(driver.ddp)
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
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

    // The socket's own ping timer is already pending and stays that way; only
    // what the wait itself scheduled has to be gone by the end.
    const timersBefore = jest.getTimerCount()

    const waiting = driver.waitForNotifyUserMediaSubs()
    // The first attempt runs synchronously, so both resubscribes are already out.
    transport.receive({ msg: 'ready', subs: ['sub-media-signal'] })
    transport.receive({ msg: 'ready', subs: ['sub-media-calls'] })
    await expect(waiting).resolves.toBe(true)

    // Both the poll interval and the deadline are cleared: a leaked interval
    // would keep resubscribing for the life of the process.
    expect(jest.getTimerCount()).toBe(timersBefore)
  })
})

describe('DDPDriver.connect', () => {
  it('keeps echoing open after a send has waited on it', async () => {
    // The driver holds a long-lived `open` listener that echoes the socket's
    // open as its own `connected`. A send that waits on open registers a `once`
    // beside it, and removing that `once` once it has fired used to take the
    // echo down with it — leaving the driver permanently silent about every
    // later Reopen.
    const driver = createDriver()
    const connecting = driver.connect()
    const transport = fakeSockets[0]

    await driveToHandshake(transport)
    await connecting

    const connectedSeen = jest.fn()
    driver.on('connected', connectedSeen)

    transport.readyState = CLOSED
    const sending = driver.ddp.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })

    await driveToHandshake(transport)
    await jest.advanceTimersByTimeAsync(0)
    transport.receive({ msg: 'result', id: 'ddp-2', result: 'ok' })
    await expect(sending).resolves.toMatchObject({ result: 'ok' })

    // The reopen the send rode in on is one echo; the next open has to produce
    // another, which is what the dropped listener made impossible.
    expect(connectedSeen).toHaveBeenCalledTimes(1)

    await driveToHandshake(transport)
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

  it('takes its connected listener back down when the open fails', async () => {
    const driver = createDriver()
    const connecting = driver.connect()
    const transport = fakeSockets[0]

    transport.onerror?.(new Error('no route to host'))
    await expect(connecting).rejects.toThrow('no route to host')

    // A rejected connect settles on the error, so the listener it left behind
    // could never resolve anything — it only accumulates, one per failed call.
    expect(driver.removeAllListeners('connected')).toHaveLength(0)
  })
})
