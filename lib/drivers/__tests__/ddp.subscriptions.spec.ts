import { Socket } from '../index'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  FakeWebSocket,
  flushMicrotasks,
  fakeSockets,
  driveToHandshake,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createSocket = () => new Socket({ host: 'localhost:3000', logger: createSilentLogger() })

/**
 * What the subscription map holds, and when. The send plumbing underneath —
 * request ids, reply matching, failed replies — belongs to ddp.send.spec.ts;
 * this file is only about the bookkeeping either side of it.
 */
describe('Socket subscription bookkeeping', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
  })

  /**
   * The server's `ready` carries the subscription id in `subs[0]`, and the
   * driver re-emits it under that id — so acknowledging a subscription means
   * naming the id it was created with.
   */
  const subscribe = async (name: string, params: any[]) => {
    const subscribing = socket.subscribe(name, params)
    const { id } = transport.lastSent()
    transport.receive({ msg: 'ready', subs: [id] })
    return subscribing
  }

  it('keys a subscription by the id the server acknowledged', async () => {
    await subscribe('stream-room-messages', ['GENERAL'])

    expect(Object.keys(socket.subscriptions)).toEqual(['ddp-1'])
    expect(socket.subscriptions['ddp-1']).toMatchObject({
      id: 'ddp-1',
      name: 'stream-room-messages',
      params: ['GENERAL']
    })
  })

  it('resubscribes everything under the existing id rather than minting a new one', async () => {
    // The resume path after a reconnect: `login` calls `subscribeAll`, which
    // must re-establish the *same* subscription, not a second one alongside it.
    await subscribe('stream-room-messages', ['GENERAL'])

    const resubscribing = socket.subscribeAll()

    expect(transport.lastSent()).toEqual({
      msg: 'sub',
      id: 'ddp-1',
      name: 'stream-room-messages',
      params: ['GENERAL']
    })

    transport.receive({ msg: 'ready', subs: ['ddp-1'] })
    await resubscribing

    // One entry, still under the original id — a minted id would leave two.
    expect(Object.keys(socket.subscriptions)).toEqual(['ddp-1'])
  })

  it('holds nothing for a subscription the server refused', async () => {
    // `send` used to file every `sub` frame under its send-time id, so a refused
    // subscription left an entry nobody owned: never acknowledged, never
    // unsubscribed, and resubscribed by `subscribeAll` forever.
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    transport.receive({ msg: 'nosub', id: 'ddp-1', error: { reason: 'no such stream' } })

    await expect(subscribing).resolves.toBeUndefined()
    expect(socket.subscriptions).toEqual({})

    const framesBefore = transport.sent.length
    await socket.subscribeAll()
    expect(transport.sent).toHaveLength(framesBefore)
  })

  it('holds nothing while a subscription is still in flight', async () => {
    // The other half of the same change: the map is written on the server's
    // acknowledgement, so an unanswered `sub` is not in it yet.
    socket.subscribe('stream-room-messages', ['GENERAL'])

    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })
    expect(socket.subscriptions).toEqual({})

    transport.receive({ msg: 'ready', subs: ['ddp-1'] })
  })

  describe('finding a subscription by name and params', () => {
    it('matches on the stream name and the params given', async () => {
      await subscribe('stream-notify-user', ['uid/media-signal', false])
      await subscribe('stream-notify-user', ['uid/media-calls', false])
      await subscribe('stream-room-messages', ['GENERAL'])

      expect(socket.findSubscriptions({ name: 'stream-notify-user', params: ['uid/media-signal'] }))
        .toMatchObject([{ id: 'ddp-1', params: ['uid/media-signal', false] }])
      expect(socket.findSubscriptions({ name: 'stream-notify-user' })).toHaveLength(2)
      expect(socket.findSubscriptions({ name: 'stream-notify-user', params: ['uid/media-video'] })).toEqual([])
      expect(socket.findSubscriptions({ name: 'stream-room-messages' })).toHaveLength(1)
    })

    it('finds nothing while the subscription is still in flight', () => {
      socket.subscribe('stream-notify-user', ['uid/media-signal', false])

      expect(socket.findSubscriptions({ name: 'stream-notify-user' })).toEqual([])

      transport.receive({ msg: 'ready', subs: ['ddp-1'] })
    })
  })

  describe('a subscription a reopen abandoned', () => {
    it('is kept under the id it was sent with', async () => {
      // The `sub` reached the wire and the server never answered it, so the
      // server may have acted on it. Forgetting it here left the stream with no
      // name: nothing to unsubscribe with, and nothing for `subscribeAll` to
      // re-establish at the next login.
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })

      socket.reopenNow()
      await expect(subscribing).resolves.toBeUndefined()

      expect(Object.keys(socket.subscriptions)).toEqual(['ddp-1'])
      expect(socket.subscriptions['ddp-1']).toMatchObject({
        id: 'ddp-1',
        name: 'stream-room-messages',
        params: ['GENERAL']
      })
    })

    it('is re-established under that same id at the next login', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      socket.reopenNow()
      await subscribing

      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)

      const framesBefore = reopened.sent.length
      socket.subscribeAll()
      await flushMicrotasks()

      expect(reopened.sent.slice(framesBefore).map((frame) => JSON.parse(frame))).toEqual([{
        msg: 'sub',
        id: 'ddp-1',
        name: 'stream-room-messages',
        params: ['GENERAL']
      }])
    })

    it('can be unsubscribed from, unlike one that was never written', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      socket.reopenNow()
      await subscribing

      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)

      // Nothing to await: the point is that the `unsub` goes out at all. Without
      // the entry, `unsubscribe` rejects up front and never reaches the wire.
      const unsubscribing = socket.unsubscribe('ddp-1').catch((err) => err)
      await flushMicrotasks()

      expect(reopened.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })

      reopened.receive({ msg: 'result', id: 'ddp-1', result: true })
      await unsubscribing
    })
  })

  it('keeps a subscription the socket closed under, on the same rule as a reopen', async () => {
    // A close and a forced reopen are the same loss: the frame went out and the
    // answer can never arrive. Both must leave the entry behind.
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    expect(transport.lastSent()).toMatchObject({ msg: 'sub', id: 'ddp-1' })

    transport.close()
    await expect(subscribing).resolves.toBeUndefined()

    expect(socket.subscriptions['ddp-1']).toMatchObject({
      id: 'ddp-1',
      name: 'stream-room-messages',
      params: ['GENERAL']
    })
  })

  describe('a subscription that never reached the wire', () => {
    // Three ways a `sub` fails without the server seeing it. None can leave a
    // stream behind, so none may leave an entry — only a connection that ends
    // *after* the frame went out does.

    it('holds nothing when the transport failed to write it', async () => {
      transport.sendError = new Error('socket closed under the write')

      await expect(socket.subscribe('stream-room-messages', ['GENERAL'])).resolves.toBeUndefined()

      expect(socket.subscriptions).toEqual({})
    })

    it('holds nothing when the send expired waiting for the connection', async () => {
      // Not connected and never opening: the send never gets to compose a frame.
      transport.readyState = CLOSED

      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      await jest.advanceTimersByTimeAsync(socket.config.reopen * 2 + 1)

      await expect(subscribing).resolves.toBeUndefined()
      expect(socket.subscriptions).toEqual({})
    })

    it('holds nothing when the socket was never opened', async () => {
      const unopened = createSocket()

      await expect(unopened.subscribe('stream-room-messages', ['GENERAL'])).resolves.toBeUndefined()

      expect(unopened.subscriptions).toEqual({})
    })
  })

  it('rejects with an Error naming the id when unsubscribing from something not in the map', async () => {
    // Callers up the stack log `err.message`, so the rejection has to be an
    // Error that says which subscription was missing.
    const unsubscribing = socket.unsubscribe('never-subscribed')

    await expect(unsubscribing).rejects.toBeInstanceOf(Error)
    await expect(unsubscribing).rejects.toThrow('never-subscribed')
  })

  describe('unsubscribing from a live subscription', () => {
    it('keeps its bookkeeping until the server acknowledges', async () => {
      await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe('ddp-1')

      // The `unsub` DDP message is on the wire and unanswered, so the
      // subscription is still the driver's to name.
      expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })
      expect(Object.keys(socket.subscriptions)).toEqual(['ddp-1'])

      transport.receive({ msg: 'result', id: 'ddp-1', result: true })
      await expect(unsubscribing).resolves.toBe(true)

      // Acknowledged — now it is gone.
      expect(socket.subscriptions).toEqual({})
    })

    it('forgets the subscription when the server answers with a DDP error', async () => {
      // A `nosub` carrying a DDP error is the server saying it does not have
      // this subscription. Keeping the entry would have `subscribeAll` re-ask
      // for a stream nobody wants, on every login, for the life of the socket.
      await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe('ddp-1')
      transport.receive({ msg: 'nosub', id: 'ddp-1', error: { reason: 'no such subscription' } })
      await expect(unsubscribing).rejects.toThrow('no such subscription')
      await expect(unsubscribing).rejects.toMatchObject({ reason: 'no such subscription' })

      expect(socket.subscriptions).toEqual({})

      await socket.subscribeAll()

      expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })
    })

    it('keeps the subscription when the rejection is the SDK\'s own', async () => {
      // No DDP response arrived, so the server may well still be streaming: the
      // driver must still hold the id to resubscribe with.
      await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe('ddp-1')
      socket.reopenNow()
      await expect(unsubscribing).rejects.toThrow('[ddp] connection reopened before the response arrived')

      expect(Object.keys(socket.subscriptions)).toEqual(['ddp-1'])
    })
  })

  describe('unsubscribing from all', () => {
    it('resolves even when the server refuses one of them', async () => {
      // `unsubscribeAll` does not wipe the collection: each unsubscribe decides
      // its own entry. It is a best-effort cleanup, so one refusal does not fail
      // the whole call — and a refusal the server sent forgets its entry too.
      await subscribe('stream-room-messages', ['GENERAL'])
      await subscribe('stream-notify-user', ['alice/message'])

      const unsubscribingAll = socket.unsubscribeAll()

      transport.receive({ msg: 'result', id: 'ddp-1', result: true })
      transport.receive({ msg: 'nosub', id: 'ddp-2', error: { reason: 'no such subscription' } })
      await unsubscribingAll

      expect(socket.subscriptions).toEqual({})
    })

    it('leaves behind the ones the SDK rejected itself', async () => {
      // Nothing reached the server, so both streams may still be running.
      await subscribe('stream-room-messages', ['GENERAL'])
      await subscribe('stream-notify-user', ['alice/message'])

      const unsubscribingAll = socket.unsubscribeAll()
      socket.reopenNow()
      await unsubscribingAll

      expect(Object.keys(socket.subscriptions)).toEqual(['ddp-1', 'ddp-2'])
    })

    it('still logs out when the server refuses an unsubscribe', async () => {
      // `logout` unsubscribes first and then calls the method. A refusal that
      // failed the whole cleanup would strand the user logged in on the server.
      await subscribe('stream-room-messages', ['GENERAL'])

      // The handler goes on immediately: a driver that fails the cleanup rejects
      // here, and an unobserved rejection takes the run down rather than failing
      // this test.
      const loggingOut = socket.logout().catch((err) => err)

      transport.receive({ msg: 'nosub', id: 'ddp-1', error: { reason: 'no such subscription' } })
      await flushMicrotasks()

      const loggingOutFrame = transport.lastSent()
      expect(loggingOutFrame).toMatchObject({ msg: 'method', method: 'logout' })

      transport.receive({ msg: 'result', id: loggingOutFrame.id, result: true })
      await expect(loggingOut).resolves.toBe(true)
    })
  })

  describe('closing the connection', () => {
    it('clears every subscription even though no response can arrive', async () => {
      // `close` sends the `unsub` messages without awaiting them and then tears
      // the connection down, so `unsubscribe` never gets its acknowledgement and
      // never removes its own entry. The map is cleared by `close` itself.
      await subscribe('stream-room-messages', ['GENERAL'])
      await subscribe('stream-notify-user', ['alice/message'])

      await socket.close()

      expect(Object.keys(socket.subscriptions)).toEqual([])
    })
  })
})
