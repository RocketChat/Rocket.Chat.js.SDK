import Api, { IClient, RequestMethod } from '../lib/api/api'

export interface IRecordedRequest {
  method: RequestMethod
  url: string
  data: any
  options: any
  apiVersion?: string
}

export class FakeRestClient implements IClient {
  headers: any = {}
  requests: IRecordedRequest[] = []
  respondWith: () => any = () => ({ status: 200, data: {} })

  request (method: RequestMethod, url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    this.requests.push({ method, url, data, options, apiVersion })
    return Promise.resolve(this.respondWith())
  }

  respond (data: any, status: number = 200) {
    this.respondWith = () => ({ status, data })
  }

  get lastRequest (): IRecordedRequest {
    return this.requests[this.requests.length - 1]
  }
}

export const loginPayload = {
  data: {
    authToken: 'auth-token',
    userId: 'user-id',
    me: { username: 'user' }
  }
}

export const createApiWith = <T extends Api>(build: (client: FakeRestClient) => T) => {
  const client = new FakeRestClient()
  return { client, api: build(client) }
}

export const logIn = async (client: FakeRestClient, api: Api) => {
  client.respond(loginPayload)
  await api.login({ username: 'user', password: 'pass' })
  client.requests = []
  client.respond({})
}
