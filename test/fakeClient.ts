import type { IClient } from '../lib/api/api'

export interface FakeRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  endpoint: string
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
  host: string = ''

  requests: FakeRequest[] = []

  headers: any = {}

  private readonly replies: any[] = []

  enqueueReply (...replies: any[]): void {
    this.replies.push(...replies)
  }

  get (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('GET', endpoint, data, options, apiVersion)
  }
  post (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('POST', endpoint, data, options, apiVersion)
  }
  put (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('PUT', endpoint, data, options, apiVersion)
  }
  delete (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.record('DELETE', endpoint, data, options, apiVersion)
  }

  lastRequest (): FakeRequest {
    return this.requests[this.requests.length - 1]
  }

  private record (
    method: FakeRequest['method'],
    endpoint: string,
    data: any,
    options: any,
    apiVersion: string = 'v1'
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requests.push({ method, endpoint, data, options, apiVersion, resolve, reject })

      const { signal } = options || {}
      if (signal?.aborted) return reject(abortError())
      signal?.addEventListener('abort', () => reject(abortError()))

      if (this.replies.length) resolve(this.replies.shift())
    })
  }
}
