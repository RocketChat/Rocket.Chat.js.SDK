import { ILoginCredentials } from '../index'

const accepts = (credentials: ILoginCredentials) => credentials

describe('ILoginCredentials', () => {
  it('accepts every login method the endpoint supports', () => {
    accepts({ username: 'user', password: 'pass' })
    accepts({ user: 'user', password: 'pass', code: '123456' })
    accepts({ email: 'user@example.com', password: 'pass' })
    accepts({ resume: 'token' })
    accepts({ ldap: true, username: 'user', ldapPass: 'pass' })
    accepts({ crowd: true, username: 'user', crowdPassword: 'pass' })
    accepts({ saml: true, credentialToken: 'token' })
    accepts({ cas: { credentialToken: 'token' } })
    accepts({ oauth: { credentialToken: 'token', credentialSecret: 'secret' } })

    expect(true).toBe(true)
  })

  it('rejects an incomplete method', () => {
    // @ts-expect-error a password login needs a password
    accepts({ username: 'user' })
    // @ts-expect-error an LDAP login needs its own password field
    accepts({ ldap: true, username: 'user' })

    expect(true).toBe(true)
  })
})
