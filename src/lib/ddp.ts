import EJSON from 'ejson'
import { timeout } from './settings'
import { logger } from './log'
import WebSocket from 'isomorphic-ws'

export interface Event {
  [name: string]: any
}

export interface Subscription {
  id?: string,
  name?: any,
  unsubscribe: () => Promise<any>,
  [key: string]: any
}

export interface Subscriptions {
  [key: string]: any
}

export function debounce (func: any, wait: any, immediate = false): any {
  let timeout: any
  function _debounce (this: any, ...args: any[]) {
    const context = this
    const later = function __debounce () {
      timeout = null
      if (!immediate) { func.apply(context, args) }
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) { func.apply(context, args) }
  }
  const stop = () => clearTimeout(timeout)
  return Object.assign(_debounce, { stop })
}

export class EventEmitter {

  events: Event

  constructor () {
    this.events = {}
  }

  on (event: string, listener: any) {
    if (typeof this.events[event] !== 'object') {
      this.events[event] = []
    }
    this.events[event].push(listener)
    return listener
  }

  removeListener (event: string, listener: any): void {
    if (typeof this.events[event] === 'object') {
		  const idx = this.events[event].indexOf(listener)
		  if (idx > -1) {
			  this.events[event].splice(idx, 1)
		  }
		  if (this.events[event].length === 0) {
			  delete this.events[event]
		  }
	  }
  }

  emit (event: string, ...args: any[]) {
    if (typeof this.events[event] === 'object') {
      this.events[event].forEach((listener: any) => {
        try {
          listener.apply(this, args)
        } catch (err) {
          logger.error(`[ddp] event emit error: ${err.message}`)
        }
      })
    }
  }

  once (event: string, listener: any) {
    this.on(event, function g (this: any, ...args: any[]) {
      this.removeListener(event, g)
      listener.apply(this, args)
    })
    return listener
  }
}

const hostToUrl = (host: String, ssl = false) => `ws${ssl ? 's' : ''}://${host}`

export default class Socket extends EventEmitter {

  state = 'active'
  lastPing = new Date()
  id = 0
  subscriptions: Subscriptions
  ddp = new EventEmitter()
  url: String
  timeout!: any
  reconnectTimeout!: any
  connection: any
  private _login: any | null
  private _timer!: any
  private _logged = false

  constructor (url: String, login?: any) {
    super()
    this._login = login
    this.url = hostToUrl(url) // .replace(/^http/, 'ws')
    this.subscriptions = {}

    const waitTimeout = () => setTimeout(async () => {
      // this.connection.ping()
      await this.send({ msg: 'ping' })
      this.timeout = setTimeout(() => this.reconnect(), 1000)
    }, timeout)

    const handlePing = async () => {
      this.lastPing = new Date()
      await this.send({ msg: 'pong' }, true)
      if (this.timeout) {
        clearTimeout(this.timeout)
      }
      this.timeout = waitTimeout()
    }

    const handlePong = () => {
      this.lastPing = new Date()
      if (this.timeout) {
        clearTimeout(this.timeout)
      }
      this.timeout = waitTimeout()
    }

    this.on('pong', handlePong)
    this.on('ping', handlePing)

    this.on('result', (data: any) => this.ddp.emit(data.id, { id: data.id, result: data.result, error: data.error }))
    this.on('ready', (data: any) => this.ddp.emit(data.subs[0], data))
    // this.on('error', () => this.reconnect())

    this.on('disconnected', debounce(() => this.reconnect(), 300))
    this.on('logged', () => this._logged = true)

    this.on('logged', async () => {
      const subscriptions = Object.keys(this.subscriptions || {}).map((key) => {
        const { name, params } = this.subscriptions[key]
        this.subscriptions[key].unsubscribe()
        return this.subscribe(name, ...params)
      })
      await Promise.all(subscriptions)
    })

    this.on('open', async () => {
      this._logged = false
      await this.send({ msg: 'connect', version: '1', support: ['1', 'pre2', 'pre1'] })
    })

    this._connect().catch(e => {
      logger.error(`[ddp] connection error: ${e.message}`)
    })
  }

  check () {
    if (!this.lastPing) {
      return false
    }
    if ((Math.abs(this.lastPing.getTime() - new Date().getTime()) / 1000) > 50) {
      return false
    }
    return true
  }

