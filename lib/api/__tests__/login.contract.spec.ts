import Api from '../api'
import { Rocketchat } from '../../../index'
import type { ILoginCredentials, ILoginData, ILoginResult } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { FakeClient } from '../../../test/fakeClient'
import { loginResponse } from '../../../test/loginResponse'

const api = new Api({ client: new FakeClient(), logger: createSilentLogger() })
const restClient = new FakeClient()
const client = new Rocketchat({ client: restClient, logger: createSilentLogger() })

const restLogin: (credentials: ILoginCredentials) => Promise<ILoginData> = api.loginWithRest.bind(api)
const combinedLogin: (credentials: ILoginCredentials) => Promise<ILoginResult | null> = client.login.bind(client)

it('keeps the REST and combined login contracts distinct', () => {
  expect(restLogin).toBeDefined()
  expect(combinedLogin).toBeDefined()
})

it('logs the Client into REST without logging into realtime', async () => {
  const realtimeLogin = jest.spyOn(client.driver, 'login')

  const pending = client.loginWithRest({ username: 'user', password: 'pass' })
  restClient.lastRequest().resolve(loginResponse())

  await expect(pending).resolves.toMatchObject({ userId: 'fake-user-id' })
  expect(client.currentLogin).toMatchObject({ userId: 'fake-user-id', authToken: 'fake-token' })
  expect(realtimeLogin).not.toHaveBeenCalled()
})
