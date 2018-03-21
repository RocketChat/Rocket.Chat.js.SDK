"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_rest_client_1 = require("node-rest-client");
const config_1 = require("./config");
exports.api = new node_rest_client_1.Client();
// Prepare shortcuts for API requests / error handling
const basicHeaders = { 'Content-Type': 'application/json' };
const authHeaders = { 'X-Auth-Token': '', 'X-User-Id': '' };
const debug = (process.env.LOG_LEVEL === 'debug'); // allow override
exports.handle = (err) => {
    console.error('ERROR (API):', JSON.stringify(err));
    throw new Error(err.error || err.message || 'Unknown');
};
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
// Ignore param allows certain matching error messages to not count as errors
function post(endpoint, data, auth, ignore) {
    let headers = getHeaders(auth);
    if (debug)
        console.log(`POST: ${endpoint}`, JSON.stringify(data));
    return new Promise((resolve, reject) => {
        exports.api.post(config_1.apiHost + endpoint, { headers, data }, (result) => {
            if ((result.status && result.status !== 'success') ||
                (ignore && result.error && !ignore.test(result.error))) {
                reject(result);
            }
            else {
                if (result.data && result.data.authToken)
                    setAuth(result.data);
                if (debug)
                    console.log('RESULT:', JSON.stringify(result));
                resolve(result);
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
            if (result.status && result.status !== 'success') {
                reject(result);
            }
            else {
                if (debug)
                    console.log('RESULT:', JSON.stringify(result));
                resolve(result);
            }
        });
    }).catch(exports.handle);
}
exports.get = get;
// Login a user for further API calls
function login(user) {
    return post('/api/v1/login', user);
}
exports.login = login;
// Logout a user at end of API calls
function logout() {
    return get('/api/v1/logout', true);
}
exports.logout = logout;
//# sourceMappingURL=api.js.map