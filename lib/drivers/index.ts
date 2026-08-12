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

export interface ILiveness {
  readonly connected: boolean
  readonly lastPing: number
  readonly pingInterval: number
  probe (timeoutMs?: number): Promise<boolean>
  checkAndReopen (): void
  reopenNow (): Promise<void>
}

export interface ISocket {
  logger: ILogger
  connect (options: ISocketOptions): Promise<IDriver>
  disconnect (): Promise<void>
  checkAndReopen (): void
  subscribe (topic: string, ...args: any[]): Promise<ISubscription | undefined>
  subscribeRaw (...args: any[]): Promise<ISubscription | undefined>
  unsubscribe (subscription: ISubscription): Promise<any>
  unsubscribeAll (): Promise<void>

  onStreamData (event: string, cb: ICallback): Promise<any>

  on (event: string, listener: Function): EventEmitter
  once (event: string, listener: Function): EventEmitter
  off (event?: string, listener?: Function): EventEmitter
  emit (event: string, ...args: any[]): EventEmitter
  removeAllListeners (event?: string): Function[]
}

export interface IDriver extends ILiveness {
  config: ISocketOptions
  login (credentials: ICredentials, args: any): Promise<any>
  logout (): Promise<void>

  subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]>

  onMessage (cb: ICallback): void

  subscribeNotifyAll (): Promise<any>

  subscribeLoggedNotify (): Promise<any>

  subscribeNotifyUser (): Promise<any>

  onTyping (cb: ICallback): Promise<any>

  notifyVisitorTyping (rid: string, username: string, typing: boolean, token: string): Promise<any>

  methodCall (method: string, ...args: any[]): Promise<any>
}

export enum Protocols {
	MQTT = 'mqtt',
	DDP = 'ddp'
}
