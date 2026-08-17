import Api from '../api'
import { FakeClient } from '../../../test/fakeClient'

const anonymousApi = () => {
  const client = new FakeClient()
  return { api: new Api({ client }), client }
}

describe('Api auth guard', () => {
  it('reports not logged in with no login', () => {
    const { api } = anonymousApi()

    expect(api.loggedIn()).toBe(false)
  })

  it('refuses an authenticated request with no login', async () => {
    const { api, client } = anonymousApi()

    await expect(api.get('me', {})).rejects.toThrow()
    expect(client.requests).toHaveLength(0)
  })

  it('allows an unauthenticated request with no login', async () => {
    const { api, client } = anonymousApi()

    const pending = api.get('settings.public', {}, false)
    client.lastRequest().resolve({ status: 200, data: { settings: [] } })

    await expect(pending).resolves.toEqual({ settings: [] })
  })

  it('logs in with no prior login', async () => {
    const { api, client } = anonymousApi()

    const pending = api.login({ username: 'user', password: 'pass' })
    client.lastRequest().resolve({
      status: 200,
      data: { data: { userId: 'id', authToken: 'token', me: { username: 'user' } } }
    })

    await expect(pending).resolves.toMatchObject({ userId: 'id' })
    expect(api.loggedIn()).toBe(true)
  })
})
