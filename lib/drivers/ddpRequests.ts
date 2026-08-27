import { ILogger } from '../../interfaces'

import { SDKEventEmitter } from '../emitter'
import { toError } from './ddpError'

const deadlineExpired = '[ddp] no response arrived before the deadline'

export const abandonedWaitMessages = {
  responseReopened: '[ddp] connection reopened before the response arrived',
  responseClosed: '[ddp] connection closed before the response arrived',
  connectionReplacedBeforeWrite: '[ddp] connection replaced before the message was written',
  connectionClosedBeforeOpen: '[ddp] connection closed before it opened'
}

interface DDPRequestsOptions {
  emitter: SDKEventEmitter
  getLogger: () => ILogger
  nextId: (id?: string) => string
  deadlineMs: number
}

export class AbandonedWait extends Error {
  constructor (message?: string) {
    super(message)
    Object.setPrototypeOf(this, AbandonedWait.prototype)
  }
}

export class AbandonedRequest extends AbandonedWait {
  constructor (public id: string, message: string) {
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

  constructor ({ emitter, getLogger, nextId, deadlineMs }: DDPRequestsOptions) {
    this.emitter = emitter
    this.getLogger = getLogger
    this.nextId = nextId
    this.deadlineMs = deadlineMs
  }

  send = (message: any, write: (value: string) => void, deadlineMs = this.deadlineMs): Promise<any> =>
    new Promise<any>((resolve, reject) => {
      const id = this.nextId(message.id)
      const outboundMessage = { ...message, ...(/connect|ping|pong/.test(message.msg) ? {} : { id }) }
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

      const abandonListeners = [
        { event: 'disconnected', message: abandonedWaitMessages.responseReopened },
        { event: 'connecting', message: abandonedWaitMessages.responseReopened },
        { event: 'close', message: abandonedWaitMessages.responseClosed }
      ].map(({ event, message }) => ({
        event,
        onAbandon: () => {
          removeListeners()
          reject(new AbandonedRequest(id, message))
        }
      }))

      let deadlineTimer: NodeJS.Timer | number | undefined

      const removeListeners = () => {
        clearTimeout(deadlineTimer as any)
        this.emitter.off(listener, onResponse)
        abandonListeners.forEach(({ event, onAbandon }) => this.emitter.off(event, onAbandon))
      }

      deadlineTimer = setTimeout(() => {
        removeListeners()
        reject(new ExpiredWait(id))
      }, deadlineMs)

      const onResponse = (response: any) => {
        removeListeners()
        return response.error
          ? reject(toError(response.error))
          : resolve({ ...(/connect|ping|pong/.test(message.msg) ? {} : { id }), ...response })
      }

      abandonListeners.forEach(({ event, onAbandon }) => this.emitter.once(event, onAbandon))
      this.emitter.once(listener, onResponse)
    })
}
