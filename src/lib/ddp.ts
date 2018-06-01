import EJSON from 'ejson';
import { timeout } from './settings';

export interface Event {
    [name: string]: any;
}

export interface Subscription {
    [key: string]: any;
}

export function debounce(func: any, wait: any, immediate = false): any {
	let timeout: any;
	function _debounce(this: any, ...args: any[]) {
		const context = this;
		const later = function __debounce() {
			timeout = null;
			if (!immediate) { func.apply(context, args); }
		};
		const callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) { func.apply(context, args); }
	}
	const stop = () => clearTimeout(timeout)
	return Object.assign(_debounce, { stop });
}

export class EventEmitter {

	events: Event

	constructor () {
		this.events = {}
	}

	on(event: string, listener: any) {
		if (typeof this.events[event] !== 'object') {
			this.events[event] = [];
		}
		this.events[event].push(listener);
		return listener;
	}

	removeListener(event: string, listener: any): void {
		if (typeof this.events[event] === 'object') {
			const idx = this.events[event].indexOf(listener);
			if (idx > -1) {
				this.events[event].splice(idx, 1);
			}
		}
	}

	emit(event: string, ...args: any[]) {
		if (typeof this.events[event] === 'object') {
			this.events[event].forEach((listener: any) => {
				try {
					listener.apply(this, args);
				} catch (e) {
					console.log('EventEmitter.emit: ' + e);
				}
			});
		}
	}
	
	once(event: string, listener: any) {
		this.on(event, function g(this: any, ...args: any[]) {
			this.removeListener(event, g);
			listener.apply(this, args);
		});
		return listener;
	}
}

const hostToUrl = (host: String, ssl = false) => `ws${ssl? 's': ''}://${host}`

export default class Socket extends EventEmitter {

	state = 'active'
	lastping = new Date();
	id = 0
	subscriptions: Subscription
	ddp = new EventEmitter();
	url: String
	private _login: any | null
	private _timer!:  NodeJS.Timer
	private _logged = false
	timeout!: NodeJS.Timer
	reconnect_timeout!: NodeJS.Timer
	connection: any

	constructor(url: String, login?: any) {
		super();
		this._login = login;
		this.url = hostToUrl(url); // .replace(/^http/, 'ws');
		this.subscriptions = {}

		const waitTimeout = () => setTimeout(async() => {
			// this.connection.ping();
			this.send({ msg: 'ping' });
			this.timeout = setTimeout(() => this.reconnect(), 1000);
		}, 40000);
		
		const handlePing = () => {
			this.lastping = new Date();
			this.send({ msg: 'pong' }, true);
			if (this.timeout) {
				clearTimeout(this.timeout);
			}
			this.timeout = waitTimeout();
		};
		
		const handlePong = () => {
			this.lastping = new Date();
			if (this.timeout) {
				clearTimeout(this.timeout);
			}
			this.timeout = waitTimeout();
        };
        
		this.on('pong', handlePong);
		this.on('ping', handlePing);

		this.on('result', (data: any) => this.ddp.emit(data.id, { id: data.id, result: data.result, error: data.error }));
		this.on('ready', (data: any) => this.ddp.emit(data.subs[0], data));
		// this.on('error', () => this.reconnect());
        
        this.on('disconnected', debounce(() => this.reconnect(), 300));
		this.on('logged', () => this._logged = true);

		this.on('logged', () => {
			Object.keys(this.subscriptions || {}).forEach((key) => {
				const { name, params } = this.subscriptions[key];
				this.subscriptions[key].unsubscribe();
				this.subscribe(name, ...params);
			});
		});

		this.on('open', async() => {
			this._logged = false;
			this.send({ msg: 'connect', version: '1', support: ['1', 'pre2', 'pre1'] });
		});

		try {
			this._connect();
		} catch (e) {
			console.log('ddp.constructor._connect', e);
		}
	}

	check() {
		if (!this.lastping) {
			return false;
		}
		if ((Math.abs(this.lastping.getTime() - new Date().getTime()) / 1000) > 50) {
			return false;
		}
		return true;
	}
	
