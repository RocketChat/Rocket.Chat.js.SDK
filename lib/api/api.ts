import { logger as Logger } from '../log'

import {
	ILogger,
	ILoginResultAPI,
	IAPIRequest,
	IMessage,
	ICredentials
} from '../../interfaces'

import { Message } from '../message'

import { SDKEventEmitter } from '../emitter'
import * as settings from '../settings';

export type RestMethod = 'POST' | 'GET' | 'PUT' | 'DELETE'

export interface IRestRequest {
  method: RestMethod
  endpoint: string
  data?: any
  options?: any
  apiVersion?: string
}

export interface IRestResponse {
  status: number
  data: any
}

export interface IRestTransport {
  headers: any
  send (request: IRestRequest): Promise<IRestResponse>
}

class FetchTransport implements IRestTransport {
  host: string

  _headers: any = {}

  constructor ({ host = 'http://localhost:3000' }: any) {
    this.host = host
  }

  set headers (obj: any) {
    this._headers = obj
  }
  get headers (): any {
    return {
      'Content-Type': 'application/json',
      ...settings.customHeaders,
      ...this._headers
    }
  }

  async send ({ method, endpoint, data = {}, options, apiVersion = 'v1' }: IRestRequest): Promise<IRestResponse> {
    const path = `${this.host}/api/${apiVersion}/${encodeURI(endpoint)}`
    const carriesQuery = method === 'GET'
    const response = await fetch(carriesQuery ? `${path}?${this.queryString(data)}` : path, {
      method,
      body: carriesQuery ? undefined : this.body(data),
      headers: this.headersFor(options),
      signal: options && options.signal
    })
    return { status: response.status, data: await response.json() }
  }

  private headersFor (options?: any) {
    return options && options.customHeaders ?
      options.customHeaders :
      this.headers
  }

  private body (data: any) {
    return data instanceof FormData ?
      data :
      JSON.stringify(data)
  }

  private queryString (data: any) {
    const params: any = [];
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (Array.isArray(value)) {
        value.forEach(val => {
          params.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(val)}`);
        });
      } else {
        params.push(`${encodeURIComponent(key)}=${(typeof data[key] === 'object' ? encodeURIComponent(JSON.stringify(data[key])) : encodeURIComponent(data[key]))}`);
      }
    });
    return params.join('&');
  }
}

export const regExpSuccess = /(?!([45][0-9][0-9]))\d{3}/

/**
	* @module API
	* Sends REST requests to a Rocket.Chat server over a REST transport
	*/

export default class Api extends SDKEventEmitter {
  userId: string = ''
  logger: ILogger
  transport: IRestTransport
  currentLogin: {
    username: string,
    userId: string,
    authToken: string,
    result: ILoginResultAPI
  } | null = null
  controller: AbortController

  constructor ({ transport, host }: any) {
    super()
    this.transport = transport || new FetchTransport({ host } as any)
    this.logger = Logger
    this.controller = new AbortController();
  }

  get username () {
    return this.currentLogin && this.currentLogin.username
  }

  loggedIn () {
    return Object.keys(this.currentLogin || {} as any).every((e: any) => e)
  }
/**
	* Do a request to an API endpoint.
	* If it needs a token, login first (with defaults) to set auth headers.
	* @param method   Request method GET | POST | PUT | DELETE
	* @param endpoint The API endpoint (including version) e.g. `chat.update`
	* @param data     Payload for POST request to endpoint
	* @param auth     Require auth headers for endpoint, default true
	* @param ignore   Allows certain matching error messages to not count as errors
	*/
  request = async (
		method: RestMethod,
		endpoint: string,
		data: any = {},
		auth: boolean = true,
    ignore?: RegExp,
    options?: any,
    apiVersion: string = 'v1'
	) => {
    this.logger && this.logger.debug(`[API] ${ method } ${ endpoint }: ${ JSON.stringify(data) }`)
    try {
      if (auth && !this.loggedIn()) {
        throw new Error('')
      }

      const { signal } = this.controller;

      const result = await this.transport.send({
        method,
        endpoint,
        data,
        options: { ...options, signal },
        apiVersion
      })

      if (!result) throw new Error(`API ${ method } ${ endpoint } result undefined`)
      if (!this.success(result, ignore)) throw result
      this.logger && this.logger.debug(`[API] ${method} ${endpoint} result ${result.status}`)
      const hasDataInsideResult = result && !result.data
      return (method === 'DELETE') && hasDataInsideResult ? result : result.data
    } catch (err) {
      this.logger && this.logger.error(`[API] POST error(${ endpoint }): ${ JSON.stringify(err) }`)
      throw err
    }
  }
	/** Do a POST request to an API endpoint. */
  post: IAPIRequest = (endpoint, data, auth, ignore, options = {}, apiVersion) => this.request('POST', endpoint, data, auth, ignore, options, apiVersion)

	/** Do a GET request to an API endpoint. */
  get: IAPIRequest = (endpoint, data, auth, ignore, options = {}, apiVersion) => this.request('GET', endpoint, data, auth, ignore, options, apiVersion)

	/** Do a PUT request to an API endpoint. */
  put: IAPIRequest = (endpoint, data, auth, ignore, options = {}, apiVersion) => this.request('PUT', endpoint, data, auth, ignore, options, apiVersion)

	/** Do a DELETE request to an API endpoint. */
  del: IAPIRequest = (endpoint, data, auth, ignore, options = {}, apiVersion) => this.request('DELETE', endpoint, data, auth, ignore, options, apiVersion)

  /** Abort all current API requests. */
  abort = (): void => this.controller.abort()

	/** Check result data for success, allowing override to ignore some errors */
  success (result: any, ignore?: RegExp) {
    return (
			typeof result.status === 'undefined' ||
			(result.status && regExpSuccess.test(result.status)) ||
			(result.status && ignore && ignore.test(result.status))
		) ? true : false
  }

  async login (credentials: ICredentials, args?: any): Promise<any> {
    const { data } = await this.post('login', { ...credentials, ...args })
    this.userId = data.userId
    this.currentLogin = {
      username: data.me.username,
      userId: data.userId,
      authToken: data.authToken,
      result: data
    }
    this.transport.headers = {
      'X-Auth-Token': data.authToken,
      'X-User-Id': data.userId
    }
    return data
  }
  async logout () {
    if (!this.currentLogin) {
      return null
    }
    const result = await this.post('logout', {}, true)
    this.userId = ''
    this.currentLogin = null
    return result
  }
/**
 * Structure message content, optionally addressing to room ID.
 * Accepts message text string or a structured message object.
 */
  prepareMessage (
	content: string | IMessage,
	rid?: string,
	args?: any
): Message {
    return new Message(content, { rid, roomId: rid, ...args })
  }
}
