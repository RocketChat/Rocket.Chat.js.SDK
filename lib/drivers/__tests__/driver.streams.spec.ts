import { Driver } from '../driver'
import { createDriver } from '../../../test/createDriver'
import {
  answerLastMethodCall,
  driveToHandshake,
  errorLastMethodCall,
  FakeWebSocket,
  fakeSockets,
  flushMicrotasks,
  openFakeConnection,
  subFrames,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

let driver: Driver
let transport: FakeWebSocket

const connectDriver = async () => {
  driver = createDriver()
  transport = await openFakeConnection(driver['socket'])
}

const wrapped = (event: string, ...args: any[]) =>
  [event, { useCollection: false, args }]

const ackSubsSentSince = async (transport: FakeWebSocket, sentBefore: number) => {
  await flushMicrotasks()
  const frames = subFrames(transport.sent.slice(sentBefore))
  frames.forEach(({ id }) => transport.receive({ msg: 'ready', subs: [id] }))
  return frames
}

/**
 * Accepted gap, on the record rather than silently skipped: the fixed event lists
 * `subscribeNotifyAll`, `subscribeLoggedNotify` and `subscribeNotifyUser` send are
 * data, not behaviour. A test over them is a snapshot that goes red on every
 * intentional product change, so the reshaping they all funnel through is pinned
 * once, below, instead.
 */

describe('Driver.subscribeRaw', () => {
  beforeEach(connectDriver)

  it('sends the params it was given without wrapping them', async () => {

    const subscribing = driver.subscribeRaw('stream-notify-user', ['user-id/message', false])
    const { id } = transport.lastSent() as { id: string }

    expect(transport.lastSent()).toEqual({
      msg: 'sub',
      id,
      name: 'stream-notify-user',
      params: ['user-id/message', false]
    })

    transport.receive({ msg: 'ready', subs: [id] })
    await expect(subscribing).resolves.toMatchObject({ id, params: ['user-id/message', false] })
  })

  it('answers a repeated subscribe for the same stream with the record already on the wire', async () => {
    const sentBefore = transport.sent.length

    const subscribing = driver.subscribeRaw('stream-notify-user', ['user-id/message', false])
    const { id } = transport.lastSent() as { id: string }
    transport.receive({ msg: 'ready', subs: [id] })
    const subscription = await subscribing

    const shared = await driver.subscribeRaw('stream-notify-user', ['user-id/message', false])

    expect(shared).toBe(subscription)
    expect(subFrames(transport.sent.slice(sentBefore))).toHaveLength(1)
  })
})

describe('Driver.subscribeNotifyUser', () => {
  beforeEach(connectDriver)

  it('leaves the prefix empty when no login has set a user id', async () => {
    const sentBefore = transport.sent.length

    const subscribing = driver.subscribeNotifyUser()
    const frames = await ackSubsSentSince(transport, sentBefore)

    expect(frames[0].params).toEqual(wrapped('/message', false))

    await expect(subscribing).resolves.toHaveLength(frames.length)
  })
})

describe('Driver.subscribeRoom', () => {
  beforeEach(connectDriver)

  it('subscribes to the room messages and the room typing and delete streams', async () => {
    const sentBefore = transport.sent.length

    const subscribing = driver.subscribeRoom('room-id', false)
    const frames = await ackSubsSentSince(transport, sentBefore)

    expect(frames.map(({ name, params }) => ({ name, params }))).toEqual([
      { name: 'stream-room-messages', params: wrapped('room-id', false) },
      { name: 'stream-notify-room', params: wrapped('room-id/typing', false) },
      { name: 'stream-notify-room', params: wrapped('room-id/deleteMessage', false) }
    ])

    await expect(subscribing).resolves.toHaveLength(3)
  })
})

describe('Driver.unsubscribe', () => {
  beforeEach(connectDriver)

  it('unsubscribes the id carried by the subscription it was handed', async () => {

    const subscribing = driver.subscribe('stream-notify-room', 'room-id/typing', false)
    const { id } = transport.lastSent() as { id: string }
    transport.receive({ msg: 'ready', subs: [id] })
    const subscription = await subscribing

    const unsubscribing = driver.unsubscribe(subscription!)
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id })

    transport.receive({ msg: 'nosub', id })
    await unsubscribing

    expect(Object.keys(driver['socket'].subscriptions)).toEqual([])
  })

  it('rejects an id it has already unsubscribed, naming that id', async () => {

    const subscribing = driver.subscribe('stream-notify-room', 'room-id/typing', false)
    const { id } = transport.lastSent() as { id: string }
    transport.receive({ msg: 'ready', subs: [id] })
    const subscription = await subscribing

    const unsubscribing = driver.unsubscribe(subscription!)
    await flushMicrotasks()
    transport.receive({ msg: 'nosub', id })
    await unsubscribing

    await expect(driver.unsubscribe(subscription!))
      .rejects.toThrow(`[ddp] No subscription to unsubscribe from: ${id}`)
  })
})

