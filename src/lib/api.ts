import { Client } from 'node-rest-client'
import * as settings from './settings'
import { logger } from './log'
import { IUserAPI } from '../utils/interfaces'

/** Result object from an API login */
export interface ILoginResultAPI {
  status: string // e.g. 'success'
  data: { authToken: string, userId: string }
}

/** Structure for passing and keeping login credentials */
export interface ILoginCredentials {
  username: string,
  password: string
}
export let currentLogin: {
  username: string,
  userId: string,
  authToken: string,
  result: ILoginResultAPI
} | null = null

/** Check for existing login */
export function loggedIn (): boolean {
  return (currentLogin !== null)
}

/** Initialise client and configs */
export const client = new Client()
export const host = settings.host

/**
 * Prepend protocol (or put back if removed from env settings for driver)
 * Hard code endpoint prefix, because all syntax depends on this version
 */
export const url = ((host.indexOf('http') === -1)
  ? host.replace(/^(\/\/)?/, 'http://')
  : host) + '/api/v1/'

/** Convert payload data to query string for GET requests */
export function getQueryString (data: any) {
  if (!data || typeof data !== 'object' || !Object.keys(data).length) return ''
  return '?' + Object.keys(data).map((k) => {
    const value = (typeof data[k] === 'object')
      ? JSON.stringify(data[k])
      : encodeURIComponent(data[k])
    return `${encodeURIComponent(k)}=${value}`
  }).join('&')
}

/** Setup default headers with empty auth for now */
export const basicHeaders = { 'Content-Type': 'application/json' }
export const authHeaders = { 'X-Auth-Token': '', 'X-User-Id': '' }

/** Populate auth headers (from response data on login) */
export function setAuth (authData: {authToken: string, userId: string}) {
  authHeaders['X-Auth-Token'] = authData.authToken
  authHeaders['X-User-Id'] = authData.userId
}

/** Join basic headers with auth headers if required */
export function getHeaders (authRequired = false) {
  if (!authRequired) return basicHeaders
  if (
    (!('X-Auth-Token' in authHeaders) || !('X-User-Id' in authHeaders)) ||
    authHeaders['X-Auth-Token'] === '' ||
    authHeaders['X-User-Id'] === ''
  ) {
    throw new Error('Auth required endpoint cannot be called before login')
  }
  return Object.assign({}, basicHeaders, authHeaders)
}

/** Clear headers so they can't be used without logging in again */
export function clearHeaders () {
  delete authHeaders['X-Auth-Token']
  delete authHeaders['X-User-Id']
}

/** Check result data for success, allowing override to ignore some errors */
export function success (result: any, ignore?: RegExp) {
  return (
    (
      typeof result.error === 'undefined' &&
      typeof result.status === 'undefined' &&
      typeof result.success === 'undefined'
    ) ||
    (result.status && result.status === 'success') ||
    (result.success && result.success === true) ||
    (ignore && result.error && !ignore.test(result.error))
  ) ? true : false
}

/**
 * Do a POST request to an API endpoint.
 * If it needs a token, login first (with defaults) to set auth headers.
 * @todo Look at why some errors return HTML (caught as buffer) instead of JSON
 * @param endpoint The API endpoint (including version) e.g. `chat.update`
 * @param data     Payload for POST request to endpoint
 * @param auth     Require auth headers for endpoint, default true
 * @param ignore   Allows certain matching error messages to not count as errors
 */
export async function post (
  endpoint: string,
  data: any,
  auth: boolean = true,
  ignore?: RegExp
): Promise<any> {
  try {
    logger.debug(`[API] POST: ${endpoint}`, JSON.stringify(data))
    if (auth && !loggedIn()) await login()
    let headers = getHeaders(auth)
    const result = await new Promise((resolve, reject) => {
      client.post(url + endpoint, { headers, data }, (result: any) => {
        if (Buffer.isBuffer(result)) reject('Result was buffer (HTML, not JSON)')
        else if (!success(result, ignore)) reject(result)
        else resolve(result)
      }).on('error', (err: Error) => reject(err))
    })
    logger.debug('[API] POST result:', result)
    return result
  } catch (err) {
    console.error(err)
    logger.error(`[API] POST error (${endpoint}):`, err)
  }
}

/**
 * Do a GET request to an API endpoint
 * @param endpoint   The API endpoint (including version) e.g. `users.info`
 * @param data       Object to serialise for GET request query string
 * @param auth       Require auth headers for endpoint, default true
 * @param ignore     Allows certain matching error messages to not count as errors
 */
export async function get (
  endpoint: string,
  data?: any,
  auth: boolean = true,
  ignore?: RegExp
): Promise<any> {
  try {
    logger.debug(`[API] GET: ${endpoint}`, data)
    if (auth && !loggedIn()) await login()
    let headers = getHeaders(auth)
    const query = getQueryString(data)
    const result = await new Promise((resolve, reject) => {
      client.get(url + endpoint + query, { headers }, (result: any) => {
        if (Buffer.isBuffer(result)) reject('Result was buffer (HTML, not JSON)')
        else if (!success(result, ignore)) reject(result)
        else resolve(result)
      }).on('error', (err: Error) => reject(err))
    })
    logger.debug('[API] GET result:', result)
    return result
  } catch (err) {
    logger.error(`[API] GET error (${endpoint}):`, err)
  }
}

/**
 * Login a user for further API calls
 * Result should come back with a token, to authorise following requests.
 * Use env default credentials, unless overridden by login arguments.
 */
export async function login (user: ILoginCredentials = {
  username: settings.username,
  password: settings.password
}): Promise<ILoginResultAPI> {
  logger.info(`[API] Logging in ${user.username}`)
  if (currentLogin !== null) {
    logger.debug(`[API] Already logged in`)
    if (currentLogin.username === user.username) {
      return currentLogin.result
    } else {
      await logout()
    }
  }
  const result = await post('login', user, false)
  if (result && result.data && result.data.authToken) {
    currentLogin = {
      result: result, // keep to return if login requested again for same user
      username: user.username, // keep to compare with following login attempt
      authToken: result.data.authToken,
      userId: result.data.userId
    }
    setAuth(currentLogin)
    logger.info(`[API] Logged in ID ${ currentLogin.userId }`)
    return result
  } else {
    throw new Error(`[API] Login failed for ${user.username}`)
  }
}

/** Logout a user at end of API calls */
export function logout () {
  if (currentLogin === null) {
    logger.debug(`[API] Already logged out`)
    return Promise.resolve()
  }
  logger.info(`[API] Logging out ${ currentLogin.username }`)
  return get('logout', null, true).then(() => {
    clearHeaders()
    currentLogin = null
  })
}

/** Defaults for user queries */
export const userFields = { name: 1, username: 1, status: 1, type: 1 }

/** Query helpers for user collection requests */
export const users: any = {
  all: (fields: any = userFields) => get('users.list', { fields }).then((r) => r.users),
  allNames: () => get('users.list', { fields: { 'username': 1 } }).then((r) => r.users.map((u: IUserAPI) => u.username)),
  allIDs: () => get('users.list', { fields: { '_id': 1 } }).then((r) => r.users.map((u: IUserAPI) => u._id)),
  online: (fields: any = userFields) => get('users.list', { fields, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users),
  onlineNames: () => get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u: IUserAPI) => u.username)),
  onlineIds: () => get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u: IUserAPI) => u._id))
}
