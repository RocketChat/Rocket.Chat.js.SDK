import { ISocket, IDriver, Protocols } from '../drivers'
import ClientRest from '../api/RocketChat'
import { ILogger, ISocketOptions, ICallback, ISubscription, ICredentials } from '../../interfaces'
import { logger as Logger } from '../log'

type Realtime = ISocket & IDriver

export interface IRocketChatClientOptions extends ISocketOptions {
  logger?: ILogger
  protocol?: Protocols
  [option: string]: any
}

const serverOptions = ({
  logger: _logger,
  protocol: _protocol,
  allPublic: _allPublic,
  rooms: _rooms,
  integrationId: _integrationId,
  ...options
}: IRocketChatClientOptions) => options

export default class RocketChatClient extends ClientRest implements ISocket {
  userId: string = ''
  logger: ILogger
  socket: Promise<Realtime>
  ddp?: Realtime

  constructor (options: IRocketChatClientOptions) {
    const { logger = Logger, protocol = Protocols.DDP } = options
    const driverOptions = { ...serverOptions(options), logger }
    super(driverOptions)
    this.logger = logger
    if (protocol !== Protocols.DDP) {
      throw new Error(`Invalid Protocol: ${protocol}, valids: ${Object.keys(Protocols).join()}`)
    }
    this.socket = import(/* webpackChunkName: 'ddp' */ '../drivers/ddp').then(({ DDPDriver }) => {
      this.ddp = new DDPDriver(driverOptions)
      return this.ddp
    })
  }

  async resume ({ token }: { token: string }) {
    return (await this.socket).login({ token } as any, {})
  }

  async login (credentials: ICredentials) {
    await super.login(credentials)
    return this.currentLogin && this.resume({ token: this.currentLogin.authToken })
  }

  async connect (options: ISocketOptions): Promise<any> { return (await this.socket).connect(options) }
  async disconnect (): Promise<any> { return (await this.socket).disconnect() }
  async checkAndReopen (): Promise<void> { return (await this.socket).checkAndReopen() }
  async onStreamData (event: string, cb: ICallback): Promise<any> { return (await this.socket).onStreamData(event, cb) }
  async subscribe (topic: string, ...args: any[]): Promise<ISubscription | undefined> { return (await this.socket).subscribe(topic, ...args) }
  async subscribeRaw (...args: any[]): Promise<ISubscription | undefined> { return (await this.socket).subscribeRaw(...args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return (await this.socket).unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return (await this.socket).unsubscribeAll() }
  async subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]> { return (await this.socket).subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return (await this.socket).subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return (await this.socket).subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return (await this.socket).subscribeNotifyUser() }
  get url () {
    return this.socket.then((socket) => socket.config.host)
  }
  async onMessage (cb: ICallback): Promise<any> {
    return (await this.socket).onMessage(cb)
  }
  async methodCall (method: string, ...args: any[]): Promise<ISubscription> { return (await this.socket).methodCall(method, ...args) }

}
