import Api from '../lib/api/api'
import { ILogger } from '../interfaces'
import { FakeClient } from './fakeClient'
import { answerFetchWith } from './stubbedFetch'

const loginResponse = () => ({
  status: 200,
  data: {
    success: true,
    data: { authToken: 'fake-token', userId: 'fake-user-id', me: { username: 'fake-username' } }
  }
})

const logIn = async (api: Api, client: FakeClient) => {
  client.replyOnce('POST', loginResponse())
  await api.login({ username: 'user', password: 'pass' })
  client.requests = []
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
  return { api, client: api.client }
}