describe('Driver.unsubscribeAll', () => {
  beforeEach(connectDriver)

  it('unsubscribes every recorded subscription', async () => {

    const subscribedBefore = transport.sent.length
    const subscribing = driver.subscribeRoom('room-id', false)
    const subscribed = await ackSubsSentSince(transport, subscribedBefore)
    await subscribing

    const sentBefore = transport.sent.length
    const unsubscribing = driver.unsubscribeAll()
    await flushMicrotasks()

    const unsubFrames = transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame))
    expect(unsubFrames.map(({ msg, id }) => ({ msg, id })))
      .toEqual(subscribed.map(({ id }) => ({ msg: 'unsub', id })))

    unsubFrames.forEach(({ id }) => transport.receive({ msg: 'nosub', id }))
    await expect(unsubscribing).resolves.toBeUndefined()
    expect(Object.keys(driver['socket'].subscriptions)).toEqual([])
  })
})

describe('Driver.onStreamData', () => {
  beforeEach(connectDriver)

  it('calls back on every frame the socket emits for the event, until stopped', async () => {

    const received = jest.fn()
    const { stop } = await driver.onStreamData('stream-notify-logged', received)

    transport.receive({ msg: 'changed', collection: 'stream-notify-logged', fields: { args: ['first'] } })
    expect(received).toHaveBeenCalledTimes(1)
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ fields: { args: ['first'] } }))

    stop()
    transport.receive({ msg: 'changed', collection: 'stream-notify-logged', fields: { args: ['second'] } })

    expect(received).toHaveBeenCalledTimes(1)
  })

  it('keeps another listener on the event when one caller stops twice', async () => {

    const stopped = jest.fn()
    const kept = jest.fn()
    const { stop } = await driver.onStreamData('stream-notify-logged', stopped)
    await driver.onStreamData('stream-notify-logged', kept)

    stop()
    stop()
    transport.receive({ msg: 'changed', collection: 'stream-notify-logged', fields: { args: ['after'] } })

    expect(stopped).not.toHaveBeenCalled()
    expect(kept).toHaveBeenCalledTimes(1)
  })
})

describe('Driver.removeAllListeners', () => {
  beforeEach(connectDriver)

  it('stops the connected echo and leaves a stream-data callback receiving', async () => {
    const connectedSeen = jest.fn()
    const streamSeen = jest.fn()
    driver.on('connected', connectedSeen)
    const { stop } = await driver.onStreamData('stream-notify-logged', streamSeen)

    expect(driver.removeAllListeners()).toContain(connectedSeen)

    const reopening = driver.reopenNow()
    await driveToHandshake(fakeSockets[1])
    await reopening
    fakeSockets[1].receive({
      msg: 'changed',
      collection: 'stream-notify-logged',
      fields: { args: ['after'] }
    })

    expect(connectedSeen).not.toHaveBeenCalled()
    expect(streamSeen).toHaveBeenCalledTimes(1)

    stop()
    fakeSockets[1].receive({
      msg: 'changed',
      collection: 'stream-notify-logged',
      fields: { args: ['later'] }
    })

    expect(streamSeen).toHaveBeenCalledTimes(1)
  })
})

