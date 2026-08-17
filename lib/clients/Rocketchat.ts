import type { ISocket, IDriver, IStream } from '../drivers/definitions'
import { Driver } from '../drivers/driver'
import ClientRest from '../api/RocketChat'
import { ILogger, ISocketOptions, ICallback, ISubscription, ICredentials } from '../../interfaces'
import { logger as Logger } from '../log'
export default class RocketChatClient extends ClientRest implements ISocket {
  userId: string = ''
  logger: ILogger = Logger
  socket: Promise<ISocket | IDriver>
  ddp: Driver

  constructor ({ logger, ...config }: any) {
    super({ ...config, logger })
    this.logger = logger
    this.ddp = new Driver({ ...config, logger })
    this.socket = Promise.resolve(this.ddp)
  }

  async resume ({ token }: { token: string }) {
    return (await this.socket as IDriver).login({ token } as any, {})
  }

  async login (credentials: ICredentials) {
    await super.login(credentials)
    return this.currentLogin && this.resume({ token: this.currentLogin.authToken })
  }

  async connect (options: ISocketOptions): Promise<any> { return (await this.socket as ISocket).connect(options) }
  async disconnect (): Promise<any> { return (await this.socket as ISocket).disconnect() }
  async checkAndReopen (): Promise<void> { return (await this.socket as ISocket).checkAndReopen() }
  async onStreamData (event: string, cb: ICallback): Promise<any> { return (await this.socket as ISocket).onStreamData(event, cb) }
  async subscribe (topic: string, ...args: any[]): Promise<ISubscription | undefined> { return (await this.socket as ISocket).subscribe(topic, ...args) }
  async subscribeRaw (...args: any[]): Promise<ISubscription | undefined> { return (await this.socket as ISocket).subscribeRaw(...args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return (await this.socket as ISocket).unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return (await this.socket as ISocket).unsubscribeAll() }
  async resubscribeWhenRecorded (streams: IStream[], timeoutMs?: number): Promise<boolean> { return (await this.socket as ISocket).resubscribeWhenRecorded(streams, timeoutMs) }
  async subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]> { return (await this.socket as IDriver).subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return (await this.socket as IDriver).subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return (await this.socket as IDriver).subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return (await this.socket as IDriver).subscribeNotifyUser() }
  get url () {
    return this.socket.then((socket) => (socket as IDriver).config.host)
  }
  async onMessage (cb: ICallback): Promise<any> {
    return (await this.socket as IDriver).onMessage(cb)
  }
  async methodCall (method: string, ...args: any[]): Promise<ISubscription> { return (await this.socket as IDriver).methodCall(method, ...args) }

}
