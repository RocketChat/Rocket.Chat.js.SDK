import { ILogger } from '../../interfaces'

import { SDKEventEmitter } from '../emitter'
import { toError } from './ddpError'

const deadlineExpired = '[ddp] no response arrived before the deadline'

export const abandonedWaitMessages = {
  responseReopened: '[ddp] connection reopened before the response arrived',
  responseClosed: '[ddp] connection closed before the response arrived',
  connectionReplacedBeforeWrite: '[ddp] connection replaced before the message was written',
  connectionClosedBeforeOpen: '[ddp] connection closed before it opened'
} as const

export type AbandonedWaitMessage = typeof abandonedWaitMessages[keyof typeof abandonedWaitMessages]

const failedConnectionAttemptMessages = {
  superseded: '[ddp] connection attempt was superseded before it completed',
  deadlineExpired: '[ddp] connection attempt did not complete before the deadline',
  transportFailed: '[ddp] transport failed during the connection attempt'
} as const

type FailedConnectionAttemptMessage =
  typeof failedConnectionAttemptMessages[keyof typeof failedConnectionAttemptMessages]

interface DDPRequestsOptions {
  emitter: SDKEventEmitter
  getLogger: () => ILogger
  nextId: (id?: string) => string
  deadlineMs: number
}

export class FailedConnectionAttempt extends Error {
  static superseded = () =>
    new FailedConnectionAttempt(failedConnectionAttemptMessages.superseded)

  static deadlineExpired = () =>
    new FailedConnectionAttempt(failedConnectionAttemptMessages.deadlineExpired)

  static transportFailed = () =>
    new FailedConnectionAttempt(failedConnectionAttemptMessages.transportFailed)

  protected constructor (message: FailedConnectionAttemptMessage) {
    super(message)
    Object.setPrototypeOf(this, FailedConnectionAttempt.prototype)
  }
}

export class AbandonedWait extends Error {
  static connectionClosedBeforeOpen = () =>
    new AbandonedWait(abandonedWaitMessages.connectionClosedBeforeOpen)

  static connectionReplacedBeforeWrite = () =>
    new AbandonedWait(abandonedWaitMessages.connectionReplacedBeforeWrite)

  static responseClosed = () =>
    new AbandonedWait(abandonedWaitMessages.responseClosed)

  protected constructor (message: AbandonedWaitMessage) {
    super(message)
    Object.setPrototypeOf(this, AbandonedWait.prototype)
  }
}

export class AbandonedRequest extends AbandonedWait {
  constructor (public id: string, message: AbandonedWaitMessage) {
    super(message)
    Object.setPrototypeOf(this, AbandonedRequest.prototype)
  }
}

export class ExpiredWait extends Error {
  constructor (public id: string) {
    super(deadlineExpired)
    Object.setPrototypeOf(this, ExpiredWait.prototype)
  }
}

export class DDPRequests {
  private emitter: SDKEventEmitter
  private getLogger: () => ILogger
  private nextId: (id?: string) => string
  private deadlineMs: number
  private written = new Set<(message: AbandonedWaitMessage) => void>()

  constructor ({ emitter, getLogger, nextId, deadlineMs }: DDPRequestsOptions) {
    this.emitter = emitter
    this.getLogger = getLogger
    this.nextId = nextId
    this.deadlineMs = deadlineMs
  }

  abandonAll = (message: AbandonedWaitMessage) => {
    const abandoning = [...this.written]
    this.written.clear()
    abandoning.forEach((abandon) => abandon(message))
  }

  send = (message: any, write: (value: string) => void, deadlineMs = this.deadlineMs): Promise<any> =>
    new Promise<any>((resolve, reject) => {
      const id = this.nextId(message.id)
      const isHandshakeMessage = /connect|ping|pong/.test(message.msg)
      const outboundMessage = { ...message, ...(isHandshakeMessage ? {} : { id }) }
      const serialized = JSON.stringify(outboundMessage)
      const listener = (outboundMessage.msg === 'ping' && 'pong') || (outboundMessage.msg === 'connect' && 'connected') || outboundMessage.id
      this.getLogger().debug(`[ddp] sending message: ${serialized}`)

      try {
        write(serialized)
      } catch (error) {
        this.getLogger().error(`[ddp] the transport failed to write the message: ${serialized}`)
        return reject(error)
      }

      if (!listener) return resolve(undefined)

      const onAbandon = (abandonedFor: AbandonedWaitMessage) => {
        endWait()
        reject(new AbandonedRequest(id, abandonedFor))
      }

      let deadlineTimer: NodeJS.Timer | number | undefined

      const endWait = () => {
        clearTimeout(deadlineTimer as any)
        this.written.delete(onAbandon)
        this.emitter.off(listener, onResponse)
      }

      deadlineTimer = setTimeout(() => {
        endWait()
        reject(new ExpiredWait(id))
      }, deadlineMs)

      const onResponse = (response: any) => {
        endWait()
        return response.error
          ? reject(toError(response.error))
          : resolve({ ...(isHandshakeMessage ? {} : { id }), ...response })
      }

      this.written.add(onAbandon)
      this.emitter.once(listener, onResponse)
    })
}
