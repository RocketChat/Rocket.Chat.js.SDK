import { Socket } from '../socket'
import { createSocket } from '../../../test/createSocket'
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
  let id: string

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    id = transport.lastSent().id as string
    transport.receive({ msg: 'ready', subs: [id] })
    await subscribing
  })

  it('holds a sub until the unsub before it has been answered', async () => {
    // `login` calls `subscribeAll`, and `unsubscribe` keeps its entry until the
    // DDP response arrives — so the resubscribe reaches an id that is still
    // being unsubscribed.
    const unsubscribing = socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id })

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id })

    transport.receive({ msg: 'nosub', id })
    await unsubscribing
    await flushMicrotasks()
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id })

    transport.receive({ msg: 'ready', subs: [id] })
    await resubscribing
  })

  it('settles each request on the DDP response that answers it', async () => {
    const unsubscribing = socket.unsubscribe(id).then(() => 'unsubscribed')
    await flushMicrotasks()

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()

    transport.receive({ msg: 'nosub', id })
    expect(await unsubscribing).toBe('unsubscribed')
    await flushMicrotasks()

    // Only now does the `sub` go out, so its `ready` cannot reach the `unsub`.
    transport.receive({ msg: 'ready', subs: [id] })
    await resubscribing

    expect(socket.subscriptions[id]).toMatchObject({
      id,
      name: 'stream-room-messages'
    })
  })

  it('holds an unsub until the sub before it has been answered', async () => {
    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id })

    const unsubscribing = socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id })

    transport.receive({ msg: 'ready', subs: [id] })
    await resubscribing
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id })

    transport.receive({ msg: 'nosub', id })
    await unsubscribing
    expect(socket.subscriptions[id]).toBeUndefined()
  })

  it('holds a third request behind the second rather than behind the first', async () => {
    socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()

    socket.subscribeAll().catch(() => undefined)
    socket.subscribeAll().catch(() => undefined)
    await flushMicrotasks()

    const written = transport.sent.length
    transport.receive({ msg: 'nosub', id })
    await flushMicrotasks()

    expect(transport.sent.length - written).toBe(1)
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id })
  })

  it('does not hold an id behind a request the connection left unanswered', async () => {
    socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id })

    transport.close(1006)
    const reopened = await openFakeConnection(socket)

    socket.subscribeAll().catch(() => undefined)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id })
  })

  it('releases a request queued behind one the dropped socket left unanswered', async () => {
    // The queued request would otherwise never be written and its caller would
    // never settle. `logout` waits on `unsubscribeAll`, so that is a Logout that
    // can never complete.
    socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()

    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    expect(transport.lastSent()).toEqual({ msg: 'unsub', id })

    transport.close(1006)
    const reopened = await openFakeConnection(socket)
    await flushMicrotasks()

    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id })
    reopened.receive({ msg: 'ready', subs: [id] })
    await resubscribing
  })

  it('keeps holding the id after a released request goes out on the new socket', async () => {
    socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()

    socket.subscribeAll().catch(() => undefined)
    await flushMicrotasks()

    transport.close(1006)
    const reopened = await openFakeConnection(socket)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id })

    // The released `sub` registered itself on the new socket as it went out, so
    // this waits rather than joining it there.
    socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id })
  })
})
