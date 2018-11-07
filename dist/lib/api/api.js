import { logger as Logger } from '../log';
import { Message } from '../message';
import { EventEmitter } from 'tiny-events';
class Client {
    constructor({ host = 'http://localhost:3000' }) {
        this._headers = {};
        this.host = host;
    }
    set headers(obj) {
        this._headers = obj;
    }
    get headers() {
        return {
            'Content-Type': 'application/json',
            ...this._headers
        };
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
    async handle(r) {
        const { status } = r;
        const data = await r.json();
        return { status, data };
    }
    getParams(data) {
        return Object.keys(data).map(function (k) {
            return encodeURIComponent(k) + '=' + (typeof data[k] === 'object' ? JSON.stringify(data[k]) : encodeURIComponent(data[k]));
        }).join('&');
    }
}
export const regExpSuccess = /(?!([45][0-9][0-9]))\d{3}/;
/**
    * @module API
    * Provides a base client for handling requests with generic Rocket.Chat's REST API
    */
export default class Api extends EventEmitter {
    constructor({ client, host, logger = Logger }) {
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
    async request(method, endpoint, data = {}, auth = true, ignore) {
        this.logger.debug(`[API] ${method} ${endpoint}: ${JSON.stringify(data)}`);
        try {
            if (auth && !this.loggedIn()) {
                throw new Error('');
            }
            let result;
            switch (method) {
                case 'GET':
                    result = await this.client.get(endpoint, data, {});
                    break;
                case 'PUT':
                    result = await this.client.put(endpoint, data);
                    break;
                case 'DELETE':
                    result = await this.client.delete(endpoint, data);
                    break;
                default:
                case 'POST':
                    result = await this.client.post(endpoint, data);
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
    }
    /** Check result data for success, allowing override to ignore some errors */
    success(result, ignore) {
        return (typeof result.status === 'undefined' ||
            (result.status && regExpSuccess.test(result.status)) ||
            (result.status && ignore && ignore.test(result.status))) ? true : false;
    }
    async login(credentials, args) {
        const { data } = await this.post('login', { ...credentials, ...args });
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
    }
    logout() { return this.get('logout', {}, true); }
    /**
     * Structure message content, optionally addressing to room ID.
     * Accepts message text string or a structured message object.
     */
    prepareMessage(content, rid, args) {
        return new Message(content, { rid, ...args });
    }
}
//# sourceMappingURL=api.js.map