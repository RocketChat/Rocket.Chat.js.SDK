import type { IClient } from '../lib/api/api'

/**
 * The one and only way a spec gets an API client: `Api` takes one through its
 * constructor, so the fake reaches the Api on its normal path and nothing is
 * ever assigned onto `api.client`.
 *
 * Every request is recorded with the options the Api built for it — the abort
 * signal among them — and left pending until the spec resolves or rejects it,
 * so a spec can hold a request open across an `abort()`.
 */

export interface FakeRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  data: any
  options: any
  apiVersion: string
  resolve (result: any): void
  reject (error: any): void
}

/** The rejection `fetch` produces once its signal aborts. */
export const abortError = (): Error => {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

export class FakeClient implements IClient {
  headers: any = {}

  /** Every request the Api has made, in order. */
  requests: FakeRequest[] = []

  get = (url: string, data: any, options?: any, apiVersion: string = 'v1') =>
    this.record('GET', url, data, options, apiVersion)

  post = (url: string, data: any, options?: any, apiVersion: string = 'v1') =>
    this.record('POST', url, data, options, apiVersion)

  put = (url: string, data: any, options?: any, apiVersion: string = 'v1') =>
    this.record('PUT', url, data, options, apiVersion)

  delete = (url: string, data: any, options?: any, apiVersion: string = 'v1') =>
    this.record('DELETE', url, data, options, apiVersion)

  /** The request the Api made last. */
  lastRequest (): FakeRequest {
    return this.requests[this.requests.length - 1]
  }

  private record (
    method: FakeRequest['method'],
    url: string,
    data: any,
    options: any,
    apiVersion: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: FakeRequest = { method, url, data, options, apiVersion, resolve, reject }
      this.requests.push(request)
      const { signal } = options || {}
      if (signal?.aborted) return reject(abortError())
      signal?.addEventListener('abort', () => reject(abortError()))
    })
  }
}
