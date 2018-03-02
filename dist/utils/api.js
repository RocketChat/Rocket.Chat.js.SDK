"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_rest_client_1 = require("node-rest-client");
const config_1 = require("./config");
exports.api = new node_rest_client_1.Client();
// Prepare shortcuts for API requests / error handling
const basicHeaders = { 'Content-Type': 'application/json' };
const authHeaders = { 'X-Auth-Token': '', 'X-User-Id': '' };
const debug = (process.env.LOG_LEVEL === 'debug');
exports.handle = (err) => console.error('ERROR (API):', JSON.stringify(err));
// Populate auth headers from response data
function setAuth(authData) {
    authHeaders['X-Auth-Token'] = authData.authToken;
    authHeaders['X-User-Id'] = authData.userId;
}
exports.setAuth = setAuth;
// Join basic headers with auth headers if required
function getHeaders(authRequired = false) {
    if (!authRequired)
        return basicHeaders;
    return Object.assign({}, basicHeaders, authHeaders);
}
exports.getHeaders = getHeaders;
// Do a POST request to an API endpoint
// If it happens to come back with a token, keep the token
// If it needs a token, use the token it kept (merges headers with auth)
function post(endpoint, data, auth) {
    let headers = getHeaders(auth);
    if (debug)
        console.log(`POST: ${endpoint}`, JSON.stringify(data));
    return new Promise((resolve, reject) => {
        exports.api.post(config_1.apiHost + endpoint, { headers, data }, (result) => {
            if (result.status !== 'success') {
                reject(result);
            }
            else {
                if (result.data.hasOwnProperty('authToken'))
                    setAuth(result.data);
                if (debug)
                    console.log('RESULT:', JSON.stringify(result));
                resolve(result.data);
            }
        });
    }).catch(exports.handle);
}
exports.post = post;
// Do a GET request to an API endpoint
function get(endpoint, auth) {
    let headers = getHeaders(auth);
    if (debug)
        console.log(`GET: ${endpoint}`);
    return new Promise((resolve, reject) => {
        exports.api.get(config_1.apiHost + endpoint, { headers }, (result) => {
            if (result.status !== 'success') {
                reject(result);
            }
            else {
                if (debug)
                    console.log('RESULT:', JSON.stringify(result));
                resolve(result.data);
            }
        });
    }).catch(exports.handle);
}
exports.get = get;
//# sourceMappingURL=api.js.map