import Api from '../lib/api/api'
import { FakeClient, loginResponse } from './fakeClient'

export const apiWithFakeClient = (client: FakeClient) => new Api({ client })

export const loggedInApiWithFakeClient = async (
  makeApi: (client: FakeClient) => Api = apiWithFakeClient
) => {
  const client = new FakeClient()
  const api = makeApi(client)
  client.reply('post', loginResponse())
  await api.login({ username: 'user', password: 'pass' })
  return { api, client }
}

export const fetchAnswering = (body: any, status = 200) =>
  jest.fn().mockResolvedValue({ status, json: async () => body })

export const loggedInApiWithStubbedFetch = async (host = 'http://localhost:3000') => {
  const api = new Api({ host })
  global.fetch = fetchAnswering({ data: { authToken: 't', userId: 'u', me: { username: 'n' } } }) as any
  await api.login({ username: 'user', password: 'pass' })
  global.fetch = fetchAnswering({}) as any
  return api
}

export const lastFetchCall = (): { url: string, init: any } => {
  const calls = (global.fetch as jest.Mock).mock.calls
  const [url, init] = calls[calls.length - 1]
  return { url, init }
}
