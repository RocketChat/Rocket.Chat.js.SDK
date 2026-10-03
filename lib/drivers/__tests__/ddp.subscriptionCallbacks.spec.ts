import { Socket } from '../socket'
import { createSocket } from '../../../test/createSocket'
import {
  FakeWebSocket,
  driveToHandshake,
  fakeSockets,
  flushMicrotasks,
  openFakeConnection,
  subFrames,
  subscribeAndAck,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const stream = 'stream-room-messages'
const params = ['GENERAL']

const changed = (transport: FakeWebSocket, collection = stream) =>
  transport.receive({ msg: 'changed', collection, fields: { eventName: 'GENERAL', args: [] } })

const listenersOn = (socket: Socket, name = stream): Function[] =>
  (socket as any)._listeners[name] || []

describe('Socket subscription callbacks', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket()
    transport = await openFakeConnection(socket)
  })

  const subscribe = (callback?: any, name = stream, streamParams: any[] = params) =>
    subscribeAndAck(socket, transport, name, streamParams, callback)

  const unsubscribe = async (subscription: { id: string, unsubscribe: () => Promise<any> }) => {
    const unsubscribing = subscription.unsubscribe()
    transport.receive({ msg: 'result', id: subscription.id, result: true })
    return unsubscribing
  }

  const reopenAndResubscribe = async () => {
    const reopening = socket.reopenNow()
    const reopened = fakeSockets[fakeSockets.length - 1]
    await driveToHandshake(reopened)
    await reopening
    const resubscribing = socket.subscribeAll()
    await flushMicrotasks()
    subFrames(reopened.sent).forEach(({ id }) => reopened.receive({ msg: 'ready', subs: [id] }))
    await resubscribing
    return reopened
  }

  describe('the entry', () => {
    it('carries the callback its subscriber passed', async () => {
      const callback = jest.fn()

      const subscription = await subscribe(callback)

      expect(subscription!.callbacks).toEqual([callback])
      expect(socket.subscriptions[subscription!.id].callbacks).toEqual([callback])
    })

    it('carries no callback for a subscriber that passed none', async () => {
      const subscription = await subscribe()

      expect(subscription!.callbacks).toEqual([])
    })

    it('carries every holder\'s callback on the one shared entry, in arrival order', async () => {
      const first = jest.fn()
      const second = jest.fn()

      const subscription = await subscribe(first)
      await subscribe(second)

      expect(Object.keys(socket.subscriptions)).toHaveLength(1)
      expect(subscription!.callbacks).toEqual([first, second])
    })

    it('carries a callback added later through the handle', async () => {
      const first = jest.fn()
      const later = jest.fn()
      const subscription = await subscribe(first)

      subscription!.onEvent(later)
      changed(transport)

      expect(subscription!.callbacks).toEqual([first, later])
      expect(first).toHaveBeenCalledTimes(1)
      expect(later).toHaveBeenCalledTimes(1)
    })

    it('keeps the callbacks off the wire when the stream is sent again', async () => {
      await subscribe(jest.fn())

      const resubscribing = socket.subscribeAll()
      await flushMicrotasks()

      const sent = transport.sent[transport.sent.length - 1]
      expect(JSON.parse(sent)).toMatchObject({ msg: 'sub', name: stream, params })
      expect(sent).not.toContain('callbacks')
      expect(sent).not.toContain('null')

      transport.receive({ msg: 'ready', subs: [JSON.parse(sent).id] })
      await resubscribing
    })
  })

  describe('a reopen', () => {
    it('keeps delivering to each holder exactly once per frame', async () => {
      const first = jest.fn()
      const second = jest.fn()
      await subscribe(first)
      await subscribe(second)

      const reopened = await reopenAndResubscribe()
      changed(reopened)

      expect(first).toHaveBeenCalledTimes(1)
      expect(second).toHaveBeenCalledTimes(1)
    })

    it('hands the callbacks to the entry that re-establishes the stream', async () => {
      const first = jest.fn()
      const second = jest.fn()
      const subscription = await subscribe(first)
      await subscribe(second)

      await reopenAndResubscribe()

      expect(socket.subscriptions[subscription!.id].callbacks).toEqual([first, second])
    })

    it('can still be ended, so nothing leaks from a stream that was re-established', async () => {
      const first = jest.fn()
      const second = jest.fn()
      const subscription = await subscribe(first)
      await subscribe(second)
      const reopened = await reopenAndResubscribe()

      const unsubscribing = subscription!.unsubscribe()
      reopened.receive({ msg: 'result', id: subscription!.id, result: true })
      await unsubscribing
      changed(reopened)

      expect(first).not.toHaveBeenCalled()
      expect(second).not.toHaveBeenCalled()
      expect(listenersOn(socket)).toEqual([])
    })

    it('does not stack a listener on every subscribeAll', async () => {
      const callback = jest.fn()
      await subscribe(callback)

      await reopenAndResubscribe()
      const reopened = await reopenAndResubscribe()
      changed(reopened)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(listenersOn(socket)).toEqual([callback])
    })

    it('reaches the live entry from a handle taken before the reopen', async () => {
      const subscription = await subscribe(jest.fn())
      const late = jest.fn()

      const reopened = await reopenAndResubscribe()
      subscription!.onEvent(late)
      changed(reopened)

      expect(socket.subscriptions[subscription!.id].callbacks).toContain(late)
      expect(late).toHaveBeenCalledTimes(1)
    })

    it('keeps delivering to a callback of a subscribe made before any transport was attached', async () => {
      const callback = jest.fn()
      const unopened = createSocket()
      await unopened.subscribe(stream, params, callback)

      const replacement = await openFakeConnection(unopened)
      const resubscribing = unopened.subscribeAll()
      await flushMicrotasks()
      subFrames(replacement.sent).forEach(({ id }) => replacement.receive({ msg: 'ready', subs: [id] }))
      await resubscribing
      changed(replacement)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(listenersOn(unopened)).toEqual([callback])
    })
  })

  describe('ending the subscription', () => {
    it('stops delivering to every holder', async () => {
      const leaver = jest.fn()
      const other = jest.fn()
      const subscription = await subscribe(leaver)
      await subscribe(other)

      changed(transport)
      await unsubscribe(subscription!)
      changed(transport)

      expect(leaver).toHaveBeenCalledTimes(1)
      expect(other).toHaveBeenCalledTimes(1)
    })

    it('leaves no listener behind after one cycle', async () => {
      const before = listenersOn(socket).length

      const subscription = await subscribe(jest.fn())
      await unsubscribe(subscription!)

      expect(listenersOn(socket)).toHaveLength(before)
    })

    it('does not grow the listeners across repeated cycles', async () => {
      const before = listenersOn(socket).length

      for (let cycle = 0; cycle < 25; cycle += 1) {
        const subscription = await subscribe(jest.fn())
        await unsubscribe(subscription!)
      }

      expect(listenersOn(socket)).toHaveLength(before)
      expect(Object.keys(socket.subscriptions)).toEqual([])
    })

    it('empties the handle\'s own list', async () => {
      const subscription = await subscribe(jest.fn())

      await unsubscribe(subscription!)

      expect(subscription!.callbacks).toEqual([])
    })

    it('leaves a listener that is not the subscription\'s receiving', async () => {
      const streamData = jest.fn()
      socket.on(stream, streamData)
      const subscription = await subscribe(jest.fn())

      await unsubscribe(subscription!)
      changed(transport)

      expect(streamData).toHaveBeenCalledTimes(1)
      expect(listenersOn(socket)).toEqual([streamData])
    })

    it('leaves another stream on the same name receiving', async () => {
      const ended = jest.fn()
      const kept = jest.fn()
      const endedSubscription = await subscribe(ended, stream, ['GENERAL'])
      await subscribe(kept, stream, ['RANDOM'])

      await unsubscribe(endedSubscription!)
      changed(transport)

      expect(ended).not.toHaveBeenCalled()
      expect(kept).toHaveBeenCalledTimes(1)
    })

    it('leaves a stream on another name receiving', async () => {
      const ended = jest.fn()
      const kept = jest.fn()
      const endedSubscription = await subscribe(ended)
      await subscribe(kept, 'stream-notify-room', ['GENERAL/typing'])

      await unsubscribe(endedSubscription!)
      changed(transport, 'stream-notify-room')

      expect(kept).toHaveBeenCalledTimes(1)
    })

    it('lists a function passed by two holders once, and detaches it with the stream', async () => {
      const shared = jest.fn()
      const subscription = await subscribe(shared)
      await subscribe(shared)

      changed(transport)
      expect(subscription!.callbacks).toEqual([shared])
      expect(shared).toHaveBeenCalledTimes(1)

      await unsubscribe(subscription!)
      changed(transport)

      expect(shared).toHaveBeenCalledTimes(1)
      expect(listenersOn(socket)).toEqual([])
    })

    it('keeps a function receiving for the streams still holding it on the same name', async () => {
      const handler = jest.fn()
      const general = await subscribe(handler, stream, ['GENERAL'])
      const random = await subscribe(handler, stream, ['RANDOM'])

      await unsubscribe(general!)
      changed(transport)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(listenersOn(socket)).toEqual([handler])

      await unsubscribe(random!)
      changed(transport)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(listenersOn(socket)).toEqual([])
    })

    it('detaches a function held by several streams when the socket closes', async () => {
      const handler = jest.fn()
      await subscribe(handler, stream, ['GENERAL'])
      await subscribe(handler, stream, ['RANDOM'])

      await socket.close()

      expect(listenersOn(socket)).toEqual([])
    })

    it('delivers to a new subscriber and not to the one that ended', async () => {
      const ended = jest.fn()
      const subscription = await subscribe(ended)
      await unsubscribe(subscription!)

      const fresh = jest.fn()
      await subscribe(fresh)
      changed(transport)

      expect(ended).not.toHaveBeenCalled()
      expect(fresh).toHaveBeenCalledTimes(1)
    })

    it('keeps rejecting a second unsubscribe from the other holder', async () => {
      const subscription = await subscribe(jest.fn())
      const other = await subscribe(jest.fn())

      await unsubscribe(subscription!)

      await expect(other!.unsubscribe()).rejects.toThrow('No subscription to unsubscribe from')
    })

    it('ignores a callback added through a handle whose stream has ended', async () => {
      const subscription = await subscribe(jest.fn())
      await unsubscribe(subscription!)

      const late = jest.fn()
      subscription!.onEvent(late)
      changed(transport)

      expect(late).not.toHaveBeenCalled()
      expect(listenersOn(socket)).toEqual([])
    })

    it('ignores a callback added through a handle after a new subscribe to the same stream', async () => {
      const stale = await subscribe(jest.fn())
      await unsubscribe(stale!)
      const live = await subscribe(jest.fn())

      const late = jest.fn()
      stale!.onEvent(late)
      changed(transport)

      expect(late).not.toHaveBeenCalled()
      expect(live!.callbacks).not.toContain(late)
    })
  })

  describe('while the stream is still recorded', () => {
    it('keeps delivering from the moment the unsub is written until the server answers', async () => {
      const callback = jest.fn()
      const subscription = await subscribe(callback)

      const unsubscribing = subscription!.unsubscribe()
      changed(transport)

      expect(callback).toHaveBeenCalledTimes(1)
      expect(Object.keys(socket.subscriptions)).toEqual([subscription!.id])

      transport.receive({ msg: 'result', id: subscription!.id, result: true })
      await unsubscribing
      changed(transport)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('keeps delivering when the unsub never reached the server', async () => {
      const callback = jest.fn()
      const subscription = await subscribe(callback)

      const unsubscribing = subscription!.unsubscribe()
      const reopening = socket.reopenNow()
      await expect(unsubscribing).rejects.toThrow('connection reopened')
      const reopened = fakeSockets[fakeSockets.length - 1]
      await driveToHandshake(reopened)
      await reopening
      changed(reopened)

      expect(Object.keys(socket.subscriptions)).toEqual([subscription!.id])
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('a stream the server ended', () => {
    it('stops delivering when the server answers the unsub with a DDP error', async () => {
      const callback = jest.fn()
      const subscription = await subscribe(callback)

      const unsubscribing = subscription!.unsubscribe()
      transport.receive({ msg: 'nosub', id: subscription!.id, error: { reason: 'no such subscription' } })
      await expect(unsubscribing).rejects.toThrow('no such subscription')
      changed(transport)

      expect(callback).not.toHaveBeenCalled()
      expect(listenersOn(socket)).toEqual([])
    })

    it('stops delivering when the server refuses the stream on a resubscribe', async () => {
      const callback = jest.fn()
      const subscription = await subscribe(callback)

      const resubscribing = socket.subscribeAll()
      await flushMicrotasks()
      transport.receive({ msg: 'nosub', id: subscription!.id, error: { reason: 'refused' } })
      await resubscribing
      changed(transport)

      expect(socket.subscriptions).toEqual({})
      expect(callback).not.toHaveBeenCalled()
      expect(listenersOn(socket)).toEqual([])
    })
  })

  describe('a login that reaches the stream while its unsub is in flight', () => {
    it('re-establishes the stream without the callbacks of the holder that ended it', async () => {
      const ended = jest.fn()
      const subscription = await subscribe(ended)

      const unsubscribing = subscription!.unsubscribe()
      const resubscribing = socket.subscribeAll()
      transport.receive({ msg: 'result', id: subscription!.id, result: true })
      await unsubscribing
      await flushMicrotasks()
      transport.receive({ msg: 'ready', subs: [subscription!.id] })
      await resubscribing
      changed(transport)

      expect(Object.keys(socket.subscriptions)).toEqual([subscription!.id])
      expect(socket.subscriptions[subscription!.id].callbacks).toEqual([])
      expect(ended).not.toHaveBeenCalled()
    })
  })

  describe('a subscription issued with no transport attached', () => {
    let unopened: Socket

    beforeEach(() => {
      unopened = createSocket()
    })

    it('stops delivering once it is unsubscribed, reaching no wire', async () => {
      const callback = jest.fn()
      const subscription = await unopened.subscribe(stream, params, callback)

      expect(listenersOn(unopened)).toEqual([callback])
      await unopened.unsubscribe(subscription!.id)

      expect(listenersOn(unopened)).toEqual([])
    })
  })

  describe('closing the socket', () => {
    it('detaches every subscription callback and leaves other listeners', async () => {
      const messages = jest.fn()
      const typing = jest.fn()
      const streamData = jest.fn()
      socket.on(stream, streamData)
      await subscribe(messages)
      await subscribe(typing, 'stream-notify-room', ['GENERAL/typing'])

      await socket.close()

      expect(listenersOn(socket)).toEqual([streamData])
      expect(listenersOn(socket, 'stream-notify-room')).toEqual([])
    })
  })
})
