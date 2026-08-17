import type { IClient } from '../lib/api/api'

export interface FakeRequest {
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  options?: any
  apiVersion?: string
}

export class FakeClient implements IClient {
  requests: FakeRequest[] = []

  headers: any = {}

  private replies: { [method: string]: any[] } = {}

  reply (method: FakeRequest['method'], response: any): void {
    this.replies[method] = this.replies[method] || []
    this.replies[method].push(response)
  }

  get (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.recordAndReply('get', url, options, apiVersion)
  }
  post (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.recordAndReply('post', url, options, apiVersion)
  }
  put (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.recordAndReply('put', url, options, apiVersion)
  }
  delete (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.recordAndReply('delete', url, options, apiVersion)
  }

  lastRequest (): FakeRequest {
    return this.requests[this.requests.length - 1]
  }

  private async recordAndReply (
    method: FakeRequest['method'],
    url: string,
    options?: any,
    apiVersion?: string
  ): Promise<any> {
    this.requests.push({ method, url, options, apiVersion })
    const queued = this.replies[method]
    return queued && queued.length ? queued.shift() : { status: 200, data: {} }
  }
}

export const loginResponse = (
  authToken = 'fake-token',
  userId = 'fake-user-id',
  username = 'fake-username'
) => ({
  status: 200,
  data: { success: true, data: { authToken, userId, me: { username } } }
})
