const { Client } = require('node-rest-client')
const { apiHost } = require('./config')
const api = new Client()

// Prepare shortcuts for API requests / error handling
const basicHeaders = { 'Content-Type': 'application/json' }
const authHeaders = { 'X-Auth-Token': null, 'X-User-Id': null }
const handle = (err) => console.error('ERROR (API):', err)
const debug = (process.env.LOG_LEVEL === 'debug')

// Populate auth headers from response data
function setAuth (authData) {
  authHeaders['X-Auth-Token'] = authData.authToken
  authHeaders['X-User-Id'] = authData.userId
}

// Join basic headers with auth headers if required
function getHeaders (authRequired=false) {
  if (!authRequired) return basicHeaders
  return Object.assign({}, basicHeaders, authHeaders)
}

// Do a POST request to an API endpoint
// If it happens to come back with a token, keep the token
// If it needs a token, use the token it kept (merges headers with auth)
const post = (endpoint, data, auth) => {
  let headers = getHeaders(auth)
  if (debug) console.log(`POST: ${endpoint}`, data)
  return new Promise((resolve, reject) => {
    api.post(apiHost+endpoint, { headers, data }, (result) => {
      if (result.status !== 'success') {
        reject(result.message)
      } else {
        if (result.data.hasOwnProperty('authToken')) setAuth(result.data)
        if (debug) console.log('RESULT:', result)
        resolve(result.data)
      }
    })
  }).catch(handle)
}

// Do a GET request to an API endpoint
const get = (endpoint, auth) => {
  let headers = getHeaders(auth)
  if (debug) console.log(`GET: ${endpoint}`)
  return new Promise((resolve, reject) => {
    api.get(apiHost+endpoint, { headers }, (result) => {
      if (result.status !== 'success') {
        reject(result.message)
      } else {
        if (debug) console.log('RESULT:', result)
        resolve(result.data)
      }
    })
  }).catch(handle)
}

module.exports = {
  get,
  post,
  handle
}