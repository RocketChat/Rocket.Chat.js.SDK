import { DDPDriver } from './ddp'
import { silentLogger } from '../../test/silentLogger'
import {
  FakeWebSocket,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../test/fakeTransport'

// Same seam as the socket specs: the driver builds its Socket, the Socket builds
// the fake through its normal code path. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createDriver = (options: object = {}) =>
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

  it('BUG (pinned bug 8): discards the caller\'s timeout and hard-codes 10000', () => {
    const driver = createDriver({ timeout: 250 })

    expect(driver.config.timeout).toBe(10000)
    // And the knock-on, because the socket reads its ping interval from
    // `timeout` (pinned bug 3): the caller's number reaches nothing at all.
    expect(driver.ddp.config.ping).toBe(10000)
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

  it('resolves false without a logged-in user, before doing any work', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    const sentBefore = transport.sent.length

    await expect(driver.waitForNotifyUserMediaSubs()).resolves.toBe(false)
    expect(transport.sent).toHaveLength(sentBefore)
  })

  it('polls until both media subscriptions appear, then resubscribes on their own ids', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    // The field login writes. Assigning it keeps the reconnect being reproduced
    // here — subscriptions not yet restored — reachable without a login round.
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value })

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

  it('resolves false when the subscriptions never appear before the deadline', async () => {
    const driver = createDriver()
    await openFakeConnection(driver.ddp)
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value })

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
