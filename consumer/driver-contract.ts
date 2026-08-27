import { Rocketchat } from '../index'
import type { IDriver, ISocket } from '../lib/drivers/definitions'
import type { ILoginResult, IRealtimeCredentials, ISocketOptions } from '../interfaces'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false
type Expect<Value extends true> = Value
type IsAny<Value> = 0 extends (1 & Value) ? true : false

export type DriverContractAssertions = [
  Expect<InstanceType<typeof Rocketchat>['driver'] extends IDriver ? true : false>,
  Expect<Equal<IDriver['connect'], () => Promise<IDriver>>>,
  Expect<Equal<IDriver['disconnect'], () => Promise<void>>>,
  Expect<Equal<IDriver['login'], (credentials: IRealtimeCredentials) => Promise<ILoginResult>>>,
  Expect<Equal<Parameters<IDriver['login']>['length'], 1>>,
  Expect<Equal<Awaited<ReturnType<IDriver['login']>>, ILoginResult>>,
  Expect<Equal<IDriver['config'], ISocketOptions>>,
  Expect<Equal<IsAny<IDriver['config']>, false>>,
  Expect<Equal<ISocket, IDriver>>
]

declare const driver: IDriver

void driver.login({ resume: 'token' })
