import Api from '../api'
import ClientRest from '../RocketChat'
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

    await expect(api.get('me', {})).rejects.toThrow(/requires a login/)
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

  it('allows info() with no login', async () => {
    const client = new FakeClient()
    const rest = new ClientRest({ client })

    const pending = rest.info()
    client.lastRequest().resolve({ status: 200, data: { info: { version: '6.0.0' } } })

    await expect(pending).resolves.toEqual({ version: '6.0.0' })
  })
})
