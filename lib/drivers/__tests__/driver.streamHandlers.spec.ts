import { Driver } from '../driver'
import { createSilentLogger } from '../../../test/createSilentLogger'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

const createDriver = () => new Driver({ host: 'localhost:3000', logger: createSilentLogger() })

describe('Driver.onMessage', () => {
  it('drops a frame that carries no fields', () => {
    const driver = createDriver()
    const received = jest.fn()
    driver.onMessage(received)

    expect(() => driver['socket'].emit('stream-room-messages', { msg: 'changed' })).not.toThrow()
    expect(received).not.toHaveBeenCalled()
  })

  it('drops a frame whose fields carry no args, and logs it as an error', () => {
    const logger = createSilentLogger()
    const driver = new Driver({ host: 'localhost:3000', logger })
    const received = jest.fn()
    driver.onMessage(received)

    expect(() => driver['socket'].emit('stream-room-messages', { fields: {} })).not.toThrow()
    expect(received).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('stream-room-messages'))
  })

  it('passes a well formed message through, with ts revived as a Date', () => {
    const driver = createDriver()
    const received = jest.fn()
    driver.onMessage(received)

    driver['socket'].emit('stream-room-messages', { fields: { args: [{ _id: 'm1', ts: { $date: 0 } }] } })

    expect(received).toHaveBeenCalledWith({ _id: 'm1', ts: new Date(0) })
  })
})

describe('Driver.onTyping', () => {
  it('drops a frame that carries no args', () => {
    const driver = createDriver()
    const received = jest.fn()
    driver.onTyping(received)

    expect(() => driver['socket'].emit('stream-notify-room', { fields: {} })).not.toThrow()
    expect(received).not.toHaveBeenCalled()
  })

  it('passes username and typing flag through', () => {
    const driver = createDriver()
    const received = jest.fn()
    driver.onTyping(received)

    driver['socket'].emit('stream-notify-room', { fields: { args: ['user', true] } })

    expect(received).toHaveBeenCalledWith('user', true)
  })
})
