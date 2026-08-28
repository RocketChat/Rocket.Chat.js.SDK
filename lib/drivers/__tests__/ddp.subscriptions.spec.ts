import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  CLOSED,
  FakeWebSocket,
  flushMicrotasks,
  fakeSockets,
  driveToHandshake,
  lastSubId,
  openFakeConnection,
  subscribeAndAck,
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

  const subscribe = async (name: string, params: any[]) =>
    (await subscribeAndAck(socket, transport, name, params))!.id

  it('keys a subscription by the id the server acknowledged', async () => {
    const id = await subscribe('stream-room-messages', ['GENERAL'])

    expect(Object.keys(socket.subscriptions)).toEqual([id])
    expect(socket.subscriptions[id]).toMatchObject({
      id,
      name: 'stream-room-messages',
      params: ['GENERAL']
    })
  })

  it('resubscribes everything under the existing id rather than minting a new one', async () => {
    // The resume path after a reconnect: `login` calls `subscribeAll`, which
    // must re-establish the *same* subscription, not a second one alongside it.
    const id = await subscribe('stream-room-messages', ['GENERAL'])

    const resubscribing = socket.subscribeAll()

    expect(transport.lastSent()).toEqual({
      msg: 'sub',
      id,
      name: 'stream-room-messages',
      params: ['GENERAL']
    })

    transport.receive({ msg: 'ready', subs: [id] })
    await resubscribing

    // One entry, still under the original id — a minted id would leave two.
    expect(Object.keys(socket.subscriptions)).toEqual([id])
  })

  it('holds nothing for a subscription the server refused', async () => {
    // `send` used to file every `sub` frame under its send-time id, so a refused
    // subscription left an entry nobody owned: never acknowledged, never
    // unsubscribed, and resubscribed by `subscribeAll` forever.
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    transport.receive({ msg: 'nosub', id: transport.lastSent().id, error: { reason: 'no such stream' } })

    await expect(subscribing).resolves.toBeUndefined()
    expect(socket.subscriptions).toEqual({})

    const framesBefore = transport.sent.length
    await socket.subscribeAll()
    expect(transport.sent).toHaveLength(framesBefore)
  })

  describe('a resubscribe under an existing id', () => {
    it('forgets the entry, so it is not re-requested at the next login', async () => {
      const id = await subscribe('stream-room-messages', ['GENERAL'])

      const resubscribing = socket.subscribeAll()
      transport.receive({ msg: 'nosub', id, error: { reason: 'no such stream' } })
      await resubscribing

      expect(socket.subscriptions).toEqual({})

      const framesBefore = transport.sent.length
      await socket.subscribeAll()
      expect(transport.sent).toHaveLength(framesBefore)
    })

    it('keeps the entry when a reopen abandons the wait, since the server may still be streaming', async () => {
      const id = await subscribe('stream-room-messages', ['GENERAL'])

      const resubscribing = socket.subscribeAll()
      socket.reopenNow()
      await resubscribing

      expect(Object.keys(socket.subscriptions)).toEqual([id])
    })
  })

  it('holds nothing while a subscription is still in flight', async () => {
    // The other half of the same change: the map is written on the server's
    // acknowledgement, so an unanswered `sub` is not in it yet.
    socket.subscribe('stream-room-messages', ['GENERAL'])

    const id = lastSubId(transport)
    expect(socket.subscriptions).toEqual({})

    transport.receive({ msg: 'ready', subs: [id] })
  })

  describe('finding a subscription by name and params', () => {
    it('matches on the stream name and the params given', async () => {
      const signalId = await subscribe('stream-notify-user', ['uid/media-signal', false])
      await subscribe('stream-notify-user', ['uid/media-calls', false])
      await subscribe('stream-room-messages', ['GENERAL'])

      expect(socket.findSubscriptions({ name: 'stream-notify-user', params: ['uid/media-signal'] }))
        .toMatchObject([{ id: signalId, params: ['uid/media-signal', false] }])
      expect(socket.findSubscriptions({ name: 'stream-notify-user' })).toHaveLength(2)
      expect(socket.findSubscriptions({ name: 'stream-notify-user', params: ['uid/media-video'] })).toEqual([])
      expect(socket.findSubscriptions({ name: 'stream-room-messages' })).toHaveLength(1)
    })

    it('finds nothing while the subscription is still in flight', () => {
      socket.subscribe('stream-notify-user', ['uid/media-signal', false])

      expect(socket.findSubscriptions({ name: 'stream-notify-user' })).toEqual([])

      transport.receive({ msg: 'ready', subs: [transport.lastSent().id] })
    })
  })

  describe('resubscribing once the streams asked for are present', () => {
    const streams = [
      { name: 'stream-notify-user', params: ['uid/media-signal'] },
      { name: 'stream-notify-user', params: ['uid/media-calls'] }
    ]

    it('waits for every stream, then re-sends each under its own id', async () => {
      const signalId = await subscribe('stream-notify-user', ['uid/media-signal'])

      const waiting = socket.resubscribeWhenRecorded(streams)
      let resolved: boolean | undefined
      waiting.then((value) => { resolved = value })

      // One of the two is not enough to start.
      await jest.advanceTimersByTimeAsync(100)
      expect(resolved).toBeUndefined()

      const callsId = await subscribe('stream-notify-user', ['uid/media-calls'])
      const sentBefore = transport.sent.length
      await jest.advanceTimersByTimeAsync(100)

      expect(transport.sent.slice(sentBefore).map((frame) => JSON.parse(frame))).toEqual([
        { msg: 'sub', id: signalId, name: 'stream-notify-user', params: ['uid/media-signal'] },
        { msg: 'sub', id: callsId, name: 'stream-notify-user', params: ['uid/media-calls'] }
      ])

      // Readiness is the server's ack, not the send.
      expect(resolved).toBeUndefined()
      transport.receive({ msg: 'ready', subs: [signalId] })
      transport.receive({ msg: 'ready', subs: [callsId] })

      await expect(waiting).resolves.toBe(true)
    })

    it('resolves false on its deadline, and stops polling', async () => {
      const waiting = socket.resubscribeWhenRecorded(streams, 500)
      const timersBefore = jest.getTimerCount()

      await jest.advanceTimersByTimeAsync(500)

      await expect(waiting).resolves.toBe(false)
      // Both the deadline and the poll interval are gone — a leaked interval
      // would keep resubscribing for the life of the process.
      expect(jest.getTimerCount()).toBe(timersBefore - 2)
    })

    it('takes its deadline from the configured timeout when given none', async () => {
      const waiting = socket.resubscribeWhenRecorded(streams)
      let resolved: boolean | undefined
      waiting.then((value) => { resolved = value })

      await jest.advanceTimersByTimeAsync(socket.config.timeout - 1)
      expect(resolved).toBeUndefined()

      await jest.advanceTimersByTimeAsync(1)
      await expect(waiting).resolves.toBe(false)
    })

    it('resolves true when a reopen abandons the resubscribes, since each one is recorded', async () => {
      await subscribe('stream-notify-user', ['uid/media-signal'])
      await subscribe('stream-notify-user', ['uid/media-calls'])

      const waiting = socket.resubscribeWhenRecorded(streams)
      await jest.advanceTimersByTimeAsync(100)

      socket.reopenNow()

      await expect(waiting).resolves.toBe(true)
    })

    it('resolves false when the server refuses one of the resubscribes', async () => {
      const signalId = await subscribe('stream-notify-user', ['uid/media-signal'])
      const callsId = await subscribe('stream-notify-user', ['uid/media-calls'])

      const waiting = socket.resubscribeWhenRecorded(streams)
      transport.receive({ msg: 'ready', subs: [signalId] })
      transport.receive({ msg: 'nosub', id: callsId })

      await expect(waiting).resolves.toBe(false)
    })
  })

  describe('a subscription a reopen abandoned', () => {
    it('is kept under the id it was sent with', async () => {
      // The `sub` reached the wire and the server never answered it, so the
      // server may have acted on it. Forgetting it here left the stream with no
      // name: nothing to unsubscribe with, and nothing for `subscribeAll` to
      // re-establish at the next login.
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      const id = lastSubId(transport)

      socket.reopenNow()
      expect(await subscribing).toBe(socket.subscriptions[id])

      expect(Object.keys(socket.subscriptions)).toEqual([id])
      expect(socket.subscriptions[id]).toMatchObject({
        id,
        name: 'stream-room-messages',
        params: ['GENERAL']
      })
    })

    it('is re-established under that same id at the next login', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      const { id } = transport.lastSent()
      socket.reopenNow()
      await subscribing

      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)

      const framesBefore = reopened.sent.length
      socket.subscribeAll()
      await flushMicrotasks()

      expect(reopened.sent.slice(framesBefore).map((frame) => JSON.parse(frame))).toEqual([{
        msg: 'sub',
        id,
        name: 'stream-room-messages',
        params: ['GENERAL']
      }])
    })

    it('can be unsubscribed from, unlike one that was never written', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      const { id } = transport.lastSent() as { id: string }
      socket.reopenNow()
      await subscribing

      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)

      // Nothing to await: the point is that the `unsub` goes out at all. Without
      // the entry, `unsubscribe` rejects up front and never reaches the wire.
      const unsubscribing = socket.unsubscribe(id).catch((err) => err)
      await flushMicrotasks()

      expect(reopened.lastSent()).toEqual({ msg: 'unsub', id })

      reopened.receive({ msg: 'result', id, result: true })
      await unsubscribing
    })
  })

  it('keeps a subscription the socket closed under, on the same rule as a reopen', async () => {
    // A close and a forced reopen are the same loss: the frame went out and the
    // answer can never arrive. Both must leave the entry behind.
    const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
    const id = lastSubId(transport)

    transport.close()
    expect(await subscribing).toBe(socket.subscriptions[id])

    expect(socket.subscriptions[id]).toMatchObject({
      id,
      name: 'stream-room-messages',
      params: ['GENERAL']
    })
  })

  describe('a subscription the server never answered', () => {
    it('is kept under the id it was sent with when the deadline expires', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      const id = lastSubId(transport)

      await jest.advanceTimersByTimeAsync(socket.config.timeout)
      expect(await subscribing).toBe(socket.subscriptions[id])

      expect(socket.subscriptions[id]).toMatchObject({
        id,
        name: 'stream-room-messages',
        params: ['GENERAL']
      })
    })
  })

  describe('the handle the caller is given', () => {
    const subscribeAbandoned = async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      const id = lastSubId(transport)
      socket.reopenNow()
      return { id, subscription: await subscribing }
    }

    it('tears the abandoned entry down through the handle alone', async () => {
      const { id, subscription } = await subscribeAbandoned()

      const reopened = fakeSockets[1]
      await driveToHandshake(reopened)

      const unsubscribing = subscription!.unsubscribe()
      await flushMicrotasks()
      expect(reopened.lastSent()).toEqual({ msg: 'unsub', id })

      reopened.receive({ msg: 'result', id, result: true })
      await unsubscribing

      expect(socket.subscriptions).toEqual({})
    })

    it('is the entry the server acknowledged with a ready', async () => {
      const acked = await subscribeAndAck(socket, transport, 'stream-room-messages', ['GENERAL'])

      expect(acked).toBe(socket.subscriptions[acked!.id])
    })

    it('is withheld when a success response names no subs', async () => {
      const subscribing = socket.subscribe('stream-notify-user', ['id/message'])
      const id = lastSubId(transport)

      transport.receive({ msg: 'result', id, result: true })

      await expect(subscribing).resolves.toBeUndefined()
      expect(socket.subscriptions[id]).toBeUndefined()
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
      const id = await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe(id)

      // The `unsub` DDP message is on the wire and unanswered, so the
      // subscription is still the driver's to name.
      expect(transport.lastSent()).toEqual({ msg: 'unsub', id })
      expect(Object.keys(socket.subscriptions)).toEqual([id])

      transport.receive({ msg: 'result', id, result: true })
      await expect(unsubscribing).resolves.toBe(true)

      // Acknowledged — now it is gone.
      expect(socket.subscriptions).toEqual({})
    })

    it('forgets the subscription when the server answers with a DDP error', async () => {
      // A `nosub` carrying a DDP error is the server saying it does not have
      // this subscription. Keeping the entry would have `subscribeAll` re-ask
      // for a stream nobody wants, on every login, for the life of the socket.
      const id = await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe(id)
      transport.receive({ msg: 'nosub', id, error: { reason: 'no such subscription' } })
      await expect(unsubscribing).rejects.toThrow('no such subscription')
      await expect(unsubscribing).rejects.toMatchObject({ reason: 'no such subscription' })

      expect(socket.subscriptions).toEqual({})

      await socket.subscribeAll()

      expect(transport.lastSent()).toEqual({ msg: 'unsub', id })
    })

    it('keeps the subscription when the rejection is the SDK\'s own', async () => {
      // No DDP response arrived, so the server may well still be streaming: the
      // driver must still hold the id to resubscribe with.
      const id = await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe(id)
      socket.reopenNow()
      await expect(unsubscribing).rejects.toThrow('[ddp] connection reopened before the response arrived')

      expect(Object.keys(socket.subscriptions)).toEqual([id])
    })
  })

  describe('unsubscribing from all', () => {
    it('resolves even when the server refuses one of them', async () => {
      // `unsubscribeAll` does not wipe the collection: each unsubscribe decides
      // its own entry. It is a best-effort cleanup, so one refusal does not fail
      // the whole call — and a refusal the server sent forgets its entry too.
      const messagesId = await subscribe('stream-room-messages', ['GENERAL'])
      const notifyId = await subscribe('stream-notify-user', ['alice/message'])

      const unsubscribingAll = socket.unsubscribeAll()

      transport.receive({ msg: 'result', id: messagesId, result: true })
      transport.receive({ msg: 'nosub', id: notifyId, error: { reason: 'no such subscription' } })
      await unsubscribingAll

      expect(socket.subscriptions).toEqual({})
    })

    it('leaves behind the ones the SDK rejected itself', async () => {
      // Nothing reached the server, so both streams may still be running.
      const messagesId = await subscribe('stream-room-messages', ['GENERAL'])
      const notifyId = await subscribe('stream-notify-user', ['alice/message'])

      const unsubscribingAll = socket.unsubscribeAll()
      socket.reopenNow()
      await unsubscribingAll

      expect(Object.keys(socket.subscriptions)).toEqual([messagesId, notifyId])
    })

    it('still logs out when the server refuses an unsubscribe', async () => {
      // `logout` unsubscribes first and then calls the method. A refusal that
      // failed the whole cleanup would strand the user logged in on the server.
      const id = await subscribe('stream-room-messages', ['GENERAL'])

      // The handler goes on immediately: a driver that fails the cleanup rejects
      // here, and an unobserved rejection takes the run down rather than failing
      // this test.
      const loggingOut = socket.logout().catch((err) => err)

      transport.receive({ msg: 'nosub', id, error: { reason: 'no such subscription' } })
      await flushMicrotasks()

      const loggingOutFrame = transport.lastSent()
      expect(loggingOutFrame).toMatchObject({ msg: 'method', method: 'logout' })

      transport.receive({ msg: 'result', id: loggingOutFrame.id, result: true })
      await expect(loggingOut).resolves.toBe(true)
    })
  })

  describe('closing the connection', () => {
    it('hands back no subscription for a `sub` it abandoned, and records none', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])
      const id = lastSubId(transport)

      await socket.close()

      await expect(subscribing).resolves.toBeUndefined()
      expect(socket.subscriptions[id]).toBeUndefined()
    })

    it('forgets every subscription locally without sending an unsubscribe', async () => {
      await subscribe('stream-room-messages', ['GENERAL'])
      await subscribe('stream-notify-user', ['alice/message'])

      await socket.close()

      expect(Object.keys(socket.subscriptions)).toEqual([])
    })
  })
})
