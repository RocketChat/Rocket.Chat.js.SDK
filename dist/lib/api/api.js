"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const log_1 = require("../log");
const message_1 = require("../message");
const tiny_events_1 = require("tiny-events");
class Client {
    constructor({ host = 'http://localhost:3000' }) {
        this._headers = {};
        this.host = host;
    }
    set headers(obj) {
        this._headers = obj;
    }
    get headers() {
        return Object.assign({ 'Content-Type': 'application/json' }, this._headers);
    }
    get(url, data, options) {
        return fetch(`${this.host}/api/v1/${url}?${this.getParams(data)}`, {
            method: 'GET',
            headers: this.headers
        }).then(this.handle);
    }
    post(url, data, options) {
        return fetch(`${this.host}/api/v1/${url}`, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: this.headers
        }).then(this.handle);
    }
    put(url, data, options) {
        return fetch(`${this.host}/api/v1/${url}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            headers: this.headers
        }).then(this.handle);
    }
    delete(url, options) {
        return fetch(`${this.host}/api/v1/${url}`, {
            method: 'DEL',
            headers: this.headers
        }).then(this.handle);
    }
    handle(r) {
        return __awaiter(this, void 0, void 0, function* () {
            const { status } = r;
            const data = yield r.json();
            return { status, data };
        });
    }
    getParams(data) {
        return Object.keys(data).map(function (k) {
            return encodeURIComponent(k) + '=' + (typeof data[k] === 'object' ? JSON.stringify(data[k]) : encodeURIComponent(data[k]));
        }).join('&');
    }
}
exports.regExpSuccess = /(?!([45][0-9][0-9]))\d{3}/;
/**
    * @module API
    * Provides a base client for handling requests with generic Rocket.Chat's REST API
    */
class Api extends tiny_events_1.EventEmitter {
    constructor({ client, host, logger = log_1.logger }) {
        super();
        this.currentLogin = null;
        /** Do a POST request to an API endpoint. */
        this.post = (endpoint, data, auth, ignore) => this.request('POST', endpoint, data, auth, ignore);
        /** Do a GET request to an API endpoint. */
        this.get = (endpoint, data, auth, ignore) => this.request('GET', endpoint, data, auth, ignore);
        /** Do a PUT request to an API endpoint. */
        this.put = (endpoint, data, auth, ignore) => this.request('PUT', endpoint, data, auth, ignore);
        /** Do a DELETE request to an API endpoint. */
        this.del = (endpoint, data, auth, ignore) => this.request('DELETE', endpoint, data, auth, ignore);
        this.client = client || new Client({ host });
        this.logger = logger;
    }
    loggedIn() {
        return Object.keys(this.currentLogin || {}).every((e) => e);
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
    request(method, endpoint, data = {}, auth = true, ignore) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.debug(`[API] ${method} ${endpoint}: ${JSON.stringify(data)}`);
            try {
                if (auth && !this.loggedIn()) {
                    throw new Error('');
                }
                let result;
                switch (method) {
                    case 'GET':
                        result = yield this.client.get(endpoint, data, {});
                        break;
                    case 'PUT':
                        result = yield this.client.put(endpoint, data);
                        break;
                    case 'DELETE':
                        result = yield this.client.delete(endpoint, data);
                        break;
                    default:
                    case 'POST':
                        result = yield this.client.post(endpoint, data);
                        break;
                }
                if (!result)
                    throw new Error(`API ${method} ${endpoint} result undefined`);
                if (!this.success(result, ignore))
                    throw result;
                this.logger.debug(`[API] ${method} ${endpoint} result ${result.status}`);
                return (method === 'DELETE') ? result : result.data;
            }
            catch (err) {
                this.logger.error(`[API] POST error(${endpoint}): ${JSON.stringify(err)}`);
                throw err;
            }
        });
    }
    /** Check result data for success, allowing override to ignore some errors */
    success(result, ignore) {
        return (typeof result.status === 'undefined' ||
            (result.status && exports.regExpSuccess.test(result.status)) ||
            (result.status && ignore && ignore.test(result.status))) ? true : false;
    }
    login(credentials, args) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this.post('login', Object.assign({}, credentials, args));
            this.currentLogin = {
                username: data.me.username,
                userId: data.userId,
                authToken: data.authToken,
                result: data
            };
            this.client.headers = {
                'X-Auth-Token': data.authToken,
                'X-User-Id': data.userId
            };
            return data;
        });
    }
    logout() { return this.get('logout', {}, true); }
    /**
     * Structure message content, optionally addressing to room ID.
     * Accepts message text string or a structured message object.
     */
    prepareMessage(content, rid, args) {
        return new message_1.Message(content, Object.assign({ rid }, args));
    }
}
exports.default = Api;
//# sourceMappingURL=api.js.map