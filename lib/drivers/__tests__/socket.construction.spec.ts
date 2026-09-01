import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { createSocket } from '../../../test/createSocket'

describe('new Socket', () => {
  it('defaults the host to the local websocket URL', () => {
    expect(new Socket({ logger: createSilentLogger() }).host).toBe('ws://localhost:3000/websocket')
  })

  it('derives a wss host from an explicit host and useSsl', () => {
    const sslSocket = createSocket({ host: 'https://open.rocket.chat', useSsl: true })

    expect(sslSocket.host).toBe('wss://open.rocket.chat/websocket')
  })

  it('defaults the ping interval when neither option is given', () => {
    expect(new Socket({ logger: createSilentLogger() }).config.ping).toBe(10000)
  })

  it('constructs with no arguments, on the defaults alone', () => {
    const defaultSocket = new Socket()

    expect(defaultSocket.host).toBe('ws://localhost:3000/websocket')
    expect(defaultSocket.config).toEqual({
      host: 'http://localhost:3000',
      useSsl: false,
      reopen: 10000,
      ping: 10000,
      timeout: 10000
    })
  })
})
