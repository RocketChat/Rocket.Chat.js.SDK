import { Client } from 'node-rest-client'
import { apiHost } from './config'
import { INewUserAPI, ILoginResultAPI } from './interfaces'

export const api = new Client()

// Prepare shortcuts for API requests / error handling
const basicHeaders = { 'Content-Type': 'application/json' }
const authHeaders = { 'X-Auth-Token': '', 'X-User-Id': '' }
const debug = (process.env.LOG_LEVEL === 'debug') // allow override
export const handle = (err: any) => {
  console.error('ERROR (API):', JSON.stringify(err))
  throw new Error(err.error || err.message || 'Unknown')
}

// Populate auth headers from response data
export function setAuth (authData: {authToken: string, userId: string}) {
  authHeaders['X-Auth-Token'] = authData.authToken
  authHeaders['X-User-Id'] = authData.userId
}

// Join basic headers with auth headers if required
export function getHeaders (authRequired = false) {
  if (!authRequired) return basicHeaders
  return Object.assign({}, basicHeaders, authHeaders)
}

// Do a POST request to an API endpoint
// If it happens to come back with a token, keep the token
// If it needs a token, use the token it kept (merges headers with auth)
// Ignore param allows certain matching error messages to not count as errors
export function post (endpoint: string, data: any, auth?: boolean, ignore?: RegExp): Promise<any> {
  let headers = getHeaders(auth)
  if (debug) console.log(`POST: ${endpoint}`, JSON.stringify(data))
  return new Promise((resolve, reject) => {
    api.post(apiHost + endpoint, { headers, data }, (result: any) => {
      if (
        (result.status && result.status !== 'success') ||
        (ignore && result.error && !ignore.test(result.error))
      ) {
        reject(result)
      } else {
        if (result.data && result.data.authToken) setAuth(result.data)
        if (debug) console.log('RESULT:', JSON.stringify(result))
        resolve(result)
      }
    })
  }).catch(handle)
}

// Do a GET request to an API endpoint
export function get (endpoint: string, auth: boolean): Promise<any> {
  let headers = getHeaders(auth)
  if (debug) console.log(`GET: ${endpoint}`)
  return new Promise((resolve, reject) => {
    api.get(apiHost + endpoint, { headers }, (result: any) => {
      if (result.status && result.status !== 'success') {
        reject(result)
      } else {
        if (debug) console.log('RESULT:', JSON.stringify(result))
        resolve(result)
      }
    })
  }).catch(handle)
}

// Login a user for further API calls
export function login (user: INewUserAPI): Promise<ILoginResultAPI | undefined> {
  return post('/api/v1/login', user)
}

// Logout a user at end of API calls
export function logout () {
  return get('/api/v1/logout', true)
}
