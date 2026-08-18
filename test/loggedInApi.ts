import Api from '../lib/api/api'
import { ILogger } from '../interfaces'
import { FakeClient, loginResponse } from './fakeClient'
import { answerFetchWith } from './stubbedFetch'

const logIn = async (api: Api, client: FakeClient) => {
  client.replyOnce('POST', loginResponse())
  await api.login({ username: 'user', password: 'pass' })
  client.requests.length = 0
  return api
}

export const loggedInApiWithFakeClient = async (logger?: ILogger) => {
  const client = new FakeClient()
  const api = await logIn(new Api({ client, logger }), client)
  return { api, client }
}

export const loggedInApiWithPendingClient = async () => {
  const client = new FakeClient({ autoRespond: false })
  const api = await logIn(new Api({ client }), client)
  return { api, client }
}

export const loggedInApiWithStubbedFetch = async (host?: string) => {
  const api = new Api({ host })
  answerFetchWith(loginResponse().data)
  await api.login({ username: 'user', password: 'pass' })
  answerFetchWith({})
  return { api }
}
