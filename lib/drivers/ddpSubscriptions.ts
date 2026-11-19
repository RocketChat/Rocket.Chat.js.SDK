import { ILogger, ISocketMessageCallback } from '../../interfaces'

import {
  IDDPSubscriptionRequest,
  IStream,
  RecordedDDPSubscription
} from './definitions'
import { DDPError } from './ddpError'
import { AbandonedRequest, ExpiredWait } from './ddpRequests'
import { sha256 } from 'js-sha256'

const subscriptionId = (name: string, params: any[]) =>
  `sub-${name}-${sha256(JSON.stringify(params))}`

interface DDPSubscriptionsOptions {
  getLogger: () => ILogger
  send: (message: any) => Promise<any>
  onEvent: (name: string, listener: ISocketMessageCallback) => void
  getCloseGeneration: () => number
  getTransport: () => unknown
  isOffline: () => boolean
  deadlineMs: number
}

export class DDPSubscriptions {
  readonly records: { [id: string]: RecordedDDPSubscription } = {}
  private getLogger: () => ILogger
  private send: (message: any) => Promise<any>
  private onEvent: (name: string, listener: ISocketMessageCallback) => void
  private getCloseGeneration: () => number
  private getTransport: () => unknown
  private isOffline: () => boolean
  private deadlineMs: number
  private subscriptionRequests: { [id: string]: Promise<void> } = {}
  private readyOn: { [id: string]: unknown } = {}

  constructor (
    { getLogger, send, onEvent, getCloseGeneration, getTransport, isOffline, deadlineMs }: DDPSubscriptionsOptions
  ) {
    this.getLogger = getLogger
    this.send = send
    this.onEvent = onEvent
    this.getCloseGeneration = getCloseGeneration
    this.getTransport = getTransport
    this.isOffline = isOffline
    this.deadlineMs = deadlineMs
    this.onEvent('ready', this.markRecordedReady)
  }

  private markRecordedReady = ({ subs = [] }: { subs?: string[] }) => {
    subs
      .filter((id) => this.records[id])
      .forEach((id) => { this.readyOn[id] = this.getTransport() })
  }

  private forgetSubscription = (id: string) => {
    delete this.records[id]
    delete this.readyOn[id]
  }

  forgetAllSubscriptions = () => {
    Object.keys(this.records).forEach((id) => this.forgetSubscription(id))
  }

  subscribe = (name: string, params: any[], callback?: ISocketMessageCallback) => {
    this.getLogger().info(`[ddp] Subscribe to ${name}, param: ${JSON.stringify(params)}`)
    const id = subscriptionId(name, params)
    return this.queueSubscriptionRequest(id, () => {
      const shared = this.records[id]
      if (!shared) return this.sendSubscription({ id, name, params }, callback)
      if (callback) shared.onEvent(callback)
      return Promise.resolve(shared)
    })
  }

  findSubscriptions = ({ name, params = [] }: IStream): RecordedDDPSubscription[] =>
    Object.values(this.records)
      .filter((subscription) => (
        subscription &&
        subscription.name === name &&
        params.every((param, index) => subscription.params?.[index] === param)
      ))

  waitForStreamsReady = (
    streams: IStream[],
    timeoutMs = this.deadlineMs
  ): Promise<boolean> => {
    const readyOnAttachedTransport = (subscription: RecordedDDPSubscription) => {
      const transport = this.getTransport()
      return transport !== undefined && this.readyOn[subscription.id] === transport
    }
    const everyStreamReady = () => streams.every((stream) => {
      const subscriptions = this.findSubscriptions(stream)
      return subscriptions.length > 0 && subscriptions.every(readyOnAttachedTransport)
    })

    if (everyStreamReady()) return Promise.resolve(true)

    return new Promise<boolean>((resolve) => {
      const finish = (value: boolean) => {
        clearInterval(poll)
        clearTimeout(deadline)
        resolve(value)
      }
      const deadline = setTimeout(() => finish(false), timeoutMs)
      const poll = setInterval(() => {
        if (everyStreamReady()) finish(true)
      }, 100)
    })
  }

  subscribeAll = () => Promise.all(
    Object.values(this.records).map((subscription) => this.resubscribe(subscription))
  )

  unsubscribe = (id: string) => {
    if (!this.records[id]) {
      return Promise.reject(new Error(`[ddp] No subscription to unsubscribe from: ${id}`))
    }
    if (this.isOffline()) {
      this.forgetSubscription(id)
      return Promise.resolve(undefined)
    }
    return this.queueSubscriptionRequest(id, () => {
      delete this.readyOn[id]
      return this.send({ msg: 'unsub', id })
    })
      .then((response: any) => {
        this.forgetSubscription(id)
        return response.result || response.subs
      })
      .catch((error) => {
        if (error instanceof DDPError) this.forgetSubscription(id)
        this.getLogger().error(`[ddp] Unsubscribe error: ${error.message}`)
        throw error
      })
  }

  unsubscribeAll = () => Promise.all(
    Object.values(this.records).map((subscription) =>
      subscription.unsubscribe().catch(() => undefined)
    )
  ).then(() => undefined)

  private queueSubscriptionRequest = <T>(id: string, request: () => Promise<T>): Promise<T> => {
    const waiting = this.subscriptionRequests[id]
    const sending = waiting ? waiting.then(request) : request()
    const settled = sending.then(() => undefined, () => undefined)

    this.subscriptionRequests[id] = settled
    settled.then(() => {
      if (this.subscriptionRequests[id] === settled) delete this.subscriptionRequests[id]
    })

    return sending
  }

  private resubscribe = (subscription: RecordedDDPSubscription) =>
    this.queueSubscriptionRequest(subscription.id, () => this.sendSubscription(subscription))

  private sendSubscription = (
    stream: IDDPSubscriptionRequest,
    callback?: ISocketMessageCallback
  ) => {
    if (this.isOffline()) {
      const recorded = this.records[stream.id]
      return Promise.resolve(recorded || this.writeSubscription(stream, callback))
    }
    const closesBefore = this.getCloseGeneration()
    const sentOn = this.getTransport()
    return this.send({ msg: 'sub', ...stream })
      .then((response) => {
        if (!response.subs?.length) return
        const recorded = this.rememberSubscription(stream, closesBefore, callback)
        if (recorded && this.getTransport() === sentOn) this.readyOn[stream.id] = sentOn
        return recorded
      })
      .catch((error) => {
        this.getLogger().error(`[ddp] Subscribe error: ${error.message}`)
        if (error instanceof AbandonedRequest || error instanceof ExpiredWait) {
          return this.rememberSubscription(stream, closesBefore, callback)
        }
        if (error instanceof DDPError) this.forgetSubscription(stream.id)
        return undefined
      })
  }

  private rememberSubscription = (
    stream: IDDPSubscriptionRequest,
    closesBefore: number,
    callback?: ISocketMessageCallback
  ) => {
    if (this.getCloseGeneration() !== closesBefore) return
    return this.writeSubscription(stream, callback)
  }

  private writeSubscription = (
    { id, name, params }: IDDPSubscriptionRequest,
    callback?: ISocketMessageCallback
  ) => {
    const unsubscribe = this.unsubscribe.bind(this, id)
    const onEvent = (listener: ISocketMessageCallback) => this.onEvent(name, listener)
    const subscription = { id, name, params, unsubscribe, onEvent }
    if (callback) subscription.onEvent(callback)
    this.records[id] = subscription
    return subscription
  }
}
