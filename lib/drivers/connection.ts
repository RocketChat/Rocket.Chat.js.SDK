/**
 * @module Connection
 * The Connection work of one Socket: Idle, one Scheduled Reopen, or one active
 * Connection Attempt, the Transport those produce, and the Close ownership that
 * cancels either. The Socket builds and wires a Transport and runs the DDP
 * handshake on it; which Transport exists, and who is settled by its outcome,
 * is decided here.
 */

import { ILogger } from '../../interfaces'

import {
  AbandonedWait,
  AbandonedWaitMessage,
  abandonedWaitMessages,
  FailedConnectionAttempt
} from './ddpRequests'
import type Transport from 'universal-websocket-client'

export type { Transport }

/** The code the SDK closes a Transport with when it asked for the close. */
export const intentionalCloseCode = 4000
export const transportOpenState = 1
export const transportClosedState = 3

interface Waiter {
  resolve: () => void
  reject: (error: Error) => void
}

interface Attempt {
  forced: boolean
  recovery: boolean
  deadline?: NodeJS.Timer | number
  waiters: Waiter[]
}

/** The token a Socket carries back to say which attempt a callback belongs to. */
export type { Attempt as ConnectionAttempt }

interface ConnectionOptions {
  getLogger: () => ILogger
  reopenDelayMs: number
  deadlineMs: number
  hasUsableTransport: () => boolean
  constructTransport: (attempt: Attempt) => Transport
  awaitTransportClose: (transport: Transport) => Promise<void>
  abandonWrittenWaits: (message: AbandonedWaitMessage) => void
  refuseEveryWait: () => void
  forgetConnection: () => void
  emit: (event: string, ...args: any[]) => void
}

const asError = (error: unknown) =>
  error instanceof Error ? error : FailedConnectionAttempt.transportFailed()

export class Connection {
  private options: ConnectionOptions
  private transport?: Transport
  private attempt?: Attempt
  private closeAnnouncedFor?: Transport
  private scheduledReopen?: NodeJS.Timer | number
  private closeSettlement?: Promise<void>
  private closeOwned = false
  private closes = 0

  constructor (options: ConnectionOptions) {
    this.options = options
  }

  get attachedTransport () {
    return this.transport
  }

  get closing () {
    return this.closeOwned
  }

  get closesTaken () {
    return this.closes
  }

  get offline () {
    return !this.transport && !this.closeOwned
  }

  isCurrent = (attempt: Attempt) => this.attempt === attempt

  open = (): Promise<void> => {
    if (this.closeOwned) return Promise.reject(AbandonedWait.connectionClosedBeforeOpen())
    if (this.attempt) return this.join(this.attempt)

    const recovery = this.cancelScheduledReopen()
    if (this.options.hasUsableTransport()) return Promise.resolve()
    return this.start(false, recovery)
  }

  reopen = () => {
    if (this.closeOwned) return
    if (this.attempt) {
      this.attempt.recovery = true
      return
    }
    if (this.scheduledReopen) return
    this.scheduleReopen()
  }

  reopenNow = (): Promise<void> => {
    if (this.closeOwned) return Promise.reject(AbandonedWait.connectionClosedBeforeOpen())
    if (this.attempt?.forced) return this.join(this.attempt)

    this.cancelScheduledReopen()
    const superseded = this.attempt
    if (superseded) {
      this.abandonAttempt(superseded, abandonedWaitMessages.responseReopened)
      this.reject(superseded, FailedConnectionAttempt.superseded())
    }
    return this.start(true, true)
  }

  close = (): Promise<void> => {
    if (this.closeSettlement) return this.closeSettlement

    this.closeOwned = true
    this.closes += 1
    this.cancelScheduledReopen()
    const canceled = this.attempt
    if (canceled) {
      this.clearDeadline(canceled)
      this.attempt = undefined
    }
    this.options.refuseEveryWait()
    if (canceled) this.reject(canceled, AbandonedWait.connectionClosedBeforeOpen())

    const settling = this.letTransportGo()
    this.closeSettlement = settling
    settling.then(this.forgetCloseSettlement, this.forgetCloseSettlement)
    return settling
  }

  succeed = (attempt: Attempt) => {
    const succeeded = this.attempt
    if (succeeded !== attempt) return

    this.clearDeadline(succeeded)
    this.attempt = undefined
    this.options.emit('open')
    succeeded.waiters.forEach(({ resolve }) => resolve())
  }

