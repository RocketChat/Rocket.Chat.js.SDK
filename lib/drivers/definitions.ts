import { EventEmitter } from 'tiny-events'
import {
  ILogger,
  ICallback,
  ISubscription,
  ISocketMessageCallback,
  IRealtimeCredentials,
  ILoginResult,
  ISocketOptions
} from '../../interfaces'

export interface IDDPSubscriptionRequest {
  id: string
  name: string
  params: any[]
}

export type RecordedDDPSubscription = ISubscription & IDDPSubscriptionRequest & {
  onEvent: (callback: ISocketMessageCallback) => void
}

export interface IStream {
  name: string
  params?: any[]
}

export interface IDriver {
  logger: ILogger
  config: ISocketOptions
  messages: ISubscription | undefined
  userId: string
  joinedIds: string[]
  connect (): Promise<IDriver>
  connected: boolean
  disconnect (): Promise<void>
  reopenNow (): Promise<void>
  probe (deadlineMs?: number): Promise<boolean>
  lastPing: number
  pingInterval: number
  subscribe (topic: string, eventname: string, ...args: any[]): Promise<ISubscription | undefined>
  subscribeRaw (name: string, params: any[]): Promise<ISubscription | undefined>
  unsubscribe (subscription: ISubscription): Promise<any>
  unsubscribeAll (): Promise<void>
  resubscribeWhenRecorded (streams: IStream[], timeoutMs?: number): Promise<boolean>
  onStreamData (event: string, cb: ICallback): Promise<any>
  on (event: string, listener: Function): EventEmitter
  once (event: string, listener: Function): EventEmitter
  off (event?: string, listener?: Function): EventEmitter
  emit (event: string, ...args: any[]): EventEmitter
  removeAllListeners (event?: string): Function[]
  login (credentials: IRealtimeCredentials): Promise<ILoginResult>
  logout (): Promise<any>
  subscribeRoom (rid: string, ...args: any[]): Promise<(ISubscription | undefined)[]>
  onMessage (cb: ICallback): void
  subscribeNotifyAll (): Promise<(ISubscription | undefined)[]>
  subscribeLoggedNotify (): Promise<(ISubscription | undefined)[]>
  subscribeNotifyUser (): Promise<(ISubscription | undefined)[]>
  waitForNotifyUserMediaSubs (timeoutMs?: number): Promise<boolean>
  onTyping (cb: ICallback): EventEmitter
  notifyVisitorTyping (rid: string, username: string, typing: boolean, token: string): Promise<any>
  ejsonMessage (message: any): any
  methodCall (method: string, ...args: any[]): Promise<any>
}
