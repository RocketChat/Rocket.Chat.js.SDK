import { ISocket, IDriver, Protocols } from '../drivers'
import ClientRest from '../api/RocketChat'
import { ILogger, ISocketOptions, ICallback, ISubscription } from '../../interfaces'
import { logger as Logger } from '../log'
import { EventEmitter } from 'tiny-events'

export default class RocketChatClient extends ClientRest implements ISocket {
  userId: string = ''
  logger: ILogger = Logger
  socket: Promise<ISocket | IDriver>
  config: any

  constructor ({ logger, allPublic, rooms, integrationId, protocol = Protocols.DDP, ...config }: any) {
    super({ ...config, logger })
    this.logger = logger
    switch (protocol) {
      case Protocols.MQTT:
        this.socket = import(/* webpackChunkName: 'mqtt' */ '../drivers/mqtt').then(({ MQTTDriver }) => new MQTTDriver({ ...config, logger }))
        break
      case Protocols.DDP:
        this.socket = import(/* webpackChunkName: 'ddp' */ '../drivers/ddp').then(({ DDPDriver }) => new DDPDriver({ ...config, logger }))
        break
      default:
        throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(Protocols).join()}`)
    }
  }

  async connect (options: ISocketOptions): Promise<any> { return (await this.socket as ISocket).connect(options) }
  async disconnect (): Promise<any> { return (await this.socket as ISocket).disconnect() }
  async onStreamData (event: string, cb: ICallback): Promise<any> { return (await this.socket as ISocket).onStreamData(event, cb) }
  async subscribe (topic: string, ...args: any[]): Promise<ISubscription> { return (await this.socket as ISocket).subscribe(topic, ...args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return (await this.socket as ISocket).unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return (await this.socket as ISocket).unsubscribeAll() }
  async subscribeRoom (rid: string, ...args: any[]): Promise<ISubscription[]> { return (await this.socket as IDriver).subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return (await this.socket as IDriver).subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return (await this.socket as IDriver).subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return (await this.socket as IDriver).subscribeNotifyUser() }
  get url () {
    return this.socket.then((socket) => (socket as IDriver).config.host)
  }
  async onMessage (cb: ICallback): Promise<any> {
    return (await this.socket as IDriver).onMessage(cb)
  }

}
