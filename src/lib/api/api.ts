import { logger as Logger } from '../log'

import {
	ILogger,
	ILoginResultAPI,
	IAPIRequest,
	IMessage,
	ICredentials
} from '../../interfaces'

import { Message } from '../message'

import { EventEmitter } from 'tiny-events'
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
  headers: any
  get (url: string, data: any, options?: any): Promise<any>
  post (url: string, data: any, options?: any): Promise<any>
  put (url: string, data: any, options?: any): Promise<any>
  delete (url: string, data: any, options?: any): Promise<any>
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

  get (url: string, data: any, options?: any): Promise<any> {
    return fetch(`${this.host}/api/v1/${encodeURI(url)}?${this.getParams(data)}`, {
      method: 'GET',
      headers: this.getHeaders(options)
    }).then(this.handle)
  }
  post (url: string, data: any, options?: any): Promise<any> {
    return fetch(`${this.host}/api/v1/${encodeURI(url)}`, {
      method: 'POST',
      body: this.getBody(data),
      headers: this.getHeaders(options)
    }).then(this.handle)
  }
  put (url: string, data: any, options?: any): Promise<any> {
    return fetch(`${this.host}/api/v1/${encodeURI(url)}`, {
      method: 'PUT',
      body: this.getBody(data),
      headers: this.getHeaders(options)
    }).then(this.handle)
  }

  delete (url: string, data?: any, options?: any): Promise<any> {
    return fetch(`${this.host}/api/v1/${encodeURI(url)}`, {
      method: 'DELETE',
      body: this.getBody(data),
      headers: this.getHeaders(options)
    }).then(this.handle)
  }
  private async handle (r: any) {
    const { status } = r
    const data = await r.json()

    return { status, data }

  }
  private getParams (data: any) {
    return Object.keys(data).map(function (k) {
      return encodeURIComponent(k) + '=' + (typeof data[k] === 'object' ? encodeURIComponent(JSON.stringify(data[k])) : encodeURIComponent(data[k]))
    }).join('&')
  }
}

export const regExpSuccess = /(?!([45][0-9][0-9]))\d{3}/

/**
	* @module API
	* Provides a base client for handling requests with generic Rocket.Chat's REST API
	*/

export default class Api extends EventEmitter {
  userId: string = ''
  logger: ILogger
  client: IClient
  currentLogin: {
    username: string,
    userId: string,
    authToken: string,
    result: ILoginResultAPI
  } | null = null

  constructor ({ client, host, logger = Logger }: any) {
    super()
    this.client = client || new Client({ host } as any)
    this.logger = Logger
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
		method: 'POST' | 'GET' | 'PUT' | 'DELETE',
		endpoint: string,
		data: any = {},
		auth: boolean = true,
    ignore?: RegExp,
    options?: any
	) => {
    this.logger && this.logger.debug(`[API] ${ method } ${ endpoint }: ${ JSON.stringify(data) }`)
    try {
      if (auth && !this.loggedIn()) {
        throw new Error('')
      }
      let result
      switch (method) {
        case 'GET': result = await this.client.get(endpoint, data, options); break
        case 'PUT': result = await this.client.put(endpoint, data, options); break
        case 'DELETE': result = await this.client.delete(endpoint, data, options); break
        default:
        case 'POST': result = await this.client.post(endpoint, data, options); break
      }
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
  post: IAPIRequest = (endpoint, data, auth, ignore, options = {}) => this.request('POST', endpoint, data, auth, ignore, options)

	/** Do a GET request to an API endpoint. */
  get: IAPIRequest = (endpoint, data, auth, ignore, options = {}) => this.request('GET', endpoint, data, auth, ignore, options)

	/** Do a PUT request to an API endpoint. */
  put: IAPIRequest = (endpoint, data, auth, ignore, options = {}) => this.request('PUT', endpoint, data, auth, ignore, options)

	/** Do a DELETE request to an API endpoint. */
  del: IAPIRequest = (endpoint, data, auth, ignore, options = {}) => this.request('DELETE', endpoint, data, auth, ignore, options)

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
