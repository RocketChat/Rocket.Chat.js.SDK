import { Driver } from '../driver'
import { ISocketOptions } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  flushMicrotasks,
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
  new Driver({ host: 'localhost:3000', logger: createSilentLogger(), ...options })

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

describe('new Driver', () => {
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

describe('Driver.subscribe', () => {
  it('reshapes its arguments and drops the id on the way through', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)

    const subscribing = driver.subscribe('stream-notify-room', 'room-id/typing', false)

    // What the caller passed and what goes on the wire differ: the event name
    // and a wrapper object become the two params, and the caller's extra
    // arguments are buried under `args`.
    //
    // The id is dropped on the way through — the socket's `subscribe` takes one,
    // the Driver's does not and never passes it — so the frame carries a fresh
    // send-time id instead. Resubscribing through this method therefore cannot
    // reuse an existing subscription's id; `waitForNotifyUserMediaSubs` goes
    // through the Socket for exactly that reason.
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

describe('Driver.waitForNotifyUserMediaSubs', () => {
  const userId = 'user-id'
  const topic = 'stream-notify-user'

  /** Register a subscription on the Socket under a given id, as a successful sub would. */
  const addSub = async (driver: Driver, transport: FakeWebSocket, event: string, id: string) => {
    const subscribing = driver.ddp.subscribe(topic, [event], undefined, id)
    transport.receive({ msg: 'ready', subs: [id] })
    await subscribing
  }

  /** Register a media subscription on the Socket, as a successful sub would. */
  const addMediaSub = (driver: Driver, transport: FakeWebSocket, name: string) =>
    addSub(driver, transport, `${userId}/${name}`, `sub-${name}`)

  it('resolves false without a logged-in user, before scheduling anything', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    const sentBefore = transport.sent.length
    const timersBefore = jest.getTimerCount()

    await expect(driver.waitForNotifyUserMediaSubs()).resolves.toBe(false)

    expect(transport.sent).toHaveLength(sentBefore)
    expect(jest.getTimerCount()).toBe(timersBefore)
  })

  it('resolves true when both media streams are confirmed on the current generation', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addMediaSub(driver, transport, 'media-signal')

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value: boolean) => { resolved = value })

    await jest.advanceTimersByTimeAsync(1)
    expect(resolved).toBeUndefined()

    await addMediaSub(driver, transport, 'media-calls')
    await expect(waiting).resolves.toBe(true)
  })

  it('resolves false at the deadline when no entry exists', async () => {
    const driver = createDriver()
    await openFakeConnection(driver.ddp)
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs(500)
    const timersBefore = jest.getTimerCount()

    await jest.advanceTimersByTimeAsync(499)
    expect(jest.getTimerCount()).toBe(timersBefore)

    await jest.advanceTimersByTimeAsync(1)
    await expect(waiting).resolves.toBe(false)
  })

  it('waits while a subscription is still in flight', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value: boolean) => { resolved = value })

    driver.ddp.subscribe(topic, [`${userId}/media-signal`], undefined, 'sub-media-signal')
    await jest.advanceTimersByTimeAsync(1)
    expect(resolved).toBeUndefined()

    transport.receive({ msg: 'ready', subs: ['sub-media-signal'] })
    await jest.advanceTimersByTimeAsync(1)

    driver.ddp.subscribe(topic, [`${userId}/media-calls`], undefined, 'sub-media-calls')
    await jest.advanceTimersByTimeAsync(1)
    transport.receive({ msg: 'ready', subs: ['sub-media-calls'] })

    await expect(waiting).resolves.toBe(true)
  })

  it('does not count another user\'s media streams as this user\'s', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addSub(driver, transport, 'other-user/media-signal', 'sub-other-signal')
    await addSub(driver, transport, 'other-user/media-calls', 'sub-other-calls')

    const waiting = driver.waitForNotifyUserMediaSubs(500)

    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
  })

  it('leaves the user\'s other streams on the same topic alone', async () => {
    const driver = createDriver()
    const transport = await openFakeConnection(driver.ddp)
    driver.userId = userId
    await addSub(driver, transport, `${userId}/message`, 'sub-message')
    await addMediaSub(driver, transport, 'media-signal')
    await addMediaSub(driver, transport, 'media-calls')

    const waiting = driver.waitForNotifyUserMediaSubs()
    await expect(waiting).resolves.toBe(true)
  })

  describe('after a reopen', () => {
    it('resolves false at the deadline when no login re-confirms the entries', async () => {
      const driver = createDriver()
      const transport = await openFakeConnection(driver.ddp)
      driver.userId = userId
      await addMediaSub(driver, transport, 'media-signal')
      await addMediaSub(driver, transport, 'media-calls')

      const reopening = driver.reopenNow()
      const reopened = fakeSockets[fakeSockets.length - 1]
      expect(reopened).not.toBe(transport)
      await driveToHandshake(reopened, 'reopened-session')
      await reopening

      const sentBefore = reopened.sent.length
      const waiting = driver.waitForNotifyUserMediaSubs(500)
      await jest.advanceTimersByTimeAsync(500)

      expect(reopened.sent).toHaveLength(sentBefore)
      await expect(waiting).resolves.toBe(false)
    })

    it('resolves true after login re-sends and the server confirms on the new generation', async () => {
      const driver = createDriver()
      const transport = await openFakeConnection(driver.ddp)
      driver.userId = userId
      await addMediaSub(driver, transport, 'media-signal')
      await addMediaSub(driver, transport, 'media-calls')

      const reopening = driver.reopenNow()
      const reopened = fakeSockets[fakeSockets.length - 1]
      expect(reopened).not.toBe(transport)
      await driveToHandshake(reopened, 'reopened-session')
      await reopening

      const waiting = driver.waitForNotifyUserMediaSubs()
      const framesBefore = reopened.sent.length
      const loggingIn = driver.ddp.login({ token: 'resume-token' } as any)
      await flushMicrotasks()

      const loginFrame = reopened.sent[framesBefore]
      expect(JSON.parse(loginFrame)).toMatchObject({ msg: 'method', method: 'login' })

      reopened.receive({
        msg: 'result',
        id: JSON.parse(loginFrame).id,
        result: { id: userId, token: 'resume-token' }
      })
      await loggingIn
      await flushMicrotasks()

      const resent = reopened.sent.slice(framesBefore + 1).map((frame) => JSON.parse(frame))
      expect(resent).toEqual([
        { msg: 'sub', id: 'sub-media-signal', name: topic, params: [`${userId}/media-signal`] },
        { msg: 'sub', id: 'sub-media-calls', name: topic, params: [`${userId}/media-calls`] }
      ])

      reopened.receive({ msg: 'ready', subs: ['sub-media-signal'] })
      reopened.receive({ msg: 'ready', subs: ['sub-media-calls'] })
      await expect(waiting).resolves.toBe(true)
    })
  })

  it('takes its deadline from the configured timeout when given none', async () => {
    const timeout = 4000
    const driver = createDriver({ timeout })
    await openFakeConnection(driver.ddp)
    driver.userId = userId

    const waiting = driver.waitForNotifyUserMediaSubs()
    let resolved: boolean | undefined
    waiting.then((value: boolean) => { resolved = value })

    await jest.advanceTimersByTimeAsync(timeout - 1)
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

    const timersBefore = jest.getTimerCount()

    const waiting = driver.waitForNotifyUserMediaSubs()
    await expect(waiting).resolves.toBe(true)

    expect(jest.getTimerCount()).toBe(timersBefore)
  })
})

describe('Driver.connect', () => {
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

  it('rejects the connect whose socket was replaced mid-open', async () => {
    const driver = createDriver()

    const replaced = driver.connect()
    const replacing = driver.connect()

    await expect(replaced).rejects.toThrow('[ddp] connection closed before it opened')

    await driveToHandshake(fakeSockets[1])
    await replacing
  })

  const failConnects = async (driver: Driver, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const socketsBeforeAttempt = fakeSockets.length
      const failing = driver.connect()
      fakeSockets[socketsBeforeAttempt].onerror?.(new Error('no route to host'))
      await expect(failing).rejects.toThrow('no route to host')
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
