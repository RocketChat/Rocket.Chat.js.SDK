import { Client } from 'node-rest-client'
import { apiHost } from './config'

export const api = new Client()

// Prepare shortcuts for API requests / error handling
const basicHeaders = { 'Content-Type': 'application/json' }
const authHeaders = { 'X-Auth-Token': '', 'X-User-Id': '' }
const debug = (process.env.LOG_LEVEL === 'debug')
export const handle = (err: Error) => console.error('ERROR (API):', JSON.stringify(err))

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
export function post (endpoint: string, data: any, auth?: boolean): Promise<any> {
  let headers = getHeaders(auth)
  if (debug) console.log(`POST: ${endpoint}`, JSON.stringify(data))
  return new Promise((resolve, reject) => {
    api.post(apiHost + endpoint, { headers, data }, (result: any) => {
      if (result.status !== 'success') {
        reject(result)
      } else {
        if (result.data.hasOwnProperty('authToken')) setAuth(result.data)
        if (debug) console.log('RESULT:', JSON.stringify(result))
        resolve(result.data)
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
      if (result.status !== 'success') {
        reject(result)
      } else {
        if (debug) console.log('RESULT:', JSON.stringify(result))
        resolve(result.data)
      }
    })
  }).catch(handle)
}
