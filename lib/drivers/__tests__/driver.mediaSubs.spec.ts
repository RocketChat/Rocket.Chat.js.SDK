import { Driver } from '../driver'
import { createConnectedDriver, createDriver } from '../../../test/createDriver'
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
    ({ driver, transport } = await createConnectedDriver())
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

  it('resolves false with no transport attached, though both streams are recorded', async () => {
    driver = createDriver()
    driver.userId = userId
    await driver['socket'].subscribe(topic, [`${userId}/media-signal`])
    await driver['socket'].subscribe(topic, [`${userId}/media-calls`])
    const transportsBefore = fakeSockets.length

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
    expect(fakeSockets).toHaveLength(transportsBefore)
  })

  it('sends no sub message while the transport it recorded on is gone', async () => {
    await addMediaSubs()
    const sentBefore = transport.sent.length

    transport.close(1006)

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
    expect(transport.sent).toHaveLength(sentBefore)
  })

  it('resolves true at once, sending no sub, when both media subs were acked on the attached transport', async () => {
    await addMediaSubs()
    const sentBefore = transport.sent.length

    await expect(driver.waitForNotifyUserMediaSubs()).resolves.toBe(true)

    expect(transport.sent).toHaveLength(sentBefore)
  })

  it('after a reopen, waits for the resubscribe acked on the new transport and sends nothing itself', async () => {
    const { signalId, callsId } = await addMediaSubs()

    const reopening = driver.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]
    expect(reopened).not.toBe(transport)
    await driveToHandshake(reopened, 'reopened-session')
    await reopening

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value })
    await jest.advanceTimersByTimeAsync(1000)
    expect(resolved).toBeUndefined()
    expect(reopened.sent.filter((frame) => JSON.parse(frame).msg === 'sub')).toHaveLength(0)

    const resubscribing = driver['socket'].subscribeAll()
    reopened.receive({ msg: 'ready', subs: [signalId] })
    reopened.receive({ msg: 'ready', subs: [callsId] })
    await resubscribing
    await jest.advanceTimersByTimeAsync(100)

    await expect(waiting).resolves.toBe(true)
  })

  it('polls until both media subscriptions are acked', async () => {
    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value) => { resolved = value }, () => { resolved = false })

    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    await addMediaSub('media-signal')
    await jest.advanceTimersByTimeAsync(100)
    expect(resolved).toBeUndefined()

    await addMediaSub('media-calls')
    await jest.advanceTimersByTimeAsync(100)

    await expect(waiting).resolves.toBe(true)
  })

  it('leaves the user\'s other streams on the same topic alone', async () => {
    await addSub([`${userId}/message`])
    await addMediaSubs()
    const sentBefore = transport.sent.length

    await expect(driver.waitForNotifyUserMediaSubs()).resolves.toBe(true)

    expect(transport.sent).toHaveLength(sentBefore)
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

  it('needs every entry recorded for a media stream acked', async () => {
    await addMediaSubs()
    const unanswered = driver['socket'].subscribe(topic, [`${userId}/media-signal`, false])
    await jest.advanceTimersByTimeAsync(driver['socket'].config.timeout)
    await unanswered

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
  })

  it('counts a ready that lands on the attached transport after its sub ran out its deadline', async () => {
    await addMediaSub('media-calls')
    const expiring = driver['socket'].subscribe(topic, [`${userId}/media-signal`])
    const { id: signalId } = transport.lastSent() as { id: string }
    await jest.advanceTimersByTimeAsync(driver['socket'].config.timeout)
    await expiring

    transport.receive({ msg: 'ready', subs: [signalId] })

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    await jest.advanceTimersByTimeAsync(500)
    await expect(waiting).resolves.toBe(true)
  })

  it('resolves ready when the streams only land on the socket a reopen is still building', async () => {
    const reopening = driver.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]

    const waiting = driver.waitForNotifyUserMediaSubs()

    await driveToHandshake(reopened, 'reopened-session')
    await reopening

    await addMediaSubs(reopened)
    const sentBefore = reopened.sent.length
    await jest.advanceTimersByTimeAsync(100)

    await expect(waiting).resolves.toBe(true)
    expect(reopened.sent).toHaveLength(sentBefore)
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
    const timersBefore = jest.getTimerCount()

    const waiting = driver.waitForNotifyUserMediaSubs()
    await addMediaSubs()
    await jest.advanceTimersByTimeAsync(100)
    await expect(waiting).resolves.toBe(true)

    expect(jest.getTimerCount()).toBe(timersBefore)
  })
})
