import { Rocketchat } from '../index'
import type { IDriver, ISocket } from '../index'
import type { ICallback, ILoginResult, IRealtimeCredentials, ISocketOptions, ISubscription } from '../interfaces'
import type { EventEmitter } from 'tiny-events'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false
type Expect<Value extends true> = Value
type IsAny<Value> = 0 extends (1 & Value) ? true : false

export type DriverContractAssertions = [
  Expect<InstanceType<typeof Rocketchat>['driver'] extends IDriver ? true : false>,
  Expect<Equal<Exclude<keyof InstanceType<typeof Rocketchat>['driver'], keyof IDriver | '_listeners'>, never>>,
  Expect<Equal<IDriver['connect'], () => Promise<IDriver>>>,
  Expect<Equal<IDriver['connected'], boolean>>,
  Expect<Equal<IDriver['disconnect'], () => Promise<void>>>,
  Expect<Equal<IDriver['checkAndReopen'], () => void>>,
  Expect<Equal<IDriver['reopenNow'], () => Promise<void>>>,
  Expect<Equal<IDriver['probe'], (deadlineMs?: number) => Promise<boolean>>>,
  Expect<Equal<IDriver['lastPing'], number>>,
  Expect<Equal<IDriver['pingInterval'], number>>,
  Expect<Equal<IDriver['login'], (credentials: IRealtimeCredentials) => Promise<ILoginResult>>>,
  Expect<Equal<Parameters<IDriver['login']>['length'], 1>>,
  Expect<Equal<Awaited<ReturnType<IDriver['login']>>, ILoginResult>>,
  Expect<Equal<IDriver['config'], ISocketOptions>>,
  Expect<Equal<IsAny<IDriver['config']>, false>>,
  Expect<Equal<InstanceType<typeof Rocketchat>['driver']['subscribeNotifyAll'], () => Promise<(ISubscription | undefined)[]>>>,
  Expect<Equal<InstanceType<typeof Rocketchat>['driver']['subscribeLoggedNotify'], () => Promise<(ISubscription | undefined)[]>>>,
  Expect<Equal<InstanceType<typeof Rocketchat>['driver']['subscribeNotifyUser'], () => Promise<(ISubscription | undefined)[]>>>,
  Expect<Equal<IDriver['onTyping'], (cb: ICallback) => EventEmitter>>,
  Expect<Equal<ISocket, IDriver>>
]

declare const driver: IDriver

void driver.login({ resume: 'token' })
