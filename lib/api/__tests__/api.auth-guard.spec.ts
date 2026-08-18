import { loginResponse } from '../../../test/loginResponse'
import { anonymousApiWithFakeClient, anonymousApiRocketChatWithFakeClient } from '../../../test/apiFixtures'

const infoResponse = () => ({ status: 200, data: { info: { version: '6.0.0' } } })

describe('Api auth guard', () => {
  it('reports not logged in with no login', () => {
    const { api } = anonymousApiWithFakeClient()

    expect(api.loggedIn()).toBe(false)
  })

  it('refuses an authenticated request with no login', async () => {
    const { api, restClient } = anonymousApiWithFakeClient()

    await expect(api.get('me', {})).rejects.toThrow(/requires a login/)
    expect(restClient.requests).toHaveLength(0)
  })

  it('allows an unauthenticated request with no login', async () => {
    const { api, restClient } = anonymousApiWithFakeClient()

    const pending = api.get('settings.public', {}, false)
    restClient.lastRequest().resolve({ status: 200, data: { settings: [] } })

    await expect(pending).resolves.toEqual({ settings: [] })
  })

  it('logs in with no prior login', async () => {
    const { api, restClient } = anonymousApiWithFakeClient()

    const pending = api.login({ username: 'user', password: 'pass' })
    restClient.lastRequest().resolve(loginResponse())

    await expect(pending).resolves.toMatchObject({ userId: 'fake-user-id' })
    expect(api.loggedIn()).toBe(true)
  })

  it('allows info() with no login', async () => {
    const { api, restClient } = anonymousApiRocketChatWithFakeClient()

    const pending = api.info()
    restClient.lastRequest().resolve(infoResponse())

    await expect(pending).resolves.toEqual({ version: '6.0.0' })
  })

  it('sends info() authenticated once logged in', async () => {
    const { api, restClient } = anonymousApiRocketChatWithFakeClient()

    const login = api.login({ username: 'user', password: 'pass' })
    restClient.lastRequest().resolve(loginResponse())
    await login

    const pending = api.info()
    restClient.lastRequest().resolve(infoResponse())
    await pending

    expect(restClient.headers).toMatchObject({ 'X-Auth-Token': 'fake-token', 'X-User-Id': 'fake-user-id' })
  })
})
