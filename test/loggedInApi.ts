import Api from '../lib/api/api'
import { ILogger } from '../interfaces'
import { FakeClient, loginResponse } from './fakeClient'
import { answerFetchWith } from './stubbedFetch'

const forgetLoginRequest = (client: FakeClient) => {
  client.requests.length = 0
}

const logIn = async (api: Api, client: FakeClient) => {
  client.replyOnce('POST', loginResponse())
  await api.login({ username: 'user', password: 'pass' })
  forgetLoginRequest(client)
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
  answerFetchWith({ data: { authToken: 'fake-token', userId: 'fake-user-id', me: { username: 'fake-username' } } })
  await api.login({ username: 'user', password: 'pass' })
  answerFetchWith({})
  return { api }
}
