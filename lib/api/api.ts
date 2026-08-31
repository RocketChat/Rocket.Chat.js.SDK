import { logger as Logger } from '../log'

import {
	ILogger,
	ICurrentLogin,
	IAPIRequest,
	IMessage,
	ILoginCredentials,
	ILoginData
} from '../../interfaces'

import { SDKEventEmitter } from '../emitter'
import * as settings from '../settings';

export interface IClient {
  host: string
  headers: any
  get (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any>
  post (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any>
  put (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any>
  delete (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any>
}

class Client implements IClient {
  host: string

  headers: any = {}

  constructor ({ host = 'http://localhost:3000' }: { host?: string }) {
    this.host = host
  }

  getHeaders (options?: any) {
    return options && options.customHeaders ?
      options.customHeaders :
      {
        'Content-Type': 'application/json',
        ...settings.customHeaders,
        ...this.headers
      }
  }

  getBody (data: any) {
    return data instanceof FormData ?
      data :
      JSON.stringify(data)
  }

  getSignal (options?: any): AbortSignal {
    return options && options.signal;
  }

  private request (method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, data: any, options?: any, apiVersion: string = 'v1'): Promise<any> {
    const query = method === 'GET' ? `?${this.getParams(data)}` : ''
    return fetch(`${this.host}/api/${apiVersion}/${encodeURI(endpoint)}${query}`, {
      method,
      ...(method === 'GET' ? {} : { body: this.getBody(data) }),
      headers: this.getHeaders(options),
      signal: this.getSignal(options)
    }).then(this.handle)
  }

  get (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.request('GET', endpoint, data, options, apiVersion)
  }
  post (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.request('POST', endpoint, data, options, apiVersion)
  }
  put (endpoint: string, data: any, options?: any, apiVersion?: string): Promise<any> {
    return this.request('PUT', endpoint, data, options, apiVersion)
  }
  delete (endpoint: string, data?: any, options?: any, apiVersion?: string): Promise<any> {
    return this.request('DELETE', endpoint, data, options, apiVersion)
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

export interface IApiOptions {
  client?: IClient
  host?: string
  logger?: ILogger
}

export const regExpSuccess = /(?!([45][0-9][0-9]))\d{3}/

const clientVerbs: { [method: string]: 'get' | 'put' | 'delete' } = { GET: 'get', PUT: 'put', DELETE: 'delete' }

const authTokenHeader = 'X-Auth-Token'
const userIdHeader = 'X-User-Id'

/**
	* @module API
	* Provides a base client for handling requests with generic Rocket.Chat's REST API
	*/

export default class Api extends SDKEventEmitter {
  userId: string = ''
  logger: ILogger
  client: IClient
  currentLogin: ICurrentLogin | null = null
  controller: AbortController

  constructor ({ client, host, logger = Logger }: IApiOptions) {
    super()
    this.client = client || new Client({ host })
    this.logger = logger
    this.controller = new AbortController();
  }

  get username () {
    return this.currentLogin && this.currentLogin.username
  }

  loggedIn () {
    return this.currentLogin !== null
  }
/**
	* Do a request to an API endpoint.
	* @param method   Request method GET | POST | PUT | DEL
	* @param endpoint The API endpoint (including version) e.g. `chat.update`
	* @param data     Payload for POST request to endpoint
	* @param ignore   Allows certain matching error messages to not count as errors
	*/
  request = async (
		method: 'POST' | 'GET' | 'PUT' | 'DELETE',
		endpoint: string,
		data: any = {},
    ignore?: RegExp,
    options?: any,
    apiVersion: string = 'v1'
	) => {
    this.logger?.debug(`[API] ${ method } ${ endpoint }:`, data)
    try {
      const { signal } = this.controller;
      const requestOptions = { ...options, signal };
      const verb = clientVerbs[method] ?? 'post'

      const result = await this.client[verb](endpoint, data, requestOptions, apiVersion)
      if (!result) throw new Error(`API ${ method } ${ endpoint } result undefined`)
      if (!this.success(result, ignore)) throw result
      this.logger?.debug(`[API] ${method} ${endpoint} result ${result.status}`)
      return method === 'DELETE' && !result.data ? result : result.data
    } catch (err) {
      this.logger?.error(`[API] ${ method } error(${ endpoint }):`, err)
      throw err
    }
  }
	/** Do a POST request to an API endpoint. */
  post: IAPIRequest = (endpoint, data, ignore, options = {}, apiVersion) => this.request('POST', endpoint, data, ignore, options, apiVersion)

	/** Do a GET request to an API endpoint. */
  get: IAPIRequest = (endpoint, data, ignore, options = {}, apiVersion) => this.request('GET', endpoint, data, ignore, options, apiVersion)

	/** Do a PUT request to an API endpoint. */
  put: IAPIRequest = (endpoint, data, ignore, options = {}, apiVersion) => this.request('PUT', endpoint, data, ignore, options, apiVersion)

	/** Do a DELETE request to an API endpoint. */
  del: IAPIRequest = (endpoint, data, ignore, options = {}, apiVersion) => this.request('DELETE', endpoint, data, ignore, options, apiVersion)

  /** Abort all current API requests, leaving the next request free to run. */
  abort = (): void => {
    const aborting = this.controller
    this.controller = new AbortController()
    aborting.abort()
  }

	/** Check result data for success, allowing override to ignore some errors */
  success (result: any, ignore?: RegExp) {
    return Boolean(
			typeof result.status === 'undefined' ||
			(result.status && regExpSuccess.test(result.status)) ||
			(result.status && ignore && ignore.test(result.status))
		)
  }

  async loginWithRest (credentials: ILoginCredentials, loginFields?: any): Promise<ILoginData> {
    const { data }: { data: ILoginData } = await this.post('login', { ...credentials, ...loginFields })
    this.setLogin({
      username: data.me.username ?? null,
      userId: data.userId,
      authToken: data.authToken,
      result: data
    })
    return data
  }

  resumeLogin ({ userId, authToken }: Pick<ICurrentLogin, 'userId' | 'authToken'>) {
    const previous = this.currentLogin?.userId === userId ? this.currentLogin : null
    if (previous?.authToken === authToken) {
      return
    }
    this.setLogin({
      username: previous?.username ?? null,
      userId,
      authToken,
      result: null
    })
  }

  private setLogin (login: ICurrentLogin) {
    this.userId = login.userId
    this.currentLogin = login
    this.client.headers = {
      ...this.client.headers,
      [authTokenHeader]: login.authToken,
      [userIdHeader]: login.userId
    }
  }

  private clearLogin () {
    this.userId = ''
    this.currentLogin = null
    const headers = { ...this.client.headers }
    delete headers[authTokenHeader]
    delete headers[userIdHeader]
    this.client.headers = headers
  }

  async logout () {
    if (!this.currentLogin) {
      return null
    }
    const result = await this.post('logout', {})
    this.clearLogin()
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
): IMessage {
    const { integrationId, ...others } = { rid, roomId: rid, ...args }
    const message: IMessage = typeof content === 'string'
      ? { msg: content, ...others }
      : { ...content, ...others }
    if (integrationId) {
      message.bot = { i: integrationId }
    }
    return message
  }
}
