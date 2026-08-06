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
  checkAndReopen (): Promise<ISocket>
  subscribe (topic: string, ...args: any[]): Promise<ISubscription>
  subscribeRaw (...args: any[]): Promise<ISubscription>
  unsubscribe (subscription: ISubscription): Promise<ISocket>
  unsubscribeAll (): Promise<ISocket>

  onStreamData (event: string, cb: ICallback): Promise<any>

  on (event: string, listener: Function): EventEmitter
  once (event: string, listener: Function): EventEmitter
  off (event?: string, listener?: Function): EventEmitter
  // TODO: the vendored `EventEmitter` returns `this` from `emit` and nothing from
  // `removeAllListeners`. Widened to match reality rather than changing the emitter.
  emit (event: string, ...args: any[]): any
  removeAllListeners (event?: string): any
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
