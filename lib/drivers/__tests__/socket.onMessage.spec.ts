import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { ILogger } from '../../../interfaces'

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
  let logger: ILogger

  beforeEach(() => {
    logger = createSilentLogger()
    socket = new Socket({ host: 'localhost:3000', logger })
  })

  it('emits the collection, the message type and the id from a single frame', () => {
    const payload = {
      collection: 'stream-room-messages',
      msg: 'changed',
      id: 'frame-id',
      fields: { args: [] }
    }
    const events: string[] = []
    socket.on('stream-room-messages', () => events.push('collection'))
    socket.on('changed', () => events.push('msg'))
    socket.on('frame-id', () => events.push('id'))

    socket.onMessage(frame(payload))

    expect(events).toEqual(['collection', 'msg', 'id'])
  })

  it('hands the whole frame to each of the three listeners', () => {
    const payload = { collection: 'a-collection', msg: 'changed', id: 'frame-id' }
    const received: any[] = []
    socket.on('a-collection', (data: any) => received.push(data))
    socket.on('changed', (data: any) => received.push(data))
    socket.on('frame-id', (data: any) => received.push(data))

    socket.onMessage(frame(payload))

    expect(received).toEqual([payload, payload, payload])
  })

  it('emits nothing for a frame with no collection, msg or id', () => {
    const listener = jest.fn()
    socket.on('changed', listener)

    socket.onMessage(frame({ fields: { args: [] } }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('emits the id twice for a reply frame, reshaped first and raw second', () => {
    // Two paths reach the same event name. The constructor listens for `result`
    // and re-emits `data.id` with a reshaped payload; `onMessage` then emits
    // `data.id` again with the frame as it arrived. The constructor's listener
    // runs during the `msg` emit, which is before the `id` emit — so the
    // reshaped payload is always the one that arrives first.
    const payload = { msg: 'result', id: 'call-id', result: 'the-result' }
    const received: any[] = []
    socket.on('call-id', (data: any) => received.push(data))

    socket.onMessage(frame(payload))

    expect(received).toHaveLength(2)
    expect(received[0]).toStrictEqual({ id: 'call-id', result: 'the-result', error: undefined })
    expect(received[1]).toStrictEqual(payload)
  })

  it('carries the error of a failed reply onto the reshaped payload', () => {
    const payload = { msg: 'result', id: 'call-id', error: { error: 500, reason: 'nope' } }
    const received: any[] = []
    socket.on('call-id', (data: any) => received.push(data))

    socket.onMessage(frame(payload))

    expect(received[0]).toStrictEqual({ id: 'call-id', result: undefined, error: payload.error })
  })

  it('emits only the first subscription id of a ready frame', () => {
    // A `ready` frame has no `id` of its own, so unlike `result` its
    // re-emit is the only one the subscription listener sees.
    const payload = { msg: 'ready', subs: ['sub-id', 'ignored-sub-id'] }
    const received: any[] = []
    const ignored = jest.fn()
    socket.on('sub-id', (data: any) => received.push(data))
    socket.on('ignored-sub-id', ignored)

    socket.onMessage(frame(payload))

    expect(received).toEqual([payload])
    expect(ignored).not.toHaveBeenCalled()
  })

  it('logs and swallows a malformed frame instead of throwing', () => {
    // In production the caller is the websocket's `onmessage`, which has
    // nowhere to put a throw.
    const listener = jest.fn()
    socket.on('changed', listener)

    expect(() => socket.onMessage({ data: 'not json' })).not.toThrow()

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('[ddp] JSON parse error')
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('not json')
    )
    expect(listener).not.toHaveBeenCalled()
  })
})
