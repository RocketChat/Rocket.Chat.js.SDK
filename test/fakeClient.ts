import type { IClient } from '../lib/api/api'

export interface FakeRequest {
  method: 'get' | 'post' | 'put' | 'delete'
  url: string
  data: any
  options: { signal?: AbortSignal }
  apiVersion?: string
  resolve (result: any): void
  reject (error: any): void
}

const abortError = (): Error => {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

export class FakeClient implements IClient {
  requests: FakeRequest[] = []

  headers: any = {}

  private replies: { [method: string]: any[] } = {}

  constructor (private readonly autoRespond: boolean = true) {}

  reply (method: FakeRequest['method'], response: any): void {
    this.replies[method] = this.replies[method] || []
    this.replies[method].push(response)
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

  lastRequest (): FakeRequest {
    return this.requests[this.requests.length - 1]
  }

  private record (
    method: FakeRequest['method'],
    url: string,
    data: any,
    options: any,
    apiVersion?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requests.push({ method, url, data, options, apiVersion, resolve, reject })

      const { signal } = options || {}
      if (signal?.aborted) return reject(abortError())
      signal?.addEventListener('abort', () => reject(abortError()))

      const queued = this.replies[method]
      if (queued && queued.length) return resolve(queued.shift())
      if (this.autoRespond) resolve({ status: 200, data: {} })
    })
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
