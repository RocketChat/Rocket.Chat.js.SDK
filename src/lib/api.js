"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var node_rest_client_1 = require("node-rest-client");
var settings = require("./settings");
var log_1 = require("./log");
var api_1 = require("../livechat/lib/api");
exports.livechat = api_1.livechat;
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
    return '?' + Object.keys(data).map(function (k) {
        var value = (typeof data[k] === 'object')
            ? JSON.stringify(data[k])
            : encodeURIComponent(data[k]);
        return encodeURIComponent(k) + "=" + value;
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
function getHeaders(authRequired) {
    if (authRequired === void 0) { authRequired = false; }
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
function post(endpoint, data, auth, ignore) {
    if (auth === void 0) { auth = true; }
    return __awaiter(this, void 0, void 0, function () {
        var headers_1, result, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    log_1.logger.debug("[API] POST: " + endpoint, JSON.stringify(data));
                    if (!(auth && !loggedIn())) return [3 /*break*/, 2];
                    return [4 /*yield*/, login()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    headers_1 = getHeaders(auth);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            exports.client.post(exports.url + endpoint, { headers: headers_1, data: data }, function (result) {
                                if (Buffer.isBuffer(result))
                                    reject('Result was buffer (HTML, not JSON)');
                                else if (!success(result, ignore))
                                    reject(result);
                                else
                                    resolve(result);
                            }).on('error', function (err) { return reject(err); });
                        })];
                case 3:
                    result = _a.sent();
                    log_1.logger.debug('[API] POST result:', result);
                    return [2 /*return*/, result];
                case 4:
                    err_1 = _a.sent();
                    console.error(err_1);
                    log_1.logger.error("[API] POST error (" + endpoint + "):", err_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
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
function get(endpoint, data, auth, ignore) {
    if (auth === void 0) { auth = true; }
    return __awaiter(this, void 0, void 0, function () {
        var headers_2, query_1, result, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    log_1.logger.debug("[API] GET: " + endpoint, data);
                    if (!(auth && !loggedIn())) return [3 /*break*/, 2];
                    return [4 /*yield*/, login()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    headers_2 = getHeaders(auth);
                    query_1 = getQueryString(data);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            exports.client.get(exports.url + endpoint + query_1, { headers: headers_2 }, function (result) {
                                if (Buffer.isBuffer(result))
                                    reject('Result was buffer (HTML, not JSON)');
                                else if (!success(result, ignore))
                                    reject(result);
                                else
                                    resolve(result);
                            }).on('error', function (err) { return reject(err); });
                        })];
                case 3:
                    result = _a.sent();
                    log_1.logger.debug('[API] GET result:', result);
                    return [2 /*return*/, result];
                case 4:
                    err_2 = _a.sent();
                    log_1.logger.error("[API] GET error (" + endpoint + "):", err_2);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.get = get;
/**
 * Do a PUT request to an API endpoint.
 * If it needs a token, login first (with defaults) to set auth headers.
 * @todo Look at why some errors return HTML (caught as buffer) instead of JSON
 * @param endpoint The API endpoint (including version) e.g. `chat.update`
 * @param data     Payload for PUT request to endpoint
 * @param auth     Require auth headers for endpoint, default true
 * @param ignore   Allows certain matching error messages to not count as errors
 */
function put(endpoint, data, auth, ignore) {
    if (auth === void 0) { auth = true; }
    return __awaiter(this, void 0, void 0, function () {
        var headers_3, result, err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    log_1.logger.debug("[API] PUT: " + endpoint, JSON.stringify(data));
                    if (!(auth && !loggedIn())) return [3 /*break*/, 2];
                    return [4 /*yield*/, login()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    headers_3 = getHeaders(auth);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            exports.client.put(exports.url + endpoint, { headers: headers_3, data: data }, function (result) {
                                if (Buffer.isBuffer(result))
                                    reject('Result was buffer (HTML, not JSON)');
                                else if (!success(result, ignore))
                                    reject(result);
                                else
                                    resolve(result);
                            }).on('error', function (err) { return reject(err); });
                        })];
                case 3:
                    result = _a.sent();
                    log_1.logger.debug('[API] PUT result:', result);
                    return [2 /*return*/, result];
                case 4:
                    err_3 = _a.sent();
                    console.error(err_3);
                    log_1.logger.error("[API] PUT error (" + endpoint + "):", err_3);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.put = put;
/**
 * Do a DELETE request to an API endpoint.
 * If it needs a token, login first (with defaults) to set auth headers.
 * @todo Look at why some errors return HTML (caught as buffer) instead of JSON
 * @param endpoint The API endpoint (including version) e.g. `chat.update`
 * @param data     Payload for DELETE request to endpoint
 * @param auth     Require auth headers for endpoint, default true
 * @param ignore   Allows certain matching error messages to not count as errors
 */
function del(endpoint, data, auth, ignore) {
    if (auth === void 0) { auth = true; }
    return __awaiter(this, void 0, void 0, function () {
        var headers_4, result, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    log_1.logger.debug("[API] DELETE: " + endpoint, JSON.stringify(data));
                    if (!(auth && !loggedIn())) return [3 /*break*/, 2];
                    return [4 /*yield*/, login()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    headers_4 = getHeaders(auth);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            exports.client["delete"](exports.url + endpoint, { headers: headers_4, data: data }, function (result) {
                                if (Buffer.isBuffer(result))
                                    reject('Result was buffer (HTML, not JSON)');
                                else if (!success(result, ignore))
                                    reject(result);
                                else
                                    resolve(result);
                            }).on('error', function (err) { return reject(err); });
                        })];
                case 3:
                    result = _a.sent();
                    log_1.logger.debug('[API] DELETE result:', result);
                    return [2 /*return*/, result];
                case 4:
                    err_4 = _a.sent();
                    console.error(err_4);
                    log_1.logger.error("[API] DELETE error (" + endpoint + "):", err_4);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.del = del;
/**
 * Login a user for further API calls
 * Result should come back with a token, to authorise following requests.
 * Use env default credentials, unless overridden by login arguments.
 */
function login(user) {
    if (user === void 0) { user = {
        username: settings.username,
        password: settings.password
    }; }
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log_1.logger.info("[API] Logging in " + user.username);
                    if (!(exports.currentLogin !== null)) return [3 /*break*/, 3];
                    log_1.logger.debug("[API] Already logged in");
                    if (!(exports.currentLogin.username === user.username)) return [3 /*break*/, 1];
                    return [2 /*return*/, exports.currentLogin.result];
                case 1: return [4 /*yield*/, logout()];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, post('login', user, false)];
                case 4:
                    result = _a.sent();
                    if (result && result.data && result.data.authToken) {
                        exports.currentLogin = {
                            result: result,
                            username: user.username,
                            authToken: result.data.authToken,
                            userId: result.data.userId
                        };
                        setAuth(exports.currentLogin);
                        log_1.logger.info("[API] Logged in ID " + exports.currentLogin.userId);
                        return [2 /*return*/, result];
                    }
                    else {
                        throw new Error("[API] Login failed for " + user.username);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
exports.login = login;
/** Logout a user at end of API calls */
function logout() {
    if (exports.currentLogin === null) {
        log_1.logger.debug("[API] Already logged out");
        return Promise.resolve();
    }
    log_1.logger.info("[API] Logging out " + exports.currentLogin.username);
    return get('logout', null, true).then(function () {
        clearHeaders();
        exports.currentLogin = null;
    });
}
exports.logout = logout;
/** Defaults for user queries */
exports.userFields = { name: 1, username: 1, status: 1, type: 1 };
/** Query helpers for user collection requests */
exports.users = {
    all: function (fields) {
        if (fields === void 0) { fields = exports.userFields; }
        return get('users.list', { fields: fields }).then(function (r) { return r.users; });
    },
    allNames: function () { return get('users.list', { fields: { 'username': 1 } }).then(function (r) { return r.users.map(function (u) { return u.username; }); }); },
    allIDs: function () { return get('users.list', { fields: { '_id': 1 } }).then(function (r) { return r.users.map(function (u) { return u._id; }); }); },
    online: function (fields) {
        if (fields === void 0) { fields = exports.userFields; }
        return get('users.list', { fields: fields, query: { 'status': { $ne: 'offline' } } }).then(function (r) { return r.users; });
    },
    onlineNames: function () { return get('users.list', { fields: { 'username': 1 }, query: { 'status': { $ne: 'offline' } } }).then(function (r) { return r.users.map(function (u) { return u.username; }); }); },
    onlineIds: function () { return get('users.list', { fields: { '_id': 1 }, query: { 'status': { $ne: 'offline' } } }).then(function (r) { return r.users.map(function (u) { return u._id; }); }); }
};
