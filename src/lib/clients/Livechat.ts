/**
	* @module LivechatDriver
	* Provides high-level helpers for Livechat connection, method calls, subscriptions.
	*/
import LivechatRest from '../api/Livechat'
import { ISocket, Protocols, IDriver } from '../drivers'
import { logger as Logger } from '../log'
import {
	ILogger,
	ISocketOptions,
	ICallback,
	ISubscription
} from '../../interfaces'

export default class LivechatClient extends LivechatRest implements ISocket {
  userId: string = ''
  logger: ILogger = Logger
  socket: Promise<ISocket | IDriver> = Promise.resolve() as any
  constructor ({ allPublic, rooms, integrationId, protocol, ...config }: any) {
    super(config)
    this.import(protocol, config)
  }
  import (protocol: Protocols, config: any) {
    switch (protocol) {
      case Protocols.MQTT:
        this.socket = import(/* webpackChunkName: 'mqtttest' */ '../drivers/mqtt').then(({ MQTTDriver }) => new MQTTDriver(config))
        break
      case Protocols.DDP:
        this.socket = import(/* webpackChunkName: 'ddptest' */ '../drivers/ddp').then(({ DDPDriver }) => new DDPDriver(config))
        break
      default:
        throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(Protocols).join()}`)
    }
  }
  async connect (options: ISocketOptions, callback?: ICallback): Promise <any> { return (await this.socket as ISocket).connect(options) }
  async disconnect (): Promise<any> { return (await this.socket as ISocket).disconnect() }
  async subscribe (topic: string, ...args: any[]): Promise<ISubscription> { return (await this.socket as ISocket) .subscribe(topic, args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return (await this.socket as ISocket).unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return (await this.socket as ISocket).unsubscribeAll() }
  async subscribeRoom (rid: string, ...args: any[]): Promise<ISubscription[]> { return (await this.socket as IDriver).subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return (await this.socket as IDriver) .subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return (await this.socket as IDriver) .subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return (await this.socket as IDriver) .subscribeNotifyUser() }
  async onMessage (cb: ICallback): Promise<any> { return (await this.socket as IDriver).onMessage(cb) }
  async onTyping (cb: ICallback): Promise<any> { return (await this.socket as IDriver).onTyping(cb) }
}
