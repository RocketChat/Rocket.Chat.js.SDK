import ClientRest from '../api/RocketChat'
import mqtt from 'mqtt/browserMqtt.js'
import { EventEmitter } from 'tiny-events'

import { Message } from '../message'
import { logger as Logger } from '../log'
import { ISocket, IDriver } from './index'

import {
	ILogger,
	ISocketOptions,
	IRespondOptions,
	ICallback,
	IMessageCallback,
	ISubscriptionEvent,
	IMessage,
	IMessageMeta,
	IMessageReceipt,
	ISubscription,
	ICredentials,
	ILoginResult
} from '../../interfaces'

export class MQTTDriver extends EventEmitter implements ISocket, IDriver {
  logger: ILogger
  config: ISocketOptions
  socket: any
  constructor ({ host, integrationId, config, logger = Logger, ...moreConfigs }: any) {
    super()

    this.config = {
      ...config,
      ...moreConfigs,
      host: host.replace(/(^\w+:|^)\/\//, ''),
      timeout: 20000
			// reopen: number
			// ping: number
			// close: number
			// integration: string
    }
    this.socket = mqtt
    this.logger = logger
  }

  connect (options: ISocketOptions): Promise<any> {
    this.socket.connect(this.config.host)

    return new Promise((resolve, reject) => {
			// TODO: removelisteners
      this.socket.once('connect', resolve)
      this.socket.once('error', reject)
    })
  }
  disconnect (): Promise<any> {
    this.socket.end()
    return Promise.resolve(this.socket)
  }

  subscribe (topic: string, ...args: any[]): Promise<ISubscription> {
    return new Promise((resolve, reject) => {
      this.socket(topic, [...args, (err: any, granted: any) => {
        if (err) {
          return reject(err)
        }
        return resolve(granted)
      }])
    })
  }

  unsubscribe (subscription: ISubscription, ...args: any[]): Promise<ISocket> {
    return new Promise((resolve, reject) => {
      this.socket.unsubscribe(subscription.name, [...args, (err: any, granted: any) => {
        if (err) {
          return reject(err)
        }
        return resolve(granted)
      }])
    })
  }

  unsubscribeAll (): Promise<ISocket> {
    return Promise.resolve() as any
  }
  subscribeNotifyAll (): Promise<any> {
    return Promise.resolve() as any
  }

  subscribeLoggedNotify (): Promise<any> {
    return Promise.resolve() as any
  }

  subscribeNotifyUser (): Promise<any> {
    return Promise.resolve() as any
  }

  login (credentials: ICredentials, args?: any): Promise<any> {
    return Promise.resolve() as any
  }
	// usertyping room-messages deleted messages
  subscribeRoom (rid: string, ...args: any[]): Promise<ISubscription[]> {
    return this.subscribe(`room-messages/${rid}`, { qos: 1 }) as any
  }

  onMessage (cb: ICallback): void {
    this.socket.on('message', (topic: string, message: IMessage) => {
      if (/room-messages/.test(topic)) {
        cb(message as any)// TODO apply msgpack
      }
    })
  }
}
