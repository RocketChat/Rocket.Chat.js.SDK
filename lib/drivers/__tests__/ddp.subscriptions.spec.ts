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

  it('rejects with the bare id when unsubscribing from something not in the map', async () => {
    // Callers up the stack log `err.message`, which is undefined
    // on a string.
    const unsubscribing = socket.unsubscribe('never-subscribed')

    await expect(unsubscribing).rejects.toEqual('never-subscribed')
    await expect(unsubscribing).rejects.not.toBeInstanceOf(Error)
  })

  describe('unsubscribing from a live subscription', () => {
    it('deletes its bookkeeping before the server has acknowledged', async () => {
      // The delete happens up front, not on the reply.
      await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe('ddp-1')

      // The `unsub` frame is on the wire and unanswered, yet the map is empty.
      expect(transport.lastSent()).toEqual({ msg: 'unsub', id: 'ddp-1' })
      expect(socket.subscriptions).toEqual({})

      transport.receive({ msg: 'result', id: 'ddp-1', result: true })
      await expect(unsubscribing).resolves.toBe(true)
    })

    it('cannot resubscribe the subscription after the server refuses', async () => {
      // The consequence of the delete above, and what makes it a bug rather
      // than an ordering detail: the unsubscribe failed, so the server is still
      // streaming, but the driver no longer holds the id to resubscribe with.
      await subscribe('stream-room-messages', ['GENERAL'])

      const unsubscribing = socket.unsubscribe('ddp-1')
      transport.receive({ msg: 'nosub', id: 'ddp-1', error: { reason: 'no such subscription' } })
      await expect(unsubscribing).rejects.toEqual({ reason: 'no such subscription' })

      const framesBefore = transport.sent.length
      await socket.subscribeAll()

      expect(transport.sent).toHaveLength(framesBefore)
    })
  })
})
