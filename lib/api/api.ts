import { logger as Logger } from '../log'

import {
	ILogger,
	ICurrentLogin,
	IAPIRequest,
	IMessage,
	ILoginCredentials,
	ILoginData,
	ILoginResult
} from '../../interfaces'

import { Message } from '../message'

import { SDKEventEmitter } from '../emitter'
import * as settings from '../settings';

/** Check for existing login */
// export function loggedIn () {
//   return (currentLogin !== null)
// }

/**
	* Prepend protocol (or put back if removed from env settings for driver)
	* Hard code endpoint prefix, because all syntax depends on this version
	*/
// export const url = `${(host.indexOf('http') === -1) ? host.replace(/^(\/\/)?/, 'http://') : host}/api/v1/`

/** Populate auth headers (from response data on login) */
// export function setAuth (authData: {authToken: string, userId: string}) {
//   client.defaults.headers.common['X-Auth-Token'] = authData.authToken
//   client.defaults.headers.common['X-User-Id'] = authData.userId
// }

// /** Clear headers so they can't be used without logging in again */
// export function clearHeaders () {
//   delete client.defaults.headers.common['X-Auth-Token']
//   delete client.defaults.headers.common['X-User-Id']
// }

// /**
// 	* Login a user for further API calls
// 	* Result should come back with a token, to authorise following requests.
// 	* Use env default credentials, unless overridden by login arguments.
// 	*/
// export async function login (user: ICredentialsAPI = { username, password }) {
//   this.logger.info(`[API] Logging in ${user.username}`)
//   if (currentLogin !== null) {
//     this.logger.debug(`[API] Already logged in`)
//     if (currentLogin.username === user.username) return currentLogin.result
//     else await logout()
//   }
//   const result = (await this.post('login', user, false) as ILoginResultAPI)
//   if (result && result.data && result.data.authToken) {
//     currentLogin = {
//       result: result, // keep to return if login requested again for same user
//       username: user.username, // keep to compare with following login attempt
//       authToken: result.data.authToken,
//       userId: result.data.userId
//     }
//     setAuth(currentLogin)
//     this.logger.info(`[API] Logged in ID ${currentLogin.userId}`)
//     return result
//   } else {
//     throw new Error(`[API] Login failed for ${user.username}`)
//   }
// }

// /** Logout a user at end of API calls */
// export function logout () {
//   if (currentLogin === null) {
//     this.logger.debug(`[API] Already logged out`)
//     return Promise.resolve()
//   }
//   this.logger.info(`[API] Logging out ${ currentLogin.username }`)
//   return this.get('logout', null, true).then(() => {
//     clearHeaders()
//     currentLogin = null
//   })
// }

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

  _headers: any = {}

  constructor ({ host = 'http://localhost:3000' }: { host?: string }) {
    this.host = host
  }

  set headers (obj: any) {
    this._headers = obj
  }
  get headers (): any {
    return this._headers
  }

  getHeaders (options?: any) {
    return options && options.customHeaders ?
      options.customHeaders :
      {
        'Content-Type': 'application/json',
        ...settings.customHeaders,
        ...this._headers
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

  get (endpoint: string, data: any, options?: any, apiVersion: string = 'v1'): Promise<any> {
    return fetch(`${this.host}/api/${apiVersion}/${encodeURI(endpoint)}?${this.getParams(data)}`, {
      method: 'GET',
      headers: this.getHeaders(options),
      signal: this.getSignal(options)
    }).then(this.handle)
  }
  post (endpoint: string, data: any, options?: any, apiVersion: string = 'v1'): Promise<any> {
    return fetch(`${this.host}/api/${apiVersion}/${encodeURI(endpoint)}`, {
      method: 'POST',
      body: this.getBody(data),
      headers: this.getHeaders(options),
      signal: this.getSignal(options)
    }).then(this.handle)
  }
  put (endpoint: string, data: any, options?: any, apiVersion: string = 'v1'): Promise<any> {
    return fetch(`${this.host}/api/${apiVersion}/${encodeURI(endpoint)}`, {
      method: 'PUT',
      body: this.getBody(data),
      headers: this.getHeaders(options),
      signal: this.getSignal(options)
    }).then(this.handle)
  }

  delete (endpoint: string, data?: any, options?: any, apiVersion: string = 'v1'): Promise<any> {
    return fetch(`${this.host}/api/${apiVersion}/${encodeURI(endpoint)}`, {
      method: 'DELETE',
      body: this.getBody(data),
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

export interface IApiOptions {
  client?: IClient
  host?: string
  logger?: ILogger
}

export const regExpSuccess = /(?!([45][0-9][0-9]))\d{3}/

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
	* @param auth     Require auth headers for endpoint, default true
	* @param ignore   Allows certain matching error messages to not count as errors
	*/
  request = async (
		method: 'POST' | 'GET' | 'PUT' | 'DELETE',
		endpoint: string,
		data: any = {},
		auth: boolean = true,
    ignore?: RegExp,
    options?: any,
    apiVersion: string = 'v1'
	) => {
    this.logger?.debug(`[API] ${ method } ${ endpoint }: ${ JSON.stringify(data) }`)
    try {
      if (auth && !this.loggedIn()) {
        throw new Error(`API ${ method } ${ endpoint } requires a login`)
      }

      const { signal } = this.controller;
      options = { ...options, signal };

      let result
      switch (method) {
        case 'GET': result = await this.client.get(endpoint, data, options, apiVersion); break
        case 'PUT': result = await this.client.put(endpoint, data, options, apiVersion); break
        case 'DELETE': result = await this.client.delete(endpoint, data, options, apiVersion); break
        default:
        case 'POST': result = await this.client.post(endpoint, data, options, apiVersion); break
      }
      if (!result) throw new Error(`API ${ method } ${ endpoint } result undefined`)
      if (!this.success(result, ignore)) throw result
      this.logger?.debug(`[API] ${method} ${endpoint} result ${result.status}`)
      const hasDataInsideResult = result && !result.data
      return (method === 'DELETE') && hasDataInsideResult ? result : result.data
    } catch (err) {
      this.logger?.error(`[API] ${ method } error(${ endpoint }): ${ JSON.stringify(err) }`)
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

  /** Abort all current API requests, leaving the next request free to run. */
  abort = (): void => {
    const aborting = this.controller
    this.controller = new AbortController()
    aborting.abort()
  }

	/** Check result data for success, allowing override to ignore some errors */
  success (result: any, ignore?: RegExp) {
    return (
			typeof result.status === 'undefined' ||
			(result.status && regExpSuccess.test(result.status)) ||
			(result.status && ignore && ignore.test(result.status))
		) ? true : false
  }

  async login (credentials: ILoginCredentials, args?: any): Promise<ILoginData | ILoginResult | null> {
    const { data }: { data: ILoginData } = await this.post('login', { ...credentials, ...args }, false)
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
    const result = await this.post('logout', {}, true)
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
): Message {
    return new Message(content, { rid, roomId: rid, ...args })
  }
}
