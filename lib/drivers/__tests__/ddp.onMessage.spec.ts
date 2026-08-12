import { PendingResponses, Socket } from '../ddp'
import { silentLogger } from '../../../test/silentLogger'

// `onMessage` is handed frames directly — no socket is constructed and no timer
// is started, so this file runs on Jest's default real timers.
//
// Frames whose `msg` is `ping` are avoided here: the constructor's own `ping`
// listener calls `send`, which reaches for a connection that does not exist.

const frame = (payload: any) => ({ data: JSON.stringify(payload) })

describe('Socket.onMessage', () => {
  // A fresh Socket per test: every case attaches listeners, and the emitter
  // keeps them for the life of the instance.
  let socket: Socket

  const waiterOn = (key: string) => {
    const received: any[] = []
    const abandoned: any[] = []
    socket.pending.register(key, {
      receive: (response: any) => received.push(response),
      abandon: (reason: Error) => abandoned.push(reason)
    })
    return { received, abandoned }
  }

  beforeEach(() => {
    // `silentLogger` is a shared module, so its mocks keep calls between tests;
    // the cases that assert on what was logged need a clean slate.
    jest.clearAllMocks()
    socket = new Socket({ host: 'localhost:3000', logger: silentLogger })
  })

  it('emits the collection and the message type from a single frame', () => {
    const payload = {
      collection: 'stream-room-messages',
      msg: 'changed',
      id: 'document-id',
      fields: { args: [] }
    }
    const events: string[] = []
    socket.on('stream-room-messages', () => events.push('collection'))
    socket.on('changed', () => events.push('msg'))

    socket.onMessage(frame(payload))

    expect(events).toEqual(['collection', 'msg'])
  })

  it('hands the whole frame to both listeners', () => {
    const payload = { collection: 'a-collection', msg: 'changed', id: 'document-id' }
    const received: any[] = []
    socket.on('a-collection', (data: any) => received.push(data))
    socket.on('changed', (data: any) => received.push(data))

    socket.onMessage(frame(payload))

    expect(received).toEqual([payload, payload])
  })

  it('emits nothing for a frame with no collection or msg', () => {
    const listener = jest.fn()
    socket.on('changed', listener)

    socket.onMessage(frame({ fields: { args: [] } }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('leaves a waiter untouched when a document carries the same id', () => {
    // `added`, `changed` and `removed` carry the document's own id, which is
    // not a correlation key. Sharing the string with an in-flight Method call
    // must not settle it.
    const waiter = waiterOn('ddp-1')

    socket.onMessage(frame({ collection: 'stream-room-messages', msg: 'changed', id: 'ddp-1' }))

    expect(waiter.received).toEqual([])
  })

  it('delivers a reply to its waiter once, reshaped', () => {
    const waiter = waiterOn('call-id')

    socket.onMessage(frame({ msg: 'result', id: 'call-id', result: 'the-result' }))

    expect(waiter.received).toHaveLength(1)
    expect(waiter.received[0]).toStrictEqual({ id: 'call-id', result: 'the-result', error: undefined })
  })

  it('carries the error of a failed reply onto the reshaped response', () => {
    const error = { error: 500, reason: 'nope' }
    const waiter = waiterOn('call-id')

    socket.onMessage(frame({ msg: 'result', id: 'call-id', error }))

    expect(waiter.received[0]).toStrictEqual({ id: 'call-id', result: undefined, error })
  })

  it('delivers a ready frame on its first subscription id only', () => {
    const payload = { msg: 'ready', subs: ['sub-id', 'ignored-sub-id'] }
    const waiter = waiterOn('sub-id')
    const ignored = waiterOn('ignored-sub-id')

    socket.onMessage(frame(payload))

    expect(waiter.received).toEqual([payload])
    expect(ignored.received).toEqual([])
  })

  it('drops a ready frame with no subscription ids instead of throwing', () => {
    // The emitter does not catch what a listener throws, so `onMessage` would
    // carry a TypeError out to the websocket's `onmessage`.
    expect(() => socket.onMessage(frame({ msg: 'ready' }))).not.toThrow()
  })

  it('settles the waiter after the consumers of the same frame', () => {
    const order: string[] = []
    socket.on('result', () => order.push('msg consumer'))
    socket.pending.register('call-id', {
      receive: () => order.push('waiter'),
      abandon: () => undefined
    })

    socket.onMessage(frame({ msg: 'result', id: 'call-id', result: 'ok' }))

    expect(order).toEqual(['msg consumer', 'waiter'])
  })

  it('delivers a nosub frame on the id it refuses', () => {
    const payload = { msg: 'nosub', id: 'sub-id', error: { error: 404, reason: 'no such stream' } }
    const waiter = waiterOn('sub-id')

    socket.onMessage(frame(payload))

    expect(waiter.received).toEqual([payload])
  })

  it('delivers the handshake and the pong on their msg rather than an id', () => {
    const handshake = waiterOn('connected')
    const pong = waiterOn('pong')

    socket.onMessage(frame({ msg: 'connected', session: 'a-session' }))
    socket.onMessage(frame({ msg: 'pong' }))

    expect(handshake.received).toEqual([{ msg: 'connected', session: 'a-session' }])
    expect(pong.received).toEqual([{ msg: 'pong' }])
  })

  it('logs and swallows a malformed frame instead of throwing', () => {
    // In production the caller is the websocket's `onmessage`, which has
    // nowhere to put a throw.
    const listener = jest.fn()
    socket.on('changed', listener)

    expect(() => socket.onMessage({ data: 'not json' })).not.toThrow()

    expect(silentLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('[ddp] JSON parse error')
    )
    expect(silentLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('not json')
    )
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('PendingResponses', () => {
  const spyWaiter = () => ({ receive: jest.fn(), abandon: jest.fn() })

  it('settles every waiter registered on one correlation key', () => {
    // A resubscribe racing `subscribeAll` puts two sends on one id, and both
    // are answered by the one response.
    const pending = new PendingResponses()
    const first = spyWaiter()
    const second = spyWaiter()
    pending.register('sub-id', first)
    pending.register('sub-id', second)

    pending.deliver('sub-id', { msg: 'ready' })

    expect(first.receive).toHaveBeenCalledWith({ msg: 'ready' })
    expect(second.receive).toHaveBeenCalledWith({ msg: 'ready' })
  })

  it('settles a correlation key only once', () => {
    const pending = new PendingResponses()
    const waiter = spyWaiter()
    pending.register('call-id', waiter)

    pending.deliver('call-id', { result: 'first' })
    pending.deliver('call-id', { result: 'second' })

    expect(waiter.receive).toHaveBeenCalledTimes(1)
  })

  it('ignores a response with no correlation key, and one nobody is waiting on', () => {
    const pending = new PendingResponses()
    const waiter = spyWaiter()
    pending.register('call-id', waiter)

    expect(() => pending.deliver(undefined, { msg: 'changed' })).not.toThrow()
    expect(() => pending.deliver('another-id', { result: 'ok' })).not.toThrow()
    expect(waiter.receive).not.toHaveBeenCalled()
  })

  it('abandons every waiter with an Error carrying the reason', () => {
    const pending = new PendingResponses()
    const waiter = spyWaiter()
    pending.register('call-id', waiter)

    pending.abandonAll('[ddp] gone')

    expect(waiter.abandon).toHaveBeenCalledWith(expect.any(Error))
    expect(waiter.abandon.mock.calls[0][0].message).toBe('[ddp] gone')
  })

  it('forgets the waiters it abandoned', () => {
    // A response landing after the abandonment must not settle a promise that
    // has already rejected.
    const pending = new PendingResponses()
    const waiter = spyWaiter()
    pending.register('call-id', waiter)

    pending.abandonAll('[ddp] gone')
    pending.deliver('call-id', { result: 'late' })

    expect(waiter.receive).not.toHaveBeenCalled()
    expect(waiter.abandon).toHaveBeenCalledTimes(1)
  })
})
