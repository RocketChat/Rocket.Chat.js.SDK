"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
Object.defineProperty(exports, "__esModule", { value: true });
const ejson_1 = __importDefault(require("ejson"));
const settings_1 = require("./settings");
const log_1 = require("./log");
const isomorphic_ws_1 = __importDefault(require("isomorphic-ws"));
function debounce(func, wait, immediate = false) {
    let timeout;
    function _debounce(...args) {
        const context = this;
        const later = function __debounce() {
            timeout = null;
            if (!immediate) {
                func.apply(context, args);
            }
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) {
            func.apply(context, args);
        }
    }
    const stop = () => clearTimeout(timeout);
    return Object.assign(_debounce, { stop });
}
exports.debounce = debounce;
class EventEmitter {
    constructor() {
        this.events = {};
    }
    on(event, listener) {
        if (typeof this.events[event] !== 'object') {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return listener;
    }
    removeListener(event, listener) {
        if (typeof this.events[event] === 'object') {
            const idx = this.events[event].indexOf(listener);
            if (idx > -1) {
                this.events[event].splice(idx, 1);
            }
            if (this.events[event].length === 0) {
                delete this.events[event];
            }
        }
    }
    emit(event, ...args) {
        if (typeof this.events[event] === 'object') {
            this.events[event].forEach((listener) => {
                try {
                    listener.apply(this, args);
                }
                catch (err) {
                    log_1.logger.error(`[ddp] event emit error: ${err.message}`);
                }
            });
        }
    }
    once(event, listener) {
        this.on(event, function g(...args) {
            this.removeListener(event, g);
            listener.apply(this, args);
        });
        return listener;
    }
}
exports.EventEmitter = EventEmitter;
const hostToUrl = (host, ssl = false) => `ws${ssl ? 's' : ''}://${host}`;
class Socket extends EventEmitter {
    constructor(url, login) {
        super();
        this.state = 'active';
        this.lastPing = new Date();
        this.id = 0;
        this.ddp = new EventEmitter();
        this._logged = false;
        this._login = login;
        this.url = hostToUrl(url); // .replace(/^http/, 'ws')
        this.subscriptions = {};
        const waitTimeout = () => setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            // this.connection.ping()
            yield this.send({ msg: 'ping' });
            this.timeout = setTimeout(() => this.reconnect(), 1000);
        }), settings_1.timeout);
        const handlePing = () => __awaiter(this, void 0, void 0, function* () {
            this.lastPing = new Date();
            yield this.send({ msg: 'pong' }, true);
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
            this.timeout = waitTimeout();
        });
        const handlePong = () => {
            this.lastPing = new Date();
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
            this.timeout = waitTimeout();
        };
        this.on('pong', handlePong);
        this.on('ping', handlePing);
        this.on('result', (data) => this.ddp.emit(data.id, { id: data.id, result: data.result, error: data.error }));
        this.on('ready', (data) => this.ddp.emit(data.subs[0], data));
        // this.on('error', () => this.reconnect())
        this.on('disconnected', debounce(() => this.reconnect(), 300));
        this.on('logged', () => this._logged = true);
        this.on('logged', () => __awaiter(this, void 0, void 0, function* () {
            const subscriptions = Object.keys(this.subscriptions || {}).map((key) => {
                const { name, params } = this.subscriptions[key];
                this.subscriptions[key].unsubscribe();
                return this.subscribe(name, ...params);
            });
            yield Promise.all(subscriptions);
        }));
        this.on('open', () => __awaiter(this, void 0, void 0, function* () {
            this._logged = false;
            yield this.send({ msg: 'connect', version: '1', support: ['1', 'pre2', 'pre1'] });
        }));
        this._connect().catch(e => {
            log_1.logger.error(`[ddp] connection error: ${e.message}`);
        });
    }
    check() {
        if (!this.lastPing) {
            return false;
        }
        if ((Math.abs(this.lastPing.getTime() - new Date().getTime()) / 1000) > 50) {
            return false;
        }
        return true;
    }
    login(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.emit('login', params);
                const { result } = yield this.call('login', params);
                this._login = Object.assign({ resume: result.token }, result);
                this._logged = true;
                this.emit('logged', result);
                return result;
            }
            catch (err) {
                const error = Object.assign({}, err);
                if (/user not found/i.test(error.reason)) {
                    error.error = 1;
                    error.reason = 'User or Password incorrect';
                    error.message = 'User or Password incorrect';
                }
                this.emit('logginError', error);
                return Promise.reject(error);
            }
        });
    }
    send(obj, ignore = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.id += 1;
                const id = obj.id || `ddp-${this.id}`;
                this.connection.send(ejson_1.default.stringify(Object.assign({}, obj, { id })));
                if (ignore) {
                    return;
                }
                const cancel = this.ddp.once('disconnected', reject);
                this.ddp.once(id, (data) => {
                    this.lastPing = new Date();
                    this.ddp.removeListener('disconnected', cancel);
                    return (data.error ? reject(data.error) : resolve(Object.assign({ id }, data)));
                });
            });
        });
    }
    get status() {
        return this.connection && this.connection.readyState === 1 && this.check() && !!this._logged;
    }
    _close() {
        try {
            // this.connection && this.connection.readyState > 1 && this.connection.close && this.connection.close(300, 'disconnect')
            if (this.connection && this.connection.close) {
                this.connection.close(300, 'disconnect');
                delete this.connection;
            }
        }
        catch (err) {
            log_1.logger.error(`[ddp] disconnect error: ${err.message}`);
        }
    }
    _connect() {
        return new Promise((resolve) => {
            this.lastPing = new Date();
            this._close();
            clearInterval(this.reconnectTimeout);
            this.reconnectTimeout = setInterval(() => (!this.connection || this.connection.readyState > 1 || !this.check()) && this.reconnect(), 5000);
            this.connection = new isomorphic_ws_1.default(`${this.url}/websocket`);
            this.connection.onopen = () => {
                this.emit('open');
                resolve();
                this.ddp.emit('open');
                return this._login && this.login(this._login);
            };
            this.connection.onclose = debounce((e) => {
                log_1.logger.info(`[ddp] disconnected`);
                this.emit('disconnected', e);
            }, 300);
            this.connection.onmessage = (e) => {
                try {
                    const data = ejson_1.default.parse(e.data);
                    this.emit(data.msg, data);
                    return data.collection && this.emit(data.collection, data);
                }
                catch (err) {
                    log_1.logger.error(`[ddp] EJSON parse error: ${e.message}`);
                }
            };
        });
    }
    logout() {
        this._login = null;
        return this.call('logout').then(() => this.subscriptions = {});
    }
    disconnect() {
        this._close();
        this._login = null;
        this.subscriptions = {};
    }
    reconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._timer) {
                return;
            }
            delete this.connection;
            this._logged = false;
            this._timer = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                delete this._timer;
                try {
                    yield this._connect();
                }
                catch (err) {
                    log_1.logger.error(`[ddp] reconnect error: ${err.message}`);
                }
            }), 1000);
        });
    }
    call(method, ...params) {
        return this.send({
            msg: 'method', method, params
        }).catch((err) => {
            log_1.logger.error(`[ddp] call error: ${err.message}`);
            return Promise.reject(err);
        });
    }
    unsubscribe(id) {
        if (!this.subscriptions[id]) {
            return Promise.reject(id);
        }
        delete this.subscriptions[id];
        return this.send({
            msg: 'unsub',
            id
        }).then((data) => data.result || data.subs).catch((err) => {
            log_1.logger.error(`[ddp] unsubscribe error: ${err.message}`);
            return Promise.reject(err);
        });
    }
    subscribe(name, ...params) {
        log_1.logger.info(`[ddp] subscribe to ${name}, param: ${JSON.stringify(params)}`);
        return this.send({
            msg: 'sub', name, params
        }).then(({ id }) => {
            const args = {
                id,
                name,
                params,
                unsubscribe: () => this.unsubscribe(id)
            };
            this.subscriptions[id] = args;
            return args;
        }).catch((err) => {
            log_1.logger.error(`[ddp] subscribe error: ${err.message}`);
            return Promise.reject(err);
        });
    }
}
exports.default = Socket;
//# sourceMappingURL=ddp.js.map