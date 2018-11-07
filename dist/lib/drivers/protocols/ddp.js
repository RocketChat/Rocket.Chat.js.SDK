"use strict";
/**
 * @module DDP
 * Handles low-level websocket connection and event subscriptions
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const universal_websocket_client_1 = __importDefault(require("universal-websocket-client"));
const tiny_events_1 = require("tiny-events");
const log_1 = require("../../log");
const interfaces_1 = require("../../../interfaces");
const util_1 = require("../../util");
// import createHash from 'create-hash'
/** Websocket handler class, manages connections and subscriptions */
class Socket extends tiny_events_1.EventEmitter {
    /** Create a websocket handler */
    constructor(options, resume = null) {
        super();
        this.resume = resume;
        this.sent = 0;
        this.lastPing = Date.now();
        this.subscriptions = {};
        this.handlers = [];
        this.config = {
            host: options.host || 'localhost:3000',
            useSsl: options.useSsl || false,
            reopen: options.reopen || console.log,
            ping: options.timeout || 20000
        };
        this.host = `${util_1.hostToWS(this.config.host, this.config.useSsl)}/websocket`;
        // Echo call results, emitting ID of DDP call for more specific listeners
        this.on('message.result', (data) => {
            const { id, result, error } = data;
            this.emit(id, { id, result, error });
        });
    }
    /**
     * Open websocket connection, with optional retry interval.
     * Stores connection, setting up handlers for open/close/message events.
     * Resumes login if given token.
     */
    open(ms = this.config.reopen) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let connection;
            this.lastPing = Date.now();
            yield this.close();
            if (this.reopenInterval)
                clearInterval(this.reopenInterval);
            this.reopenInterval = setInterval(() => {
                return !this.alive() && this.reopen();
            }, ms);
            try {
                connection = new universal_websocket_client_1.default(this.host);
                connection.onerror = reject;
            }
            catch (err) {
                return reject(err);
            }
            this.connection = connection;
            this.connection.onmessage = this.onMessage.bind(this);
            this.connection.onclose = this.onClose.bind(this);
            this.connection.onopen = this.onOpen.bind(this, resolve);
        }));
    }
    /** Send handshake message to confirm connection, start pinging. */
    onOpen(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            const connected = yield this.send({
                msg: 'connect',
                version: '1',
                support: ['1', 'pre2', 'pre1']
            }, 'connected');
            this.session = connected.session;
            this.ping().catch((err) => log_1.logger.error(`[ddp] Unable to ping server: ${err.message}`));
            this.emit('open');
            if (this.resume)
                yield this.login(this.resume);
            return callback(this.connection);
        });
    }
    /** Emit close event so it can be used for promise resolve in close() */
    onClose(e) {
        log_1.logger.info(`[ddp] Close (${e.code}) ${e.reason}`);
        this.emit('close', e);
        if (e.code !== 1000)
            return this.reopen();
    }
    /**
     * Find and call matching handlers for incoming message data.
     * Handlers match on collection, id and/or msg attribute in that order.
     * Any matched handlers are removed once called.
     * All collection events are emitted with their `msg` as the event name.
     */
    onMessage(e) {
        const data = (e.data) ? JSON.parse(e.data) : undefined;
        // console.log(data) // 👈  very useful for debugging missing responses
        if (!data)
            return log_1.logger.error(`[ddp] JSON parse error: ${e.message}`);
        if (data.collection)
            this.emit(data.collection, data);
        const handlers = [];
        const matcher = (handler) => {
            return (((data.collection && handler.collection === data.collection)) || ((data.msg && handler.msg === data.msg) &&
                (!handler.id || !data.id || handler.id === data.id)));
        };
        // tslint:disable-next-line
        for (let i = 0; i < this.handlers.length; i++) {
            if (matcher(this.handlers[i])) {
                handlers.push(this.handlers[i]);
                if (!this.handlers[i].persist) {
                    this.handlers.splice(i, 1);
                    i--;
                }
            }
        }
        for (let handler of handlers)
            handler.callback(data);
    }
    /** Disconnect the DDP from server and clear all subscriptions. */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connected) {
                yield this.unsubscribeAll();
                yield new Promise((resolve) => {
                    this.connection.close(1000, 'disconnect');
                    this.once('close', () => {
                        delete this.connection;
                        resolve();
                    });
                })
                    .catch(() => this.close());
            }
        });
    }
    /** Clear connection and try to connect again. */
    reopen() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.openTimeout)
                return;
            yield this.close();
            this.openTimeout = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                delete this.openTimeout;
                yield this.open()
                    .catch((err) => log_1.logger.error(`[ddp] Reopen error: ${err.message}`));
            }), this.config.reopen);
        });
    }
    /** Check if websocket connected and ready. */
    get connected() {
        return (this.connection &&
            this.connection.readyState === 1 &&
            this.alive());
    }
    /** Check if connected and logged in */
    get loggedIn() {
        return (this.connected && !!this.resume);
    }
    /**
     * Send an object to the server via Socket. Adds handler to collection to
     * allow awaiting response matching an expected object. Most responses are
     * identified by their message event name and the ID they were sent with, but
     * some responses don't return the ID fallback to just matching on event name.
     * Data often includes an error attribute if something went wrong, but certain
     * types of calls send back a different `msg` value instead, e.g. `nosub`.
     * @param obj       Object to be sent
     * @param msg       The `data.msg` value to wait for in response
     * @param errorMsg  An alternate `data.msg` value indicating an error response
     */
    send(obj, msg = 'result', errorMsg) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.sent += 1;
                const id = obj.id || `ddp-${this.sent}`;
                if (!this.connection)
                    throw new Error('[ddp] sending without open connection');
                this.connection.send(JSON.stringify(Object.assign({}, obj, { id })));
                if (typeof msg === 'string') {
                    this.handlers.push({ id, msg, callback: (data) => (data.error)
                            ? reject(data.error)
                            : resolve(data)
                    });
                }
                if (errorMsg) {
                    this.handlers.push({ id, msg: errorMsg, callback: reject });
                }
                this.once('close', reject);
            });
        });
    }
    /** Send ping, record time, re-open if nothing comes back, repeat */
    ping() {
        return __awaiter(this, void 0, void 0, function* () {
            this.pingTimeout = setTimeout(() => {
                this.send({ msg: 'ping' }, 'pong')
                    .then(() => {
                    this.lastPing = Date.now();
                    return this.ping();
                })
                    .catch(() => this.reopen());
            }, this.config.ping);
        });
    }
    /** Check if ping-pong to server is within tolerance of 1 missed ping */
    alive() {
        if (!this.lastPing)
            return false;
        return (Date.now() - this.lastPing <= this.config.ping * 2);
    }
    /**
     * Calls a method on the server and returns a promise resolved
     * with the result of the method.
     * @param method    The name of the method to be called
     * @param params    An array with the parameters to be sent
     */
    call(method, ...params) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this.send({ msg: 'method', method, params })
                .catch((err) => {
                log_1.logger.error(`[ddp] Call error: ${err.message}`);
                throw err;
            });
            return (response.result) ? response.result : response;
        });
    }
    /**
     * Login to server and resubscribe to all subs, resolve with user information.
     * @param credentials User credentials (username/password, oauth or token)
     */
    login(credentials) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = this.loginParams(credentials);
            this.resume = (yield this.call('login', params));
            yield this.subscribeAll();
            this.emit('login', this.resume);
            return this.resume;
        });
    }
    /** Take variety of login credentials object types for accepted params */
    loginParams(credentials) {
        if (interfaces_1.isLoginPass(credentials) ||
            interfaces_1.isLoginOAuth(credentials) ||
            interfaces_1.isLoginAuthenticated(credentials)) {
            return credentials;
        }
        if (interfaces_1.isLoginResult(credentials)) {
            const params = {
                resume: credentials.token
            };
            return params;
        }
        const params = {
            user: { username: credentials.username },
            password: {
                digest: 'asd',
                // digest: createHash('sha256').update(credentials.password).digest('hex'),
                algorithm: 'sha-256'
            }
        };
        return params;
    }
    /** Logout the current User from the server via Socket. */
    logout() {
        this.resume = null;
        return this.unsubscribeAll()
            .then(() => this.call('logout'));
    }
    /** Register a callback to trigger on message events in subscription */
    onEvent(id, collection, callback) {
        this.handlers.push({ id, collection, persist: true, callback });
    }
    /**
     * Subscribe to a stream on server via socket and returns a promise resolved
     * with the subscription object when the subscription is ready.
     * @param name      Stream name to subscribe to
     * @param params    Params sent to the subscription request
     */
    subscribe(name, params, callback) {
        log_1.logger.info(`[ddp] Subscribe to ${name}, param: ${JSON.stringify(params)}`);
        return this.send({ msg: 'sub', name, params }, 'ready')
            .then((result) => {
            const id = (result.subs) ? result.subs[0] : undefined;
            const unsubscribe = this.unsubscribe.bind(this, id);
            const onEvent = this.onEvent.bind(this, id, name);
            const subscription = { id, name, params, unsubscribe, onEvent };
            if (callback)
                subscription.onEvent(callback);
            this.subscriptions[id] = subscription;
            return subscription;
        })
            .catch((err) => {
            log_1.logger.error(`[ddp] Subscribe error: ${err.message}`);
            throw err;
        });
    }
    /** Subscribe to all pre-configured streams (e.g. on login resume) */
    subscribeAll() {
        const subscriptions = Object.keys(this.subscriptions || {}).map((key) => {
            const { name, params } = this.subscriptions[key];
            return this.subscribe(name, params);
        });
        return Promise.all(subscriptions);
    }
    /** Unsubscribe to server stream, resolve with unsubscribe request result */
    unsubscribe(id) {
        if (!this.subscriptions[id])
            return Promise.reject(id);
        delete this.subscriptions[id];
        return this.send({ msg: 'unsub', id }, 'result', 'nosub')
            .then((data) => data.result || data.subs)
            .catch((err) => {
            if (!err.msg && err.msg !== 'nosub') {
                log_1.logger.error(`[ddp] Unsubscribe error: ${err.message}`);
                throw err;
            }
        });
    }
    /** Unsubscribe from all active subscriptions and reset collection */
    unsubscribeAll() {
        const unsubAll = Object.keys(this.subscriptions).map((id) => {
            return this.subscriptions[id].unsubscribe();
        });
        return Promise.all(unsubAll)
            .then(() => this.subscriptions = {});
    }
}
exports.Socket = Socket;
class DDPDriver extends tiny_events_1.EventEmitter {
    constructor(_a) {
        var { host, integrationId, config, logger = log_1.logger } = _a, moreConfigs = __rest(_a, ["host", "integrationId", "config", "logger"]);
        super();
        /**
         * Websocket subscriptions, exported for direct polling by adapters
         * Variable not initialised until `prepMeteorSubscriptions` called.
         * @deprecated Use `ddp.Socket` instance subscriptions instead.
         */
        this.subscriptions = {};
        /** Current user object populated from resolved login */
        this.userId = '';
        /** Array of joined room IDs (for reactive queries) */
        this.joinedIds = [];
        this.config = Object.assign({}, config, moreConfigs, { host: host.replace(/(^\w+:|^)\/\//, ''), timeout: 20000 });
        this.ddp = new Socket(Object.assign({}, this.config));
        this.logger = logger;
    }
    /**
     * Initialise socket instance with given options or defaults.
     * Proxies the DDP module socket connection. Resolves with socket when open.
     * Accepts callback following error-first-pattern.
     * Error returned or promise rejected on timeout.
     * @example <caption>Using promise</caption>
     *  import { driver } from '@rocket.chat/sdk'
     *  driver.connect()
     *    .then(() => console.log('connected'))
     *    .catch((err) => console.error(err))
     */
    connect() {
        const config = Object.assign({}, this.config); // override defaults
        return new Promise((resolve, reject) => {
            this.logger.info('[driver] Connecting', config);
            this.subscriptions = this.ddp.subscriptions;
            this.ddp.open().catch((err) => {
                this.logger.error(`[driver] Failed to connect: ${err.message}`);
                reject(err);
            });
            this.ddp.on('open', () => this.emit('connected')); // echo ddp event
            let cancelled = false;
            const rejectionTimeout = setTimeout(() => {
                this.logger.info(`[driver] Timeout (${config.timeout})`);
                const err = new Error('Socket connection timeout');
                cancelled = true;
                this.removeAllListeners('connected');
                reject(err);
            }, config.timeout);
            // if to avoid condition where timeout happens before listener to 'connected' is added
            // and this listener is not removed (because it was added after the removal)
            if (!cancelled) {
                this.once('connected', () => {
                    this.logger.info('[driver] Connected');
                    if (cancelled)
                        return this.ddp.close(); // cancel if already rejected
                    clearTimeout(rejectionTimeout);
                    resolve(this);
                });
            }
        });
    }
    disconnect() {
        return this.ddp.close();
    }
    subscribe(topic, eventname, ...args) {
        this.logger.info(`[DDP driver] Subscribing to ${topic} | ${JSON.stringify(args)}`);
        return this.ddp.subscribe(topic, [eventname, { 'useCollection': false, 'args': args }]);
    }
    subscribeNotifyAll() {
        const topic = 'stream-notify-all';
        return Promise.all([
            'roles-change',
            'updateEmojiCustom',
            'deleteEmojiCustom',
            'updateAvatar',
            'public-settings-changed',
            'permissions-changed'
        ].map(event => this.subscribe(topic, event, false)));
    }
    subscribeLoggedNotify() {
        const topic = 'stream-notify-logged';
        return Promise.all([
            'Users:NameChanged',
            'Users:Deleted',
            'updateAvatar',
            'updateEmojiCustom',
            'deleteEmojiCustom',
            'roles-change'
        ].map(event => this.subscribe(topic, event, false)));
    }
    subscribeNotifyUser() {
        const topic = 'stream-notify-user';
        return Promise.all([
            'message',
            'otr',
            'webrtc',
            'notification',
            'rooms-changed',
            'subscriptions-changed'
        ].map(event => this.subscribe(topic, `${this.userId}/${event}`, false)));
    }
    subscribeRoom(rid, ...args) {
        const topic = 'stream-notify-room';
        return Promise.all([
            this.subscribe('stream-room-messages', rid, ...args),
            this.subscribe(topic, `${rid}/typing`, ...args),
            this.subscribe(topic, `${rid}/deleteMessage`, ...args)
        ]);
    }
    /** Login to Rocket.Chat via DDP */
    login(credentials, args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.ddp || !this.ddp.connected) {
                yield this.connect();
            }
            this.logger.info(`[DDP driver] Login with ${JSON.stringify(credentials)}`);
            const login = yield this.ddp.login(credentials);
            this.userId = login.id;
            return this;
        });
    }
    /** Unsubscribe from Meteor stream. Proxy for socket unsubscribe. */
    unsubscribe(subscription) {
        return this.ddp.unsubscribe(subscription.id);
    }
    /** Unsubscribe from all subscriptions. Proxy for socket unsubscribeAll */
    unsubscribeAll() {
        return this.ddp.unsubscribeAll();
    }
    onMessage(cb) {
        this.ddp.on('stream-room-messages', ({ fields: { args: [message] } }) => cb(message));
    }
    onTyping(cb) {
        this.ddp.on('stream-notify-room', ({ fields: { args: [username, isTyping] } }) => {
            cb(username, isTyping);
        });
    }
}
exports.DDPDriver = DDPDriver;
//# sourceMappingURL=ddp.js.map