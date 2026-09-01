import { Socket } from '../socket'
import { createSocket } from '../../../test/createSocket'
import {
  FakeWebSocket,
  flushMicrotasks,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

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

    socket.unsubscribe(id).catch(() => undefined)
    await flushMicrotasks()
    expect(reopened.lastSent()).toMatchObject({ msg: 'sub', id })
  })
})
