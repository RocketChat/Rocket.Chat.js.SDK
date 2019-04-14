"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_rest_client_1 = require("node-rest-client");
const settings = __importStar(require("./settings"));
const log_1 = require("./log");
exports.currentLogin = null;
/** Check for existing login */
function loggedIn() {
    return (exports.currentLogin !== null);
}
exports.loggedIn = loggedIn;
/** Initialise client and configs */
exports.client = new node_rest_client_1.Client();
exports.host = settings.host;
/**
 * Prepend protocol (or put back if removed from env settings for driver)
 * Hard code endpoint prefix, because all syntax depends on this version
 */
exports.url = ((exports.host.indexOf('http') === -1)
    ? exports.host.replace(/^(\/\/)?/, 'http://')
    : exports.host) + '/api/v1/';
/** Convert payload data to query string for GET requests */
function getQueryString(data) {
    if (!data || typeof data !== 'object' || !Object.keys(data).length)
        return '';
    return '?' + Object.keys(data).map((k) => {
        const value = (typeof data[k] === 'object')
            ? JSON.stringify(data[k])
            : encodeURIComponent(data[k]);
        return `${encodeURIComponent(k)}=${value}`;
    }).join('&');
}
exports.getQueryString = getQueryString;
/** Setup default headers with empty auth for now */
exports.basicHeaders = { 'Content-Type': 'application/json' };
exports.authHeaders = { 'X-Auth-Token': '', 'X-User-Id': '' };
/** Populate auth headers (from response data on login) */
function setAuth(authData) {
    exports.authHeaders['X-Auth-Token'] = authData.authToken;
    exports.authHeaders['X-User-Id'] = authData.userId;
}
exports.setAuth = setAuth;
/** Join basic headers with auth headers if required */
function getHeaders(authRequired = false) {
    if (!authRequired)
        return exports.basicHeaders;
    if ((!('X-Auth-Token' in exports.authHeaders) || !('X-User-Id' in exports.authHeaders)) ||
        exports.authHeaders['X-Auth-Token'] === '' ||
        exports.authHeaders['X-User-Id'] === '') {
        throw new Error('Auth required endpoint cannot be called before login');
    }
    return Object.assign({}, exports.basicHeaders, exports.authHeaders);
}
exports.getHeaders = getHeaders;
/** Clear headers so they can't be used without logging in again */
function clearHeaders() {
    delete exports.authHeaders['X-Auth-Token'];
    delete exports.authHeaders['X-User-Id'];
}
exports.clearHeaders = clearHeaders;
/** Check result data for success, allowing override to ignore some errors */
function success(result, ignore) {
    return ((typeof result.error === 'undefined' &&
        typeof result.status === 'undefined' &&
        typeof result.success === 'undefined') ||
        (result.status && result.status === 'success') ||
        (result.success && result.success === true) ||
        (ignore && result.error && !ignore.test(result.error))) ? true : false;
}
exports.success = success;
/**
 * Do a POST request to an API endpoint.
 * If it needs a token, login first (with defaults) to set auth headers.
 * @todo Look at why some errors return HTML (caught as buffer) instead of JSON
 * @param endpoint The API endpoint (including version) e.g. `chat.update`
 * @param data     Payload for POST request to endpoint
 * @param auth     Require auth headers for endpoint, default true
 * @param ignore   Allows certain matching error messages to not count as errors
 */
function post(endpoint, data, auth = true, ignore) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            log_1.logger.debug(`[API] POST: ${endpoint}`, JSON.stringify(data));
            if (auth && !loggedIn())
                yield login();
            let headers = getHeaders(auth);
            const result = yield new Promise((resolve, reject) => {
                exports.client.post(exports.url + endpoint, { headers, data }, (result) => {
                    if (Buffer.isBuffer(result))
                        reject('Result was buffer (HTML, not JSON)');
                    else if (!success(result, ignore))
                        reject(result);
                    else
                        resolve(result);
                }).on('error', (err) => reject(err));
            });
            log_1.logger.debug('[API] POST result:', result);
            return result;
        }
        catch (err) {
            console.error(err);
            log_1.logger.error(`[API] POST error (${endpoint}):`, err);
        }
    });
}
exports.post = post;
/**
 * Do a GET request to an API endpoint
 * @param endpoint   The API endpoint (including version) e.g. `users.info`
 * @param data       Object to serialise for GET request query string
 * @param auth       Require auth headers for endpoint, default true
 * @param ignore     Allows certain matching error messages to not count as errors
 */
function get(endpoint, data, auth = true, ignore) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            log_1.logger.debug(`[API] GET: ${endpoint}`, data);
            if (auth && !loggedIn())
                yield login();
            let headers = getHeaders(auth);
            const query = getQueryString(data);
            const result = yield new Promise((resolve, reject) => {
                exports.client.get(exports.url + endpoint + query, { headers }, (result) => {
                    if (Buffer.isBuffer(result))
                        reject('Result was buffer (HTML, not JSON)');
                    else if (!success(result, ignore))
                        reject(result);
                    else
                        resolve(result);
                }).on('error', (err) => reject(err));
            });
            log_1.logger.debug('[API] GET result:', result);
            return result;
        }
        catch (err) {
            log_1.logger.error(`[API] GET error (${endpoint}):`, err);
        }
    });
}
exports.get = get;
/**
 * Login a user for further API calls
 * Result should come back with a token, to authorise following requests.
 * Use env default credentials, unless overridden by login arguments.
 */
function login(user = {
    username: settings.username,
    password: settings.password
}) {
    return __awaiter(this, void 0, void 0, function* () {
        log_1.logger.info(`[API] Logging in ${user.username}`);
        if (exports.currentLogin !== null) {
            log_1.logger.debug(`[API] Already logged in`);
            if (exports.currentLogin.username === user.username) {
                return exports.currentLogin.result;
            }
            else {
                yield logout();
            }
        }
        const result = yield post('login', user, false);
        if (result && result.data && result.data.authToken) {
            exports.currentLogin = {
                result: result,
                username: user.username,
                authToken: result.data.authToken,
                userId: result.data.userId
            };
            setAuth(exports.currentLogin);
            log_1.logger.info(`[API] Logged in ID ${exports.currentLogin.userId}`);
            return result;
        }
        else {
            throw new Error(`[API] Login failed for ${user.username}`);
        }
    });
}
exports.login = login;
/** Logout a user at end of API calls */
function logout() {
    if (exports.currentLogin === null) {
        log_1.logger.debug(`[API] Already logged out`);
        return Promise.resolve();
    }
    log_1.logger.info(`[API] Logging out ${exports.currentLogin.username}`);
    return get('logout', null, true).then(() => {
        clearHeaders();
        exports.currentLogin = null;
    });
}
exports.logout = logout;
/** Defaults for user queries */
exports.userFields = { name: 1, username: 1, status: 1, type: 1 };
/** Query helpers for user collection requests */
exports.users = {
    all: (fields = exports.userFields) => get('users.list', { fields }).then((r) => r.users),
    allNames: () => get('users.list', { fields: { 'username': 1 } }).then((r) => r.users.map((u) => u.username)),
    allIDs: () => get('users.list', { fields: { '_id': 1 } }).then((r) => r.users.map((u) => u._id)),
    online: (fields = exports.userFields) => get('users.list', { fields, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users),
    onlineNames: () => get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u) => u.username)),
    onlineIds: () => get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then((r) => r.users.map((u) => u._id))
};
//# sourceMappingURL=api.js.map