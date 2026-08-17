/**
 * @module Socket
 * Provides high-level helpers for DDP connection, method calls, subscriptions.
 */

import { EventEmitter } from 'tiny-events'
import {
  ILogger,
  ISocketOptions,
  ICallback,
  ISubscription,
  ICredentials
} from '../../interfaces'

export interface ISocket {
  logger: ILogger
  connect (options: ISocketOptions): Promise<IDriver>
  disconnect (): Promise<ISocket>
  checkAndReopen (): void
  subscribe (topic: string, ...args: any[]): Promise<ISubscription | undefined>
  subscribeRaw (...args: any[]): Promise<ISubscription | undefined>
  unsubscribe (subscription: ISubscription): Promise<ISocket>
  unsubscribeAll (): Promise<void>

  onStreamData (event: string, cb: ICallback): Promise<any>

  on (event: string, listener: Function): EventEmitter
  once (event: string, listener: Function): EventEmitter
  off (event?: string, listener?: Function): EventEmitter
  emit (event: string, ...args: any[]): EventEmitter
  removeAllListeners (event?: string): Function[]
}

export interface IDriver {
  config: any
  login (credentials: ICredentials, args: any): Promise<any>

  subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]>

  onMessage (cb: ICallback): void

  subscribeNotifyAll (): Promise<any>

  subscribeLoggedNotify (): Promise<any>

  subscribeNotifyUser (): Promise<any>

  onTyping (cb: ICallback): Promise<any>

  notifyVisitorTyping (rid: string, username: string, typing: boolean, token: string): Promise<any>

  methodCall (method: string, ...args: any[]): Promise<any>
}
