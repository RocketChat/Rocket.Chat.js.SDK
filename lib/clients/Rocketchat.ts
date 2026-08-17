import type { ISocket } from '../drivers/definitions'
import { Driver } from '../drivers/driver'
import ClientRest from '../api/RocketChat'
import { ILogger, ISocketOptions, ICallback, ISubscription, ICredentials } from '../../interfaces'
import { logger as Logger } from '../log'
export default class RocketChatClient extends ClientRest implements ISocket {
  userId: string = ''
  logger: ILogger = Logger
  socket: Driver
  ddp: Driver

  constructor ({ logger, ...config }: any) {
    super({ ...config, logger })
    this.logger = logger
    this.ddp = new Driver({ ...config, logger })
    this.socket = this.ddp
  }

  async resume ({ token }: { token: string }) {
    return this.socket.login({ token } as any, {})
  }

  async login (credentials: ICredentials) {
    await super.login(credentials)
    return this.currentLogin && this.resume({ token: this.currentLogin.authToken })
  }

  async connect (options: ISocketOptions): Promise<any> { return this.socket.connect(options) }
  async disconnect (): Promise<any> { return this.socket.disconnect() }
  async checkAndReopen (): Promise<void> { return this.socket.checkAndReopen() }
  async onStreamData (event: string, cb: ICallback): Promise<any> { return this.socket.onStreamData(event, cb) }
  async subscribe (topic: string, ...args: any[]): Promise<ISubscription | undefined> { return (this.socket as ISocket).subscribe(topic, ...args) }
  async subscribeRaw (...args: any[]): Promise<ISubscription | undefined> { return this.socket.subscribeRaw(...args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return this.socket.unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return this.socket.unsubscribeAll() }
  async subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]> { return this.socket.subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return this.socket.subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return this.socket.subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return this.socket.subscribeNotifyUser() }
  get url () {
    return Promise.resolve(this.socket.config.host)
  }
  async onMessage (cb: ICallback): Promise<any> {
    return this.socket.onMessage(cb)
  }
  async methodCall (method: string, ...args: any[]): Promise<ISubscription> { return this.socket.methodCall(method, ...args) }

}
