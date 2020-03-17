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
  livechatStream: string = 'stream-livechat-room'
  userId: string = ''
  logger: ILogger = Logger
  socket: Promise<ISocket | IDriver> = Promise.resolve() as any
  constructor ({ logger, allPublic, rooms, integrationId, protocol = Protocols.DDP, ...config }: any) {
    super({ logger, ...config })
    this.import(protocol, config)
  }
  import (protocol: Protocols, config: any) {
    switch (protocol) {
      // case Protocols.MQTT:
      //   this.socket = import(/* webpackChunkName: 'mqtttest' */ '../drivers/mqtt').then(({ MQTTDriver }) => new MQTTDriver({ logger: this.logger, ...config }))
      //   break
      case Protocols.DDP:
        this.socket = import(/* webpackChunkName: 'ddptest' */ '../drivers/ddp').then(({ DDPDriver }) => new DDPDriver({ logger: this.logger, ...config }))
        break
      default:
        throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(Protocols).join()}`)
    }
  }
  async connect (options: ISocketOptions, callback?: ICallback): Promise <any> {
    return (await this.socket as ISocket).connect(options).then(() => (this.setUpConnection()))
  }
  async disconnect (): Promise<any> { return (await this.socket as ISocket).disconnect() }
  async unsubscribe (subscription: ISubscription): Promise<any> { return (await this.socket as ISocket).unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return (await this.socket as ISocket).unsubscribeAll() }
  async subscribeNotifyAll (): Promise<any> { return (await this.socket as IDriver) .subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return (await this.socket as IDriver) .subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return (await this.socket as IDriver) .subscribeNotifyUser() }
  async onMessage (cb: ICallback): Promise<any> { return (await this.socket as IDriver).onMessage(cb) }
  async onTyping (cb: ICallback): Promise<any> { return (await this.socket as IDriver).onTyping(cb) }
  async onAgentChange (rid: string, cb: ICallback) {
    await this.subscribe(this.livechatStream, rid)
    await this.onStreamData(this.livechatStream, ({ fields: { args: [{ type, data }] } }: any) => {
      if (type === 'agentData') {
        cb(data)
      }
    })
  }
  async onAgentStatusChange (rid: string, cb: ICallback) {
    await this.subscribe(this.livechatStream, rid)
    await this.onStreamData(this.livechatStream, ({ fields: { args: [{ type, status }] } }: any) => {
      if (type === 'agentStatus') {
        cb(status)
      }
    })
  }

  async onQueuePositionChange (rid: string, cb: ICallback) {
    await this.subscribe(this.livechatStream, rid)
    await this.onStreamData(this.livechatStream, ({ fields: { args: [{ type, data }] } }: any) => {
      if (type === 'queueData') {
        cb(data)
      }
    })
  }

  async notifyVisitorTyping (rid: string, username: string, typing: boolean) {
    return (await this.socket as IDriver).notifyVisitorTyping(rid, username, typing, this.credentials.token)
  }

  async subscribe (topic: string, eventName: string) {
    const { token } = this.credentials
    return (await this.socket as ISocket).subscribe(topic, eventName, { token, visitorToken: token })
  }

  async subscribeRoom (rid: string) {
    const { token } = this.credentials
    return (await this.socket as IDriver).subscribeRoom(rid, { token, visitorToken: token })
  }

  async onStreamData (event: string, cb: ICallback): Promise<any> {
    return (await this.socket as ISocket).onStreamData(event, cb)
  }

  async setUpConnection () {
    const { token } = this.credentials
    return (await this.socket as IDriver).methodCall('livechat:setUpConnection', { token })
  }
}
