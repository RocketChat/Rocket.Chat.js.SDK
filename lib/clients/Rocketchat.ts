import type { IStream } from '../drivers/definitions'
import { Driver } from '../drivers/driver'
import ApiRocketChat from '../api/RocketChat'
import { ILoginResult, ICallback, ISubscription, ICredentials } from '../../interfaces'
import { logger as Logger } from '../log'
export default class RocketChatClient extends ApiRocketChat {
  userId: string = ''
  driver: Driver

  constructor ({ logger = Logger, ...config }: any) {
    super({ ...config, logger })
    this.driver = new Driver({ ...config, logger })
  }

  async resume ({ token }: { token: string }) {
    const login: ILoginResult = await this.driver.login({ token } as any, {})
    this.resumeLogin({ userId: login.id, authToken: login.token })
    return login
  }

  async login (credentials: ICredentials) {
    await super.login(credentials)
    return this.currentLogin && this.resume({ token: this.currentLogin.authToken })
  }

  async connect (): Promise<any> { return this.driver.connect() }
  async disconnect (): Promise<any> { return this.driver.disconnect() }
  async checkAndReopen (): Promise<void> { return this.driver.checkAndReopen() }
  async onStreamData (event: string, cb: ICallback): Promise<any> { return this.driver.onStreamData(event, cb) }
  async subscribe (topic: string, eventname: string, ...args: any[]): Promise<ISubscription | undefined> { return this.driver.subscribe(topic, eventname, ...args) }
  async subscribeRaw (...args: any[]): Promise<ISubscription | undefined> { return this.driver.subscribeRaw(...args) }
  async unsubscribe (subscription: ISubscription): Promise<any> { return this.driver.unsubscribe(subscription) }
  async unsubscribeAll (): Promise<any> { return this.driver.unsubscribeAll() }
  async whenReady (streams: IStream[], timeoutMs?: number): Promise<boolean> { return this.driver.whenReady(streams, timeoutMs) }
  async subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]> { return this.driver.subscribeRoom(rid, ...args) }
  async subscribeNotifyAll (): Promise<any> { return this.driver.subscribeNotifyAll() }
  async subscribeLoggedNotify (): Promise<any> { return this.driver.subscribeLoggedNotify() }
  async subscribeNotifyUser (): Promise<any> { return this.driver.subscribeNotifyUser() }
  get url () {
    return Promise.resolve(this.driver.config.host)
  }
  async onMessage (cb: ICallback): Promise<any> {
    return this.driver.onMessage(cb)
  }
  async methodCall (method: string, ...args: any[]): Promise<ISubscription> { return this.driver.methodCall(method, ...args) }

}
