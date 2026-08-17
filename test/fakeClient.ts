import type { IClient } from '../lib/api/api'

export interface FakeRequest {
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  data: any
  options?: any
  apiVersion?: string
}

/**
 * The second adapter behind `IClient`. A spec hands one to `new Api({ client })`
 * — the injection point the shipped constructor already offers — so no request
 * ever reaches the network and nothing is assigned onto the Api.
 *
 * Responses are queued per method with `reply`, and every call is recorded in
 * `requests` in order.
 */
export class FakeClient implements IClient {
  requests: FakeRequest[] = []

  _headers: any = {}

  private replies: { [method: string]: any[] } = {}

  set headers (obj: any) {
    this._headers = obj
  }
  get headers (): any {
    return this._headers
  }

  /** Queue what the next call to `method` answers with. */
  reply (method: FakeRequest['method'], response: any): this {
    this.replies[method] = this.replies[method] || []
    this.replies[method].push(response)
    return this
  }

  get (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('get', url, data, options, apiVersion)
  }
  post (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('post', url, data, options, apiVersion)
  }
  put (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('put', url, data, options, apiVersion)
  }
  delete (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('delete', url, data, options, apiVersion)
  }

  /** The last request made, whichever method made it. */
  lastRequest (): FakeRequest {
    return this.requests[this.requests.length - 1]
  }

  private async record (
    method: FakeRequest['method'],
    url: string,
    data: any,
    options?: any,
    apiVersion?: string
  ): Promise<any> {
    this.requests.push({ method, url, data, options, apiVersion })
    const queued = this.replies[method]
    return queued && queued.length ? queued.shift() : { status: 200, data: {} }
  }
}

/**
 * A login answer shaped as the server sends it: the REST body carries its own
 * `data`, and the client wraps that body under the HTTP status.
 */
export const loginResponse = (
  authToken = 'fake-token',
  userId = 'fake-user-id',
  username = 'fake-username'
) => ({
  status: 200,
  data: { success: true, data: { authToken, userId, me: { username } } }
})
