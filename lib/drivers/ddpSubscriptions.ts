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
  isOffline: () => boolean
  deadlineMs: number
}

export class DDPSubscriptions {
  readonly records: { [id: string]: RecordedDDPSubscription } = {}
  private getLogger: () => ILogger
  private send: (message: any) => Promise<any>
  private onEvent: (name: string, listener: ISocketMessageCallback) => void
  private getCloseGeneration: () => number
  private isOffline: () => boolean
  private deadlineMs: number
  private subscriptionRequests: { [id: string]: Promise<void> } = {}

  constructor (
    { getLogger, send, onEvent, getCloseGeneration, isOffline, deadlineMs }: DDPSubscriptionsOptions
  ) {
    this.getLogger = getLogger
    this.send = send
    this.onEvent = onEvent
    this.getCloseGeneration = getCloseGeneration
    this.isOffline = isOffline
    this.deadlineMs = deadlineMs
  }

  private forgetSubscription = (id: string) => {
    delete this.records[id]
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

  resubscribeWhenRecorded = (
    streams: IStream[],
    timeoutMs = this.deadlineMs
  ): Promise<boolean> => {
    const recordedPerStream = () => streams.map((stream) => this.findSubscriptions(stream))
    const resubscribeAll = (subscriptions: RecordedDDPSubscription[]) => Promise.all(
      subscriptions.map((subscription) => this.resubscribe(subscription))
    )
      .then((responses) => {
        const unrecorded = subscriptions.filter((_, index) => !responses[index])
        unrecorded.forEach((subscription) => this.getLogger().error(
          `[ddp] Subscribe not recorded: ${subscription.params?.[0]}`
        ))
        return unrecorded.length === 0
      })
      .catch(() => false)

    return new Promise<boolean>((resolve) => {
      let settled = false
      let inFlight = false
      const finish = (value: boolean) => {
        if (settled) return
        settled = true
        clearInterval(poll)
        clearTimeout(deadline)
        resolve(value)
      }
      const attempt = () => {
        if (inFlight || this.isOffline()) return
        const subscriptionsPerStream = recordedPerStream()
        if (!subscriptionsPerStream.every((subscriptions) => subscriptions.length > 0)) return
        inFlight = true
        const recorded = subscriptionsPerStream.reduce(
          (all, perStream) => all.concat(perStream),
          [] as RecordedDDPSubscription[]
        )
        resubscribeAll(recorded).then((value) => {
          inFlight = false
          finish(value)
        })
      }
      const deadline = setTimeout(() => finish(false), timeoutMs)
      const poll = setInterval(attempt, 100)
      attempt()
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
    return this.queueSubscriptionRequest(id, () => this.send({ msg: 'unsub', id }))
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
    return this.send({ msg: 'sub', ...stream })
      .then((response) => {
        if (response.subs?.length) return this.rememberSubscription(stream, closesBefore, callback)
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
