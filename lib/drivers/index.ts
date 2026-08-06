/**
 * @module Socket
 * Provides high-level helpers for DDP connection, method calls, subscriptions.
 */

import { EventEmitter } from '../EventEmitter'
import {
  ILogger,
  ISocketOptions,
  ICallback,
  ISubscription,
  ICredentials
} from '../../interfaces'

export interface ISocket {
  logger: ILogger
  connect (options: ISocketOptions): Promise<ISocket | IDriver>
  disconnect (): Promise<ISocket>
  // TODO: `DDPDriver` returns neither of these shapes. `Socket.checkAndReopen`
  // is sync fire-and-forget and returns `void`, and `Socket.subscribe` only
  // builds a subscription on the happy path. Widened to match the
  // implementation; narrowing it back is a breaking change, so it is deferred.
  checkAndReopen (): any
  subscribe (topic: string, ...args: any[]): Promise<any>
  subscribeRaw (...args: any[]): Promise<ISubscription>
  unsubscribe (subscription: ISubscription): Promise<ISocket>
  unsubscribeAll (): Promise<ISocket>

  onStreamData (event: string, cb: ICallback): Promise<any>

  on (event: string, listener: Function): EventEmitter
  once (event: string, listener: Function): EventEmitter
  off (event?: string, listener?: Function): EventEmitter
  // TODO: the vendored `EventEmitter` returns `this` from `emit` and an empty
  // array from `removeAllListeners`. Widened to match reality rather than
  // changing the emitter.
  emit (event: string, ...args: any[]): any
  removeAllListeners (event?: string): any[]
}

export interface IDriver {
  config: any
  login (credentials: ICredentials, args: any): Promise<any>

  subscribeRoom (rid: string, ...args: any[]): Promise<ISubscription[]>

  onMessage (cb: ICallback): void

  subscribeNotifyAll (): Promise<any>

  subscribeLoggedNotify (): Promise<any>

  subscribeNotifyUser (): Promise<any>

  subscribeNotifyUser (): Promise<IDriver>

  onTyping (cb: ICallback): Promise<any>

  notifyVisitorTyping (rid: string, username: string, typing: boolean, token: string): Promise<any>

  methodCall (method: string, ...args: any[]): Promise<any>
}

export enum Protocols {
	DDP = 'ddp'
}
