import type { ISocket, IStream } from '../drivers/definitions'
import { Driver } from '../drivers/driver'
import ApiRocketChat from '../api/RocketChat'
import { ILoginResult, ICallback, ISubscription, ICredentials } from '../../interfaces'
import { logger as Logger } from '../log'
export default class RocketChatClient extends ApiRocketChat implements ISocket {
  userId: string = ''
  ddp: Driver

  constructor ({ logger = Logger, ...config }: any) {
    super({ ...config, logger })
    this.ddp = new Driver({ ...config, logger })
  }

  async resume ({ token }: { token: string }) {
    const login: ILoginResult = await this.ddp.login({ token } as any, {})
    this.resumeLogin({ userId: login.id, authToken: login.token })
    return login
  }

  async login (credentials: ICredentials) {
    await super.login(credentials)
    return this.currentLogin && this.resume({ token: this.currentLogin.authToken })
  }

  async connect (): Promise<any> { return this.ddp.connect() }
  async disconnect (): Promise<any> { return this.ddp.disconnect() }
  async checkAndReopen (): Promise<void> { return this.ddp.checkAndReopen() }
  async onStreamData (event: string, cb: ICallback): Promise<any> { return this.ddp.onStreamData(event, cb) }
  async subscribe (topic: string, ...args: any[]): Promise<ISubscription | undefined> { return (this.ddp as ISocket).subscribe(topic, ...args) }
  async subscribeRaw (...args: any[]): Promise<ISubscription | undefined> { return this.ddp.subscribeRaw(...args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return this.ddp.unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return this.ddp.unsubscribeAll() }
  async resubscribeWhenRecorded (streams: IStream[], timeoutMs?: number): Promise<boolean> { return this.ddp.resubscribeWhenRecorded(streams, timeoutMs) }
  async subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]> { return this.ddp.subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return this.ddp.subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return this.ddp.subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return this.ddp.subscribeNotifyUser() }
  get url () {
    return Promise.resolve(this.ddp.config.host)
  }
  async onMessage (cb: ICallback): Promise<any> {
    return this.ddp.onMessage(cb)
  }
  async methodCall (method: string, ...args: any[]): Promise<ISubscription> { return this.ddp.methodCall(method, ...args) }

}