	async login(params: any) {
		try {
			this.emit('login', params);
			const result = await this.call('login', params);
			this._login = { resume: result.token, ...result };
			this._logged = true;
			this.emit('logged', result);
			return result;
		} catch (err) {
			const error = { ...err };
			if (/user not found/i.test(error.reason)) {
				error.error = 1;
				error.reason = 'User or Password incorrect';
				error.message = 'User or Password incorrect';
			}
			this.emit('logginError', error);
			return Promise.reject(error);
		}
	}

	async send(obj: any, ignore = false) {
		console.log('send');
		return new Promise((resolve, reject) => {
			this.id += 1;
			const id = obj.id || `ddp-react-native-${ this.id }`;
			// console.log('send', { ...obj, id });
			this.connection.send(EJSON.stringify({ ...obj, id }));
			if (ignore) {
				return;
			}
			const cancel = this.ddp.once('disconnected', reject);
			this.ddp.once(id, (data: any) => {
				// console.log(data);
				this.lastping = new Date();
				this.ddp.removeListener(id, cancel);
				return (data.error ? reject(data.error) : resolve({ id, ...data }));
			});
		});
	}
	
	get status() {
		return this.connection && this.connection.readyState === 1 && this.check() && !!this._logged;
	}
	
	_close() {
		try {
			// this.connection && this.connection.readyState > 1 && this.connection.close && this.connection.close(300, 'disconnect');
			if (this.connection && this.connection.close) {
				this.connection.close(300, 'disconnect');
				delete this.connection;
			}
		} catch (e) {
			// console.log(e);
		}
	}
	
	_connect() {
		return new Promise((resolve) => {
			this.lastping = new Date();
			this._close();
			clearInterval(this.reconnect_timeout);
			this.reconnect_timeout = setInterval(() => (!this.connection || this.connection.readyState > 1 || !this.check()) && this.reconnect(), 5000);
			this.connection = new WebSocket(`${ this.url }/websocket`);

			this.connection.onopen = () => {
				this.emit('open');
				resolve();
				this.ddp.emit('open');
				return this._login && this.login(this._login);
			};
            
            this.connection.onclose = debounce((e: any) => { console.log('aer'); this.emit('disconnected', e); }, 300);
            
            this.connection.onmessage = (e: any) => {
				try {
					// console.log('received', e.data, e.target.readyState);
					const data = EJSON.parse(e.data);
					this.emit(data.msg, data);
					return data.collection && this.emit(data.collection, data);
				} catch (err) {
					console.log('EJSON parse', err);
				}
			};
		});
	}

	logout(): Promise<any> {
		this._login = null;
		return this.call('logout').then(() => this.subscriptions = {});
	}
	
	disconnect() {
		this._close();
		this._login = null;
		this.subscriptions = {};
	}
	
	async reconnect() {
		if (this._timer) {
			return;
		}
		delete this.connection;
		this._logged = false;

		this._timer = setTimeout(async() => {
			delete this._timer;
			try {
				await this._connect();
			} catch (e) {
				console.log('ddp.reconnect._connect', e);
			}
		}, 1000);
	}
	
	call(method: any, ...params: any[]) {
		return this.send({
			msg: 'method', method, params
		}).then((data: any) => data.result || data.subs).catch((err) => {
			console.log('DDP call Error', err);
			return Promise.reject(err);
		});
	}
	
	unsubscribe(id: any) {
		if (!this.subscriptions[id]) {
			return Promise.reject(id);
		}
		delete this.subscriptions[id];
		return this.send({
			msg: 'unsub',
			id
		}).then((data: any) => data.result || data.subs).catch((err) => {
			console.log('DDP unsubscribe Error', err);
			return Promise.reject(err);
		});
	}
	
	subscribe(name: any, ...params: any[]) {
		console.log(name, params);
		return this.send({
			msg: 'sub', name, params
		}).then(({ id }: any) => {
			const args = {
				id,
				name,
				params,
				unsubscribe: () => this.unsubscribe(id)
			};

			this.subscriptions[id] = args;
			// console.log(args);
			return args;
		}).catch((err) => {
			console.log('DDP subscribe Error', err);
			return Promise.reject(err);
		});
	}
}