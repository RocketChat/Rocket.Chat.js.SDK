import { IClient, RequestMethod } from '../lib/api/api'

export interface IRecordedRequest {
  method: RequestMethod
  url: string
  data: any
  options: any
  apiVersion?: string
}

/**
 * The whole REST seam is one method, so a client stub is one method too. Specs
 * reach the recorded requests instead of reaching into the Api instance.
 */
export class FakeRestClient implements IClient {
  headers: any = {}
  requests: IRecordedRequest[] = []
  respondWith: (request: IRecordedRequest) => any = () => ({ status: 200, data: {} })

  request (method: RequestMethod, url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    const request = { method, url, data, options, apiVersion }
    this.requests.push(request)
    return Promise.resolve(this.respondWith(request))
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
