import type { IClient } from '../lib/api/api'

export interface FakeRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  data: any
  options: { signal?: AbortSignal }
  apiVersion: string
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

  private readonly autoRespond: boolean

  private replies: { [method: string]: any } = {}

  constructor ({ autoRespond = true }: { autoRespond?: boolean } = {}) {
    this.autoRespond = autoRespond
  }

  replyOnce (method: FakeRequest['method'], response: any): void {
    this.replies[method] = response
  }

  get (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('GET', url, data, options, apiVersion)
  }
  post (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('POST', url, data, options, apiVersion)
  }
  put (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('PUT', url, data, options, apiVersion)
  }
  delete (url: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('DELETE', url, data, options, apiVersion)
  }

  lastRequest (): FakeRequest {
    return this.requests[this.requests.length - 1]
  }

  private record (
    method: FakeRequest['method'],
    url: string,
    data: any,
    options: any,
    apiVersion: string = 'v1'
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requests.push({ method, url, data, options, apiVersion, resolve, reject })

      const { signal } = options || {}
      if (signal?.aborted) return reject(abortError())
      signal?.addEventListener('abort', () => reject(abortError()))

      if (method in this.replies) {
        const reply = this.replies[method]
        delete this.replies[method]
        return resolve(reply)
      }
      if (this.autoRespond) resolve({ status: 200, data: {} })
    })
  }
}

export const loginResponse = () => ({
  status: 200,
  data: {
    success: true,
    data: { authToken: 'fake-token', userId: 'fake-user-id', me: { username: 'fake-username' } }
  }
})
