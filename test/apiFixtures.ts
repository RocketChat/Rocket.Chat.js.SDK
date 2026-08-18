import Api from '../lib/api/api'
import ApiRocketChat from '../lib/api/RocketChat'
import { ILogger } from '../interfaces'
import { FakeClient } from './fakeClient'
import { loginResponse } from './loginResponse'
import { answerFetchWith } from './fakeFetch'

export const anonymousApiWithFakeClient = () => {
  const restClient = new FakeClient()
  return { api: new Api({ client: restClient }), restClient }
}

export const anonymousApiRocketChatWithFakeClient = () => {
  const restClient = new FakeClient()
  return { api: new ApiRocketChat({ client: restClient }), restClient }
}

export const loggedInApiWithFakeClient = async (logger?: ILogger) => {
  const restClient = new FakeClient()
  const api = new Api({ client: restClient, logger })

  restClient.enqueueReply(loginResponse())
  await api.login({ username: 'user', password: 'pass' })
  restClient.requests = []

  return { api, restClient }
}

export const loggedInApiWithFakeFetch = async (host?: string) => {
  const api = new Api({ host })
  answerFetchWith(loginResponse().data)
  await api.login({ username: 'user', password: 'pass' })
  answerFetchWith({})
  return { api, restClient: api.client }
}
