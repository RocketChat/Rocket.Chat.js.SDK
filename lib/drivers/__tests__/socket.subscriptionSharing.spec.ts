import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  FakeWebSocket,
  flushMicrotasks,
  fakeSockets,
  driveToHandshake,
  openFakeConnection,
  subFrames,
  subscribeAndAck,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createSocket = () => new Socket({ host: 'localhost:3000', logger: createSilentLogger() })

/**
 * One stream is one DDP subscription id, so a second `subscribe` for a stream
 * already recorded shares it. What the id is derived from belongs to ADR-0011;
 * this file is about what sharing does to the wire, the registry and the
 * callbacks.
 */
describe('Socket subscription sharing', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
  })

  const subscribe = (name: string, params: any[], callback?: any) =>
    subscribeAndAck(socket, transport, name, params, callback)

  it('puts one sub frame on the wire for two concurrent subscribes to one stream', async () => {
    const first = socket.subscribe('stream-room-messages', ['GENERAL'])
    const second = socket.subscribe('stream-room-messages', ['GENERAL'])

    const framesBefore = subFrames(transport.sent)
    expect(framesBefore).toHaveLength(1)

    transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })
    await Promise.all([first, second])

    expect(subFrames(transport.sent)).toEqual(framesBefore)
    expect(Object.keys(socket.subscriptions)).toHaveLength(1)
  })

  it('hands the second caller the subscription, not undefined', async () => {
    const first = socket.subscribe('stream-room-messages', ['GENERAL'])
    const second = socket.subscribe('stream-room-messages', ['GENERAL'])
    transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })

    const [firstSub, secondSub] = await Promise.all([first, second])

    expect(secondSub).toBe(firstSub)
    expect(secondSub).toMatchObject({ name: 'stream-room-messages', params: ['GENERAL'] })
  })

  it('fires each caller\'s callback exactly once per event', async () => {
    const first = jest.fn()
    const second = jest.fn()

    await subscribe('stream-room-messages', ['GENERAL'], first)
    await subscribe('stream-room-messages', ['GENERAL'], second)

    transport.receive({ msg: 'changed', collection: 'stream-room-messages', fields: { args: [] } })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('records the subscription before the queue slot releases', async () => {
    // A second subscribe released into a gap between the server's `ready` and
    // the write would find nothing and send a second `sub` under an id already
    // in use — worse than the duplicate this fix removes.
    const first = socket.subscribe('stream-room-messages', ['GENERAL'])
    transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })

    const second = socket.subscribe('stream-room-messages', ['GENERAL'])
    await Promise.all([first, second])

    expect(subFrames(transport.sent)).toHaveLength(1)
    expect(Object.keys(socket.subscriptions)).toHaveLength(1)
  })

  it('rejects the second holder\'s unsubscribe once the first has ended the stream', async () => {
    const subscription = await subscribe('stream-room-messages', ['GENERAL'])
    await subscribe('stream-room-messages', ['GENERAL'])

    const unsubscribing = subscription!.unsubscribe()
    transport.receive({ msg: 'result', id: transport.lastSent().id, result: true })
    await unsubscribing

    await expect(subscription!.unsubscribe()).rejects.toThrow('No subscription to unsubscribe from')
  })

  it('sends a fresh sub after an unsubscribe for the same stream', async () => {
    const subscription = await subscribe('stream-room-messages', ['GENERAL'])

    const unsubscribing = subscription!.unsubscribe()
    transport.receive({ msg: 'result', id: transport.lastSent().id, result: true })
    await unsubscribing

    const framesBefore = subFrames(transport.sent).length
    await subscribe('stream-room-messages', ['GENERAL'])

    expect(subFrames(transport.sent)).toHaveLength(framesBefore + 1)
    expect(Object.keys(socket.subscriptions)).toHaveLength(1)
  })

  it('re-sends a recorded stream on subscribeAll rather than sharing it', async () => {
    await subscribe('stream-room-messages', ['GENERAL'])

    const framesBefore = subFrames(transport.sent).length
    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()

    expect(subFrames(transport.sent)).toHaveLength(framesBefore + 1)

    transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })
    await resubscribing
  })

  it('re-sends a recorded stream on resubscribeWhenRecorded rather than sharing it', async () => {
    await subscribe('stream-notify-user', ['uid/media-signal'])

    const framesBefore = subFrames(transport.sent).length
    const waiting = socket.resubscribeWhenRecorded([
      { name: 'stream-notify-user', params: ['uid/media-signal'] }
    ])
    await flushMicrotasks()

    expect(subFrames(transport.sent)).toHaveLength(framesBefore + 1)

    transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })
    await expect(waiting).resolves.toBe(true)
  })

  it('resolves false while a user subscribe for the same stream is still unanswered', async () => {
    // Nothing is recorded until the server acks, so the resubscribe never gets
    // to start and its deadline settles it while the `sub` is still pending.
    socket.subscribe('stream-notify-user', ['uid/media-signal'])
    const id = transport.lastSent().id

    const waiting = socket.resubscribeWhenRecorded([
      { name: 'stream-notify-user', params: ['uid/media-signal'] }
    ], 500)

    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
    expect(socket.subscriptions).toEqual({})

    transport.receive({ msg: 'ready', subs: [id] })
  })

  it('resolves false when another request on the same id holds the queue past its deadline', async () => {
    const subscription = await subscribe('stream-notify-user', ['uid/media-signal'])

    // The `unsub` is on the wire and unanswered, so it still holds the id's
    // queue and the entry it will remove is still there for the poll to find.
    subscription!.unsubscribe()
    const framesBefore = subFrames(transport.sent).length

    const waiting = socket.resubscribeWhenRecorded([
      { name: 'stream-notify-user', params: ['uid/media-signal'] }
    ], 500)

    await jest.advanceTimersByTimeAsync(500)

    await expect(waiting).resolves.toBe(false)
    expect(subFrames(transport.sent)).toHaveLength(framesBefore)
  })

  it('leaves one record after a reconnect resubscribes and the caller subscribes again', async () => {
    await subscribe('stream-room-messages', ['GENERAL'])

    socket.reopenNow()
    const reopened = fakeSockets[1]
    await driveToHandshake(reopened)

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(subFrames(reopened.sent)).toHaveLength(1)
    reopened.receive({ msg: 'ready', subs: [reopened.lastSent().id] })
    await resubscribing

    await socket.subscribe('stream-room-messages', ['GENERAL'])

    expect(subFrames(reopened.sent)).toHaveLength(1)
    expect(Object.keys(socket.subscriptions)).toHaveLength(1)
  })

  it('leaves one record when the abandoned catch path writes the entry', async () => {
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    const id = transport.lastSent().id

    socket.reopenNow()
    await subscribing

    expect(Object.keys(socket.subscriptions)).toEqual([id])
  })
})
