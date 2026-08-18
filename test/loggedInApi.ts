import Api from '../lib/api/api'
import { ILogger } from '../interfaces'
import { FakeClient } from './fakeClient'
import { loginResponse } from './loginResponse'
import { answerFetchWith } from './stubbedFetch'

const fakeLoginResponse = () => loginResponse({
  userId: 'fake-user-id',
  authToken: 'fake-token',
  username: 'fake-username'
})

export const loggedInApiWithFakeClient = async (logger?: ILogger) => {
  const client = new FakeClient()
  const api = new Api({ client, logger })

  client.replyOnce('POST', fakeLoginResponse())
  await api.login({ username: 'user', password: 'pass' })
  client.requests = []

  return { api, client }
}

export const loggedInApiWithStubbedFetch = async (host?: string) => {
  const api = new Api({ host })
  answerFetchWith(fakeLoginResponse().data)
  await api.login({ username: 'user', password: 'pass' })
  answerFetchWith({})
  return { api, client: api.client }
}
