import { Socket } from '../ddp'
import { silentLogger } from '../../../test/silentLogger'
import {
  FakeWebSocket,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const createSocket = () => new Socket({ host: 'localhost:3000', logger: silentLogger })

/**
 * Timers are faked, so there is no macrotask to await: settling a chain that
 * hops several promises before its next frame goes out means turning the
 * microtask queue over by hand.
 */
const flushMicrotasks = async () => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
}

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
