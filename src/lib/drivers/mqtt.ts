import ClientRest from '../api/RocketChat'
import { Client } from 'paho-mqtt/src/paho-mqtt'
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
  constructor ({ host = 'https://iot.eclipse.org', path = '/mqtt', integrationId, config, logger = Logger, ...moreConfigs }: any) {
    super()
    host = 'http://test.mosquitto.org'
    const [, _host = host, , port = 8080] = new RegExp('(.*?)(:([0-9]+))?$').exec(host || 'localhost:3000') || []
    this.config = {
      ...config,
      ...moreConfigs,
      host: _host.replace(/^http/, 'ws'),
      timeout: 20000,
      port: port
			// reopen: number
			// ping: number
			// close: number
			// integration: string
    }

    this.logger = logger

    if (/https/.test(host)) {
      this.socket = new Client(this.config.host + path, 'clientId')
    } else {
      this.socket = new Client((this.config.host || '').replace('http://', '').replace('ws://', ''), Number(port), path, 'clientId')
    }
    this.socket.onMessageArrived = ({ destinationName, payloadString }: any) => {
      if (/room-message/.test(destinationName)) {
        this.emit('message', { topic: destinationName, message: payloadString })
      }
    }
  }

  connect (options: ISocketOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      this.socket.connect({ onSuccess: resolve, mqttVersion: 3, onFailure: reject, useSSL: /https/.test(this.config.host || '') })
    })
  }
  disconnect (): Promise<any> {
    this.socket.end()
    return Promise.resolve(this.socket)
  }

  subscribe (topic: string, { qos = 0 }: any): Promise<ISubscription> {
    return new Promise((resolve, reject) => {
      this.socket.subscribe(topic, { qos, onFailure: (...args: any[]) => {
        console.log(...args)
        reject(args)
      }, onSuccess: (...args: any[]) => {
        console.log(...args)
        resolve(args as any)
			 }
      })
    })
  }

  unsubscribe (subscription: ISubscription, ...args: any[]): Promise < ISocket > {
    return new Promise((resolve, reject) => {
      this.socket.unsubscribe(subscription.name, [...args, (err: any, granted: any) => {
        if (err) {
          return reject(err)
        }
        return resolve(granted)
      }])
    })
  }

  unsubscribeAll (): Promise < ISocket > {
    return Promise.resolve() as any
  }
  subscribeNotifyAll (): Promise < any > {
    return Promise.resolve() as any
  }

  subscribeLoggedNotify (): Promise < any > {
    return Promise.resolve() as any
  }

  subscribeNotifyUser (): Promise < any > {
    return Promise.resolve() as any
  }

  login (credentials: ICredentials, args ?: any): Promise < any > {
    return Promise.resolve() as any
  }
	// usertyping room-messages deleted messages
  subscribeRoom (rid: string, ...args: any[]): Promise < ISubscription[] > {
    return this.subscribe(`room-messages/${rid}`, { qos: 1 }) as any
  }

  onMessage (cb: ICallback): void {
    this.on('message', ({ topic, message }: any) => {
      if (/room-messages/.test(topic)) {
        cb(message as any)// TODO apply msgpack
      }
    })
  }
  async onTyping (cb: ICallback): Promise < any > {
    return new Promise((resolve) => {
      resolve(this.on('notify-room', ({ fields: { args: [username, isTyping] } }: any) => {
        cb(username, isTyping)
      }))

    })
  }

}