  async login (params: any) {
    try {
      this.emit('login', params)
      const { result } = await this.call('login', params)
      this._login = { resume: result.token, ...result }
      this._logged = true
      this.emit('logged', result)
      return result
    } catch (err) {
      const error = { ...err }
      if (/user not found/i.test(error.reason)) {
        error.error = 1
        error.reason = 'User or Password incorrect'
        error.message = 'User or Password incorrect'
      }
      this.emit('logginError', error)
      return Promise.reject(error)
    }
  }

  async send (obj: any, ignore = false) {
    return new Promise((resolve, reject) => {
      this.id += 1
      const id = obj.id || `ddp-${ this.id }`
      this.connection.send(EJSON.stringify({ ...obj, id }))
      if (ignore) {
        return
      }
      const cancel = this.ddp.once('disconnected', reject)
      this.ddp.once(id, (data: any) => {
        this.lastPing = new Date()
        this.ddp.removeListener('disconnected', cancel)
        return (data.error ? reject(data.error) : resolve({ id, ...data }))
      })
    })
  }

  get status () {
    return this.connection && this.connection.readyState === 1 && this.check() && !!this._logged
  }

  _close () {
    try {
      // this.connection && this.connection.readyState > 1 && this.connection.close && this.connection.close(300, 'disconnect')
      if (this.connection && this.connection.close) {
        this.connection.close(300, 'disconnect')
        delete this.connection
      }
    } catch (err) {
      logger.error(`[ddp] disconnect error: ${err.message}`)
    }
  }

  _connect () {
    return new Promise((resolve) => {
      this.lastPing = new Date()
      this._close()
      clearInterval(this.reconnectTimeout)
      this.reconnectTimeout = setInterval(() => (!this.connection || this.connection.readyState > 1 || !this.check()) && this.reconnect(), 5000)
      this.connection = new WebSocket(`${ this.url }/websocket`)

      this.connection.onopen = () => {
        this.emit('open')
        resolve()
        this.ddp.emit('open')
        return this._login && this.login(this._login)
      }

      this.connection.onclose = debounce((e: any) => {
        logger.info(`[ddp] disconnected`)
        this.emit('disconnected', e)
      }, 300)

      this.connection.onmessage = (e: any) => {
        try {
          const data = EJSON.parse(e.data)
          this.emit(data.msg, data)
          return data.collection && this.emit(data.collection, data)
        } catch (err) {
          logger.error(`[ddp] EJSON parse error: ${e.message}`)
        }
      }
    })
  }

  logout (): Promise<any> {
    this._login = null
    return this.call('logout').then(() => this.subscriptions = {})
  }

  disconnect () {
    this._close()
    this._login = null
    this.subscriptions = {}
  }

  async reconnect () {
    if (this._timer) {
      return
    }
    delete this.connection
    this._logged = false

    this._timer = setTimeout(async () => {
      delete this._timer
      try {
        await this._connect()
      } catch (err) {
        logger.error(`[ddp] reconnect error: ${err.message}`)
      }
    }, 1000)
  }

  call (method: any, ...params: any[]): Promise<any> {
    return this.send({
      msg: 'method', method, params
    }).catch((err) => {
      logger.error(`[ddp] call error: ${err.message}`)
      return Promise.reject(err)
    })
  }

  unsubscribe (id: any) {
    if (!this.subscriptions[id]) {
      return Promise.reject(id)
    }
    delete this.subscriptions[id]
    return this.send({
      msg: 'unsub',
      id
    }).then((data: any) => data.result || data.subs).catch((err) => {
      logger.error(`[ddp] unsubscribe error: ${err.message}`)
      return Promise.reject(err)
    })
  }

  subscribe (name: any, ...params: any[]): Promise<Subscription> {
    logger.info(`[ddp] subscribe to ${name}, param: ${JSON.stringify(params)}`)
    return this.send({
      msg: 'sub', name, params
    }).then(({ id }: any) => {
      const args = {
        id,
        name,
        params,
        unsubscribe: () => this.unsubscribe(id)
      }

      this.subscriptions[id] = args
      return args
    }).catch((err) => {
      logger.error(`[ddp] subscribe error: ${err.message}`)
      return Promise.reject(err)
    })
  }
}
