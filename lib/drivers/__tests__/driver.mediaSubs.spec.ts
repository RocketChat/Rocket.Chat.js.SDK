import { Driver } from '../driver'
import { createDriver } from '../../../test/createDriver'
import {
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

describe('Driver.waitForNotifyUserMediaSubs', () => {
  const userId = 'user-id'
  const topic = 'stream-notify-user'

  let driver: Driver
  let transport: FakeWebSocket

  beforeEach(async () => {
    driver = createDriver()
    transport = await openFakeConnection(driver['socket'])
    driver.userId = userId
  })

  /**
   * Register a subscription on the Socket, as a successful sub would, and
   * return the id the driver derived for it. Through the Socket, so the entry
   * has the shape the readiness poll looks for — `name` the topic, `params[0]`
   * the user event.
   */
  const addSub = async (params: any[], target: FakeWebSocket = transport) => {
    const subscribing = driver['socket'].subscribe(topic, params)
    const { id } = target.lastSent() as { id: string }
    target.receive({ msg: 'ready', subs: [id] })
    await subscribing
    return id
  }

  /** Register a media subscription on the Socket, as a successful sub would. */
  const addMediaSub = (name: string, target: FakeWebSocket = transport) =>
    addSub([`${userId}/${name}`], target)

  const addMediaSubs = async (target: FakeWebSocket = transport) => ({
    signalId: await addMediaSub('media-signal', target),
    callsId: await addMediaSub('media-calls', target)
  })

  it('resolves false without a logged-in user, before scheduling anything', async () => {
    driver.userId = ''
    const sentBefore = transport.sent.length
    // The socket's own ping timer is pending here and stays that way; what the
    // guard has to avoid is adding the poll and the deadline on top of it.
    const timersBefore = jest.getTimerCount()

    await expect(driver.waitForNotifyUserMediaSubs()).resolves.toBe(false)

    expect(transport.sent).toHaveLength(sentBefore)
    expect(jest.getTimerCount()).toBe(timersBefore)
  })

  it('resolves ready after an immediate reopen, on the socket the reopen built', async () => {
    const { signalId, callsId } = await addMediaSubs()

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
    const { signalId, callsId } = await addMediaSubs()

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
    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value }, () => { resolved = false })

    // Nothing to find yet, and one poll interval passing changes nothing.
    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    // Half of what it waits for is not enough: the poll wants both.
    const signalId = await addMediaSub('media-signal')
    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    const callsId = await addMediaSub('media-calls')
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
    const { signalId, callsId } = await addMediaSubs()

    const waiting = driver.waitForNotifyUserMediaSubs()
    transport.receive({ msg: 'nosub', id: signalId })
    transport.receive({ msg: 'nosub', id: callsId })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when only one of the two resubscribes is refused', async () => {
    const { signalId, callsId } = await addMediaSubs()

    const waiting = driver.waitForNotifyUserMediaSubs()
    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'nosub', id: callsId })

    await expect(waiting).resolves.toBe(false)
  })

  it('resolves false when a resubscribe is acked without a subscription id', async () => {
    const { signalId, callsId } = await addMediaSubs()

    const waiting = driver.waitForNotifyUserMediaSubs()
    // Answered, but carrying nothing to subscribe with: the stream is no more
    // restored than it is by a refusal.
    transport.receive({ msg: 'ready', id: signalId, subs: [] })
    transport.receive({ msg: 'ready', subs: [callsId] })

    await expect(waiting).resolves.toBe(false)
  })

  it('leaves the user\'s other streams on the same topic alone', async () => {
    await addSub([`${userId}/message`])
    const { signalId, callsId } = await addMediaSubs()

    const sentBefore = transport.sent.length
    const waiting = driver.waitForNotifyUserMediaSubs()

    const resent = transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame).id)
    expect(resent).toEqual([signalId, callsId])

    transport.receive({ msg: 'ready', subs: [signalId] })
    transport.receive({ msg: 'ready', subs: [callsId] })
    await expect(waiting).resolves.toBe(true)
  })

  it('does not count another user\'s media streams as this user\'s', async () => {
    await addSub(['other-user/media-signal'])
    await addSub(['other-user/media-calls'])

    const sentBefore = transport.sent.length
    const waiting = driver.waitForNotifyUserMediaSubs(500)

    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
    expect(transport.sent).toHaveLength(sentBefore)
  })

  it('resubscribes every entry recorded for a media stream, and needs each acked', async () => {
    const signalId = await addMediaSub('media-signal')
    // A second entry the readiness poll finds for the same media stream: same
    // event, different params, so a stream of its own. Every entry found is
    // re-sent, and one refusal is enough.
    const collectedSignalId = await addSub([`${userId}/media-signal`, false])
    const callsId = await addMediaSub('media-calls')

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
    const reopening = driver.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]

    // The gate opens before the new connection is even handshaken: nothing to
    // find yet, so it is the poll that has to carry it across the reopen.
    const waiting = driver.waitForNotifyUserMediaSubs()

    await driveToHandshake(reopened, 'reopened-session')
    await reopening

    const { signalId, callsId } = await addMediaSubs(reopened)

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
    driver = createDriver({ timeout })
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
    const waiting = driver.waitForNotifyUserMediaSubs(500)
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value }, () => { resolved = false })

    await jest.advanceTimersByTimeAsync(499)
    expect(resolved).toBeUndefined()

    await jest.advanceTimersByTimeAsync(1)
    await expect(waiting).resolves.toBe(false)
  })

  it('leaves no timer behind once it settles', async () => {
    const { signalId, callsId } = await addMediaSubs()

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
