import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { createSocket } from '../../../test/createSocket'
import { ILogger } from '../../../interfaces'

const frame = (payload: any) => ({ data: JSON.stringify(payload) })

describe('Socket.onMessage', () => {
  let socket: Socket
  let logger: ILogger

  beforeEach(() => {
    logger = createSilentLogger()
    socket = createSocket({ logger })
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
