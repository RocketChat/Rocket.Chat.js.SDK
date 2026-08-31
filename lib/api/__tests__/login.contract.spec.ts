import { Rocketchat } from '../../../index'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { FakeClient } from '../../../test/fakeClient'
import { loginResponse } from '../../../test/loginResponse'

const restClient = new FakeClient()
const client = new Rocketchat({ client: restClient, logger: createSilentLogger() })

it('logs the Client into REST without logging into realtime', async () => {
  const realtimeLogin = jest.spyOn(client.driver, 'login')

  const pending = client.loginWithRest({ username: 'user', password: 'pass' })
  restClient.lastRequest().resolve(loginResponse())

  await expect(pending).resolves.toMatchObject({ userId: 'fake-user-id' })
  expect(client.currentLogin).toMatchObject({ userId: 'fake-user-id', authToken: 'fake-token' })
  expect(realtimeLogin).not.toHaveBeenCalled()
})
