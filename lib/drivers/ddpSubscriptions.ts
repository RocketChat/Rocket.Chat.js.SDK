import { ILogger, ISocketMessageCallback } from '../../interfaces'

import {
  IDDPSubscriptionRequest,
  IStream,
  RecordedDDPSubscription
} from './definitions'
import { DDPError } from './ddpError'
import { AbandonedRequest, ExpiredWait } from './ddpRequests'
import { sha256 } from 'js-sha256'

/** See ADR-0011. */
const subscriptionId = (name: string, params: any[]) =>
  `sub-${name}-${sha256(JSON.stringify(params))}`

interface DDPSubscriptionsOptions {
  getLogger: () => ILogger
  send: (message: any) => Promise<any>
  onEvent: (name: string, listener: ISocketMessageCallback) => void
  hasConnection: () => boolean
  deadlineMs: number
}

/**
 * Sole owner of `records`: an entry is written when the server acknowledged the
 * `sub`, or when its answer was abandoned after the frame went out on a
 * connection that is still installed. A refused `sub`, one that never reached
 * the wire, and one whose connection is gone leave nothing behind, and a
 * resubscribe under an existing id that the server refuses forgets that entry.
 * The caller is handed a subscription exactly when an entry was written, so
 * every recorded stream can be unsubscribed from.
 * See ADR-0004, ADR-0006, ADR-0011 and ADR-0012.
 */
export class DDPSubscriptions {
  records: { [id: string]: RecordedDDPSubscription } = {}
  private getLogger: () => ILogger
  private send: (message: any) => Promise<any>
  private onEvent: (name: string, listener: ISocketMessageCallback) => void
  private hasConnection: () => boolean
  private deadlineMs: number
  private subscriptionRequests: { [id: string]: Promise<void> } = {}

  constructor (
    { getLogger, send, onEvent, hasConnection, deadlineMs }: DDPSubscriptionsOptions
  ) {
    this.getLogger = getLogger
    this.send = send
    this.onEvent = onEvent
    this.hasConnection = hasConnection
    this.deadlineMs = deadlineMs
  }

  forgetSubscription = (id: string) => {
    delete this.records[id]
  }

  /** Drop every DDP subscription, one key at a time, in the same object. */
  forgetAllSubscriptions = () => {
    Object.keys(this.records).forEach((id) => this.forgetSubscription(id))
  }

  /**
   * Subscribe to a stream on server via socket and returns a promise resolved
   * with the subscription object when the subscription is ready.
   *
   * A second call for a stream already recorded shares that record and sends
   * nothing.
   * @param name      Stream name to subscribe to
   * @param params    Params sent to the subscription request
   */
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

  /**
   * The DDP subscriptions recorded here for one stream name, matched on a
   * prefix of the params given.
   */
  findSubscriptions = ({ name, params = [] }: IStream): RecordedDDPSubscription[] =>
    Object.values(this.records)
      .filter((subscription) => (
        subscription &&
        subscription.name === name &&
        params.every((param, index) => subscription.params?.[index] === param)
      ))

  /**
   * Re-send the given streams on the current connection under the ids they were
   * first sent with, and resolve on whether the server acked every one of them.
   *
   * Nothing goes out until every stream asked for is recorded here, so the
   * deadline expiring first resolves false.
   */
  resubscribeWhenRecorded = (
    streams: IStream[],
    timeoutMs = this.deadlineMs
  ): Promise<boolean> => {
    const recordedPerStream = () => streams.map((stream) => this.findSubscriptions(stream))
    const resubscribeAll = (subscriptions: RecordedDDPSubscription[]) => Promise.all(
      subscriptions.map((subscription) => this.resubscribe(subscription))
    )
      .then((responses) => {
        const unacknowledged = subscriptions.filter((_, index) => !responses[index])
        unacknowledged.forEach((subscription) => this.getLogger().error(
          `[ddp] Subscribe not acknowledged: ${subscription.params?.[0]}`
        ))
        return unacknowledged.length === 0
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
        if (inFlight) return
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

  /** Subscribe to all pre-configured streams (e.g. on login resume) */
  subscribeAll = () => Promise.all(
    Object.values(this.records).map((subscription) => this.resubscribe(subscription))
  )

  /** Unsubscribe to server stream, resolve with unsubscribe request result */
  unsubscribe = (id: string) => {
    if (!this.records[id]) {
      return Promise.reject(new Error(`[ddp] No subscription to unsubscribe from: ${id}`))
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

  /** Unsubscribe from all active subscriptions, ignoring any the server refuses */
  unsubscribeAll = () => Promise.all(
    Object.values(this.records).map((subscription) =>
      subscription.unsubscribe().catch(() => undefined)
    )
  ).then(() => undefined)

  /**
   * Hold a `sub` or `unsub` until the one before it on the same id has its DDP
   * response.
   *
   * A `sub` and an `unsub` for one DDP subscription carry the same id, and
   * `send` matches a DDP response to its request by id alone, so two of them in
   * flight at once leave the first response settling both — the `nosub` that
   * ends the DDP subscription also settles the `sub`, and the `ready` that
   * establishes it also settles the `unsub`. The server takes one message from
   * a session at a time and answers in that order, so waiting for the response
   * is enough to keep one request per id on the wire.
   *
   * The wait is bounded by the request before it, which each send bounds in
   * turn with its own deadline, so a chain always drains.
   */
  private queueSubscriptionRequest = <T>(id: string, request: () => Promise<T>): Promise<T> => {
    // The tail is registered here rather than when the frame goes out, so a
    // third request queues behind the second rather than behind the first.
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
  ) => this.send({ msg: 'sub', ...stream })
    .then((response) => {
      if (response.subs?.length) return this.rememberSubscription(stream, callback)
    })
    .catch((error) => {
      this.getLogger().error(`[ddp] Subscribe error: ${error.message}`)
      if (error instanceof AbandonedRequest || error instanceof ExpiredWait) {
        return this.rememberSubscription(stream, callback)
      }
      if (error instanceof DDPError) this.forgetSubscription(stream.id)
      return undefined
    })

  /**
   * Write the entry that instructs `subscribeAll` to establish this stream.
   * A stream only belongs to an installed connection, so with none there is
   * nothing for a later login to re-establish. A close forgets these entries
   * locally and sends no `unsub`: closing the connection ends the streams on
   * the server.
   */
  private rememberSubscription = (
    { id, name, params }: IDDPSubscriptionRequest,
    callback?: ISocketMessageCallback
  ) => {
    if (!this.hasConnection()) return
    const unsubscribe = this.unsubscribe.bind(this, id)
    const onEvent = (listener: ISocketMessageCallback) => this.onEvent(name, listener)
    const subscription = { id, name, params, unsubscribe, onEvent }
    if (callback) subscription.onEvent(callback)
    this.records[id] = subscription
    return subscription
  }
}
