import { sha256 } from 'js-sha256'

import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { createSocket } from '../../../test/createSocket'

const socket = createSocket()
const loginParams = socket.loginParams.bind(socket)

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

describe('Socket.loginParams', () => {
  it('passes an already-digested password credential through untouched', () => {
    const credentials = {
      user: { username: 'user' },
      password: { digest: 'already-a-digest', algorithm: 'sha-256' }
    }

    expect(loginParams(credentials)).toBe(credentials)
  })

  it('digests a plain username and password', () => {
    expect(loginParams({ username: 'user', password: 'pass' })).toEqual({
      user: { username: 'user' },
      password: { digest: sha256('pass'), algorithm: 'sha-256' }
    })
  })

  it('passes an oauth credential through untouched', () => {
    const credentials = {
      oauth: { credentialToken: 'token', credentialSecret: 'secret' }
    }

    expect(loginParams(credentials)).toBe(credentials)
  })

  it('passes an already-authenticated credential through untouched', () => {
    const credentials = { resume: 'resume-token' }

    expect(loginParams(credentials)).toBe(credentials)
  })

  it('reduces a login result to its resume token', () => {
    const result = { id: 'userId', token: 'resume-token', createCipher: { $date: 0 } }

    expect(loginParams(result)).toEqual({ resume: 'resume-token' })
  })
})
