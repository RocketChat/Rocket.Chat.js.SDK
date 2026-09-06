import { sha256 } from 'js-sha256'

import { createSocket } from '../../../test/createSocket'

const socket = createSocket()
const loginParams = socket.loginParams.bind(socket)

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
