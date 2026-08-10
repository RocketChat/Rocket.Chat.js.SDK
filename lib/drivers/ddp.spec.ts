import { sha256 } from 'js-sha256'

import { Socket } from './ddp'
import { silentLogger } from '../../test/silentLogger'

// `loginParams` reads only its argument, so one Socket serves every case here.
// Constructing a Socket opens no connection and starts no timer. Bound rather
// than detached, so it keeps working if it ever reaches for the instance.
const socket = new Socket({ host: 'localhost:3000', logger: silentLogger })
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
    // The misspelled `oath` key and the root-level token/secret are what the
    // guard actually tests — see test/PINNED-BUGS.md, row 2. A well-formed
    // ICredentialsOAuth does not reach this branch.
    const credentials = {
      oath: true,
      credentialToken: 'token',
      credentialSecret: 'secret'
    }

    expect(loginParams(credentials as any)).toBe(credentials)
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
