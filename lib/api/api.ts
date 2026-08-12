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

export type RequestMethod = 'POST' | 'GET' | 'PUT' | 'DELETE'

export interface IClient {
  headers: any
  request (method: RequestMethod, url: string, data: any, options?: any, apiVersion?: string): Promise<any>
}

class Client implements IClient {
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

  getHeaders (options?: any) {
    return options && options.customHeaders ?
      options.customHeaders :
      this.headers
  }

  getBody (data: any) {
    return data instanceof FormData ?
      data :
      JSON.stringify(data)
  }

  getSignal (options?: any): AbortSignal {
    return options && options.signal;
  }

  request (method: RequestMethod, url: string, data: any, options?: any, apiVersion: string = 'v1'): Promise<any> {
    const carriesDataInQuery = method === 'GET'
    const query = carriesDataInQuery ? `?${this.getParams(data)}` : ''
    return fetch(`${this.host}/api/${apiVersion}/${encodeURI(url)}${query}`, {
      method,
      body: carriesDataInQuery ? undefined : this.getBody(data),
      headers: this.getHeaders(options),
      signal: this.getSignal(options)
    }).then(this.handle)
  }
  private async handle (r: any) {
    const { status } = r
    const data = await r.json()

    return { status, data }

  }
  private getParams (data: any) {
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
	* Provides a base client for handling requests with generic Rocket.Chat's REST API
	*/

export default class Api extends SDKEventEmitter {
  userId: string = ''
  logger: ILogger
  client: IClient
  currentLogin: {
    username: string,
    userId: string,
    authToken: string,
    result: ILoginResultAPI
  } | null = null
  controller: AbortController

  constructor ({ client, host }: any) {
    super()
    this.client = client || new Client({ host } as any)
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
	* @param method   Request method GET | POST | PUT | DEL
	* @param endpoint The API endpoint (including version) e.g. `chat.update`
	* @param data     Payload for POST request to endpoint
	* @param auth     Require auth headers for endpoint, default true
	* @param ignore   Allows certain matching error messages to not count as errors
	*/
  request = async (
		method: RequestMethod,
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

      const result = await this.client.request(
        method,
        endpoint,
        data,
        { ...options, signal: this.controller.signal },
        apiVersion
      )
      if (!result) throw new Error(`API ${ method } ${ endpoint } result undefined`)
      if (!this.success(result, ignore)) throw result
      this.logger && this.logger.debug(`[API] ${method} ${endpoint} result ${result.status}`)
      const carriesNoData = !result.data
      return (method === 'DELETE') && carriesNoData ? result : result.data
    } catch (err) {
      this.logger && this.logger.error(`[API] ${ method } error(${ endpoint }): ${ JSON.stringify(err) }`)
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

  /** Abort all in-flight API requests, leaving the client usable for new ones. */
  abort = (): void => {
    this.controller.abort()
    this.controller = new AbortController()
  }

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
    this.client.headers = {
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