  fail = (attempt: Attempt, error: unknown) => {
    const failed = this.attempt
    if (failed !== attempt) return

    this.abandonAttempt(failed, abandonedWaitMessages.responseReopened)
    if (failed.recovery) this.reopen()
    this.reject(failed, asError(error))
  }

  transportLost = (transport: Transport, event: any, unexpected: boolean) => {
    if (transport !== this.transport || this.closeAnnouncedFor === transport) return
    this.closeAnnouncedFor = transport

    const lost = this.attempt
    if (lost) this.abandonAttempt(lost, abandonedWaitMessages.responseClosed)
    else {
      if (this.closeOwned) this.makeInert(transport)
      else this.release(transport)
      this.options.abandonWrittenWaits(abandonedWaitMessages.responseClosed)
    }
    if (lost ? lost.recovery : unexpected) this.reopen()

    this.options.emit('close', event)
    if (lost) this.reject(lost, FailedConnectionAttempt.transportFailed())
  }

  private start = (forced: boolean, recovery: boolean): Promise<void> => {
    const attempt: Attempt = { forced, recovery, waiters: [] }
    this.attempt = attempt
    this.closeAnnouncedFor = undefined
    attempt.deadline = setTimeout(
      () => this.fail(attempt, FailedConnectionAttempt.deadlineExpired()),
      this.options.deadlineMs
    )

    const attempting = this.join(attempt)
    try {
      this.installTransport(this.options.constructTransport(attempt))
    } catch (error) {
      this.fail(attempt, error)
    }
    return attempting
  }

  private installTransport = (transport: Transport) => {
    const predecessor = this.transport
    this.transport = transport
    if (predecessor) this.releasePredecessor(predecessor)
    this.options.emit('connecting')
  }

  private releasePredecessor = (transport: Transport) => {
    this.release(transport)
    this.options.abandonWrittenWaits(abandonedWaitMessages.responseReopened)
  }

  private join = (attempt: Attempt) => new Promise<void>((resolve, reject) => {
    attempt.waiters.push({ resolve, reject })
  })

  private abandonAttempt = (attempt: Attempt, message: AbandonedWaitMessage) => {
    this.clearDeadline(attempt)
    this.attempt = undefined
    if (this.transport) this.release(this.transport)
    this.options.abandonWrittenWaits(message)
  }

  private reject = (attempt: Attempt, error: Error) => {
    attempt.waiters.forEach((waiter) => waiter.reject(error))
    attempt.waiters.length = 0
  }

  private makeInert = (transport: Transport) => {
    transport.onopen = null as any
    transport.onmessage = null as any
    transport.onerror = null as any
    transport.onclose = null as any
  }

  private release = (transport: Transport) => {
    this.makeInert(transport)
    try {
      transport.close(intentionalCloseCode)
    } catch (error) {
      this.options.getLogger()
        .debug(`[ddp] the transport refused to close: ${(error as Error).message}`)
    }
    if (this.transport === transport) this.transport = undefined
  }

  private letTransportGo = async () => {
    const closing = this.transport
    try {
      if (closing) await this.options.awaitTransportClose(closing)
    } finally {
      this.settleClose(closing)
    }
  }

  private settleClose = (closing?: Transport) => {
    try {
      if (closing) {
        this.makeInert(closing)
        if (this.transport === closing) this.transport = undefined
      }
      this.options.forgetConnection()
      this.options.abandonWrittenWaits(abandonedWaitMessages.responseClosed)
    } finally {
      this.closeOwned = false
    }
  }

  private forgetCloseSettlement = () => {
    this.closeSettlement = undefined
  }

  private scheduleReopen = () => {
    this.scheduledReopen = setTimeout(() => {
      this.scheduledReopen = undefined
      if (this.options.hasUsableTransport()) return
      this.start(false, true).catch((error: Error) =>
        this.options.getLogger().error(`[ddp] Reopen error: ${error.message}`)
      )
    }, this.options.reopenDelayMs)
  }

  private cancelScheduledReopen = () => {
    if (!this.scheduledReopen) return false
    clearTimeout(this.scheduledReopen as any)
    this.scheduledReopen = undefined
    return true
  }

  private clearDeadline = (attempt: Attempt) => {
    clearTimeout(attempt.deadline as any)
    attempt.deadline = undefined
  }
}
