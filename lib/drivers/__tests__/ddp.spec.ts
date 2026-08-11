import { sha256 } from 'js-sha256'

import { Socket } from '../ddp'
import { silentLogger } from '../../../test/silentLogger'

// `loginParams` reads only its argument, so one Socket serves every case here.
// Constructing a Socket opens no connection and starts no timer. Bound rather
// than detached, so it keeps working if it ever reaches for the instance.
const socket = new Socket({ host: 'localhost:3000', logger: silentLogger })
const loginParams = socket.loginParams.bind(socket)

describe('new Socket', () => {
  it('defaults the host to the local websocket URL', () => {
    expect(new Socket({ logger: silentLogger }).host).toBe('ws://localhost:3000/websocket')
  })

  it('derives a wss host from an explicit host and useSsl', () => {
    const sslSocket = new Socket({ host: 'https://open.rocket.chat', useSsl: true, logger: silentLogger })

    expect(sslSocket.host).toBe('wss://open.rocket.chat/websocket')
  })

  it('honours a reopen interval', () => {
    expect(new Socket({ reopen: 500, logger: silentLogger }).config.reopen).toBe(500)
  })

  it('honours a ping interval, in preference to `timeout`', () => {
    const pingSocket = new Socket({ ping: 500, timeout: 250, logger: silentLogger })

    expect(pingSocket.config.ping).toBe(500)
  })

  it('falls back to `timeout` for the ping interval when no `ping` is given', () => {
    expect(new Socket({ timeout: 250, logger: silentLogger }).config.ping).toBe(250)
  })

  it('defaults the ping interval when neither option is given', () => {
    expect(new Socket({ logger: silentLogger }).config.ping).toBe(10000)
  })

  it('BUG: throws when constructed with no arguments', () => {
    // No cast: the call has to typecheck for the pin to mean anything. Making
    // `options` required is the fix, and it must break this test.
    expect(() => new Socket()).toThrow(TypeError)
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