describe('Driver.onMessage', () => {
  beforeEach(connectDriver)

  it('calls back with the first arg of a room message, its timestamp parsed', async () => {

    const received = jest.fn()
    driver.onMessage(received)

    const ts = Date.parse('2026-08-31T12:00:00.000Z')
    transport.receive({
      msg: 'changed',
      collection: 'stream-room-messages',
      fields: { args: [{ _id: 'message-id', ts: { $date: ts } }] }
    })

    expect(received).toHaveBeenCalledWith({ _id: 'message-id', ts: new Date(ts) })
  })
})

describe('Driver.onTyping', () => {
  beforeEach(connectDriver)

  it('calls back with the username and the typing flag from the room notification', async () => {

    const received = jest.fn()
    driver.onTyping(received)

    transport.receive({
      msg: 'changed',
      collection: 'stream-notify-room',
      fields: { args: ['username', true] }
    })

    expect(received).toHaveBeenCalledWith('username', true)
  })
})

describe('Driver.notifyVisitorTyping', () => {
  beforeEach(connectDriver)

  it('calls the room typing stream with the visitor token', async () => {

    const notifying = driver.notifyVisitorTyping('room-id', 'visitor', true, 'visitor-token')
    const { id } = transport.lastSent() as { id: string }

    expect(transport.lastSent()).toEqual({
      msg: 'method',
      id,
      method: 'stream-notify-room',
      params: ['room-id/typing', 'visitor', true, { token: 'visitor-token' }]
    })

    answerLastMethodCall(transport, 'ok')
    await expect(notifying).resolves.toBe('ok')
  })
})

describe('Driver.ejsonMessage', () => {
  it('replaces an EJSON date with a Date', () => {
    const ts = Date.parse('2026-08-31T12:00:00.000Z')

    expect(createDriver().ejsonMessage({ _id: 'message-id', ts: { $date: ts } }))
      .toEqual({ _id: 'message-id', ts: new Date(ts) })
  })

  it('leaves a message carrying no timestamp alone', () => {
    expect(createDriver().ejsonMessage({ _id: 'message-id' })).toEqual({ _id: 'message-id' })
  })
})

describe('Driver.methodCall', () => {
  beforeEach(connectDriver)

  it('calls the method with the arguments it was given and resolves with the result', async () => {

    const calling = driver.methodCall('getUsersOfRoom', 'room-id', true)
    const { id } = transport.lastSent() as { id: string }

    expect(transport.lastSent()).toEqual({
      msg: 'method',
      id,
      method: 'getUsersOfRoom',
      params: ['room-id', true]
    })

    answerLastMethodCall(transport, { records: [] })
    await expect(calling).resolves.toEqual({ records: [] })
  })

  it('rejects with the error the server answered', async () => {

    const calling = driver.methodCall('getUsersOfRoom', 'room-id')
    errorLastMethodCall(transport, { error: 400, message: 'bad request' })

    await expect(calling).rejects.toThrow('bad request')
  })
})

describe('Driver.probe', () => {
  it('resolves true when the server pongs within the deadline', async () => {
    await connectDriver()

    const probing = driver.probe(500)
    expect(transport.lastSent()).toEqual({ msg: 'ping' })

    transport.receive({ msg: 'pong' })
    await expect(probing).resolves.toBe(true)
  })
})

describe('Driver.lastPing', () => {
  beforeEach(connectDriver)

  it('reports the time of the last frame the socket saw', async () => {

    await jest.advanceTimersByTimeAsync(5000)
    transport.receive({ msg: 'pong' })

    expect(driver.lastPing).toBe(Date.now())
  })
})
