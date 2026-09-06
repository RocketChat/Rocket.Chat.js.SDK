import { loginResponse } from '../../../test/loginResponse'
import { anonymousApiWithFakeClient, anonymousApiRocketChatWithFakeClient } from '../../../test/apiFixtures'

const infoResponse = () => ({ status: 200, data: { info: { version: '6.0.0' } } })

describe('Api with no Current login', () => {
  it('reports no Current login', () => {
    const { api } = anonymousApiWithFakeClient()

    expect(api.loggedIn()).toBe(false)
  })

  it('sends the Endpoint and its data to the REST client', async () => {
    const { api, restClient } = anonymousApiWithFakeClient()

    const pending = api.post('users.forgotPassword', { email: 'user@example.com' })
    restClient.lastRequest().resolve({ status: 200, data: { success: true } })

    await expect(pending).resolves.toEqual({ success: true })
    expect(restClient.requests).toHaveLength(1)
    expect(restClient.lastRequest()).toMatchObject({
      endpoint: 'users.forgotPassword',
      data: { email: 'user@example.com' }
    })
  })

  it('sets a Current login from a login with none held', async () => {
    const { api, restClient } = anonymousApiWithFakeClient()

    const pending = api.loginWithRest({ username: 'user', password: 'pass' })
    restClient.lastRequest().resolve(loginResponse())

    await expect(pending).resolves.toMatchObject({ userId: 'fake-user-id' })
    expect(api.loggedIn()).toBe(true)
  })

  it('sends info() with no Current login', async () => {
    const { api, restClient } = anonymousApiRocketChatWithFakeClient()

    const pending = api.info()
    restClient.lastRequest().resolve(infoResponse())

    await expect(pending).resolves.toEqual({ version: '6.0.0' })
    expect(restClient.lastRequest()).toMatchObject({
      method: 'GET',
      endpoint: 'info',
      data: {}
    })
  })
})
