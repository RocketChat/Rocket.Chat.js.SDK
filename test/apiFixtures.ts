import Api from '../lib/api/api'
import ApiRocketChat from '../lib/api/RocketChat'
import { ILogger } from '../interfaces'
import { FakeClient } from './fakeClient'
import { loginResponse } from './loginResponse'
import { answerFetchWith } from './fakeFetch'

const fakeLoginResponse = () => loginResponse({
  userId: 'fake-user-id',
  authToken: 'fake-token',
  username: 'fake-username'
})

const anonymousApiWith = <T extends Api> (
  ApiClass: new (config: any) => T,
  logger?: ILogger
) => {
  const restClient = new FakeClient()
  return { api: new ApiClass({ client: restClient, logger }), restClient }
}

export const anonymousApiWithFakeClient = () => anonymousApiWith(Api)

export const anonymousApiRocketChatWithFakeClient = () => anonymousApiWith(ApiRocketChat)

export const loggedInApiWithFakeClient = async (logger?: ILogger) => {
  const { api, restClient } = anonymousApiWith(Api, logger)

  restClient.enqueueReply(fakeLoginResponse())
  await api.login({ username: 'user', password: 'pass' })
  restClient.requests = []

  return { api, restClient }
}

export const loggedInApiWithFakeFetch = async (host?: string) => {
  const api = new Api({ host })
  answerFetchWith(fakeLoginResponse().data)
  await api.login({ username: 'user', password: 'pass' })
  answerFetchWith({})
  return { api, restClient: api.client }
}
