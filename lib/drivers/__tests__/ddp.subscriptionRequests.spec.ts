import { Socket } from '../index'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  FakeWebSocket,
  flushMicrotasks,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

/**
 * A `sub` and an `unsub` for one DDP subscription carry the same id, and `send`
 * matches a DDP response to its request by id alone. Two of them in flight at
 * once therefore leave one DDP response settling both sends. This file is about
 * keeping one request per id on the wire; what the subscription map holds
 * afterwards belongs to ddp.subscriptions.spec.ts.
 */
describe('one sub or unsub in flight per DDP subscription', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = new Socket({ host: 'localhost:3000', logger: createSilentLogger() })
    transport = await openFakeConnection(socket)
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })
    await subscribing
  })

  it('holds a sub until the unsub before it has been answered', async () => {
    // `login` calls `subscribeAll`, and `unsubscribe` keeps its entry until the
    // DDP response arrives — so the resubscribe reaches an id that is still
    // being unsubscribed.
    const unsubscribing = socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })

    transport.receive({ msg: 'nosub', id: 'ddp-1' })
    await unsubscribing
    await flushMicrotasks()
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })

    transport.receive({ msg: 'ready', subs: ['ddp-1'] })
    await resubscribing
  })

  it('settles each request on the DDP response that answers it', async () => {
    const unsubscribing = socket.unsubscribe('ddp-1').then(() => 'unsubscribed')
    await flushMicrotasks()

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()

    transport.receive({ msg: 'nosub', id: 'ddp-1' })
    expect(await unsubscribing).toBe('unsubscribed')
    await flushMicrotasks()

    // Only now does the `sub` go out, so its `ready` cannot reach the `unsub`.
    transport.receive({ msg: 'ready', subs: ['ddp-1'] })
    await resubscribing

    expect(socket.subscriptions['ddp-1']).toMatchObject({
      id: 'ddp-1',
      name: 'stream-room-messages'
    })
  })

  it('holds an unsub until the sub before it has been answered', async () => {
    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })

    const unsubscribing = socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })

    transport.receive({ msg: 'ready', subs: ['ddp-1'] })
    await resubscribing
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })

    transport.receive({ msg: 'nosub', id: 'ddp-1' })
    await unsubscribing
    expect(socket.subscriptions['ddp-1']).toBeUndefined()
  })

  it('holds a third request behind the second rather than behind the first', async () => {
    socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()

    socket.subscribeAll().catch(() => undefined)
    socket.subscribeAll().catch(() => undefined)
    await flushMicrotasks()

    const written = transport.sent.length
    transport.receive({ msg: 'nosub', id: 'ddp-1' })
    await flushMicrotasks()

    expect(transport.sent.length - written).toBe(1)
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })
  })

  it('does not hold an id behind a request the connection left unanswered', async () => {
    socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })

    transport.close(1006)
    const reopened = await openFakeConnection(socket)

    socket.subscribeAll().catch(() => undefined)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })
  })

  it('releases a request queued behind one the dropped socket left unanswered', async () => {
    // The queued request would otherwise never be written and its caller would
    // never settle. `logout` waits on `unsubscribeAll`, so that is a Logout that
    // can never complete.
    socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })

    transport.close(1006)
    const reopened = await openFakeConnection(socket)
    await flushMicrotasks()

    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })
    reopened.receive({ msg: 'ready', subs: ['ddp-1'] })
    await resubscribing
  })

  it('keeps holding the id after a released request goes out on the new socket', async () => {
    socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()

    socket.subscribeAll().catch(() => undefined)
    await flushMicrotasks()

    transport.close(1006)
    const reopened = await openFakeConnection(socket)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })

    // The released `sub` registered itself on the new socket as it went out, so
    // this waits rather than joining it there.
    socket.unsubscribe('ddp-1').catch(() => undefined)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })
  })

  it('leaves a subscription with no id in flight unqueued', async () => {
    // A first-time `subscribe` has no id to collide on, and `send` writes its
    // frame synchronously — the queue must not delay it by a microtask.
    socket.subscribe('stream-notify-user', ['alice/message'])

    expect(transport.lastSent()).toMatchObject({
      msg: 'sub',
      name: 'stream-notify-user'
    })
  })
})
