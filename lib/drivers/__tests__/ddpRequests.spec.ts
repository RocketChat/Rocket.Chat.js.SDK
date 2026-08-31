import { DDPRequests, AbandonedRequest, ExpiredWait, abandonedWaitMessages } from '../ddpRequests'
import { DDPError } from '../ddpError'
import { SDKEventEmitter } from '../../emitter'
import { createSilentLogger } from '../../../test/createSilentLogger'

const deadlineMs = 1000

const createRequests = () => {
  const emitter = new SDKEventEmitter()
  const logger = createSilentLogger()
  const requests = new DDPRequests({
    emitter,
    getLogger: () => logger,
    nextId: (id?: string) => id || 'request-1',
    deadlineMs
  })
  return { requests, emitter, logger }
}

const registeredFor = (emitter: SDKEventEmitter, event: string): Function[] =>
  (emitter as any)._listeners[event] || []

describe('DDPRequests', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  it('rejects a wait abandoned while it is open with the request id and a message', async () => {
    const { requests } = createRequests()

    const sending = requests.send({ msg: 'method', method: 'login' }, () => undefined)
    requests.abandonAll(abandonedWaitMessages.responseClosed)

    await expect(sending).rejects.toMatchObject({
      id: 'request-1',
      message: abandonedWaitMessages.responseClosed
    })
    await expect(sending).rejects.toBeInstanceOf(AbandonedRequest)
  })

  it('rejects an expired wait and leaves no listener for its id', async () => {
    const { requests, emitter } = createRequests()

    const sending = requests.send({ msg: 'method', method: 'login' }, () => undefined)
    expect(registeredFor(emitter, 'request-1')).toHaveLength(1)

    jest.advanceTimersByTime(deadlineMs)

    await expect(sending).rejects.toBeInstanceOf(ExpiredWait)
    await expect(sending).rejects.toMatchObject({ id: 'request-1' })
    expect(registeredFor(emitter, 'request-1')).toHaveLength(0)
  })

  it('resolves undefined for a message with no reply to wait for', async () => {
    const { requests } = createRequests()

    await expect(requests.send({ msg: 'pong' }, () => undefined)).resolves.toBeUndefined()
  })

  it('rejects with the transport error and holds no wait a later abandon could reject', async () => {
    const { requests } = createRequests()
    const transportError = new Error('the socket is closed')

    const failedWrite = requests.send({ msg: 'method', method: 'login' }, () => {
      throw transportError
    })
    await expect(failedWrite).rejects.toBe(transportError)

    const pending = requests.send({ msg: 'method', method: 'login', id: 'request-2' }, () => undefined)
    const rejections: any[] = []
    const settled = pending.catch((error) => rejections.push(error))
    requests.abandonAll(abandonedWaitMessages.responseClosed)
    await settled

    expect(rejections).toHaveLength(1)
    expect(rejections[0]).toMatchObject({ id: 'request-2' })
  })

  it('rejects a server error response with a DDPError built from it', async () => {
    const { requests, emitter } = createRequests()

    const sending = requests.send({ msg: 'method', method: 'login' }, () => undefined)
    emitter.emit('request-1', {
      error: { error: 403, reason: 'not-allowed', errorType: 'Meteor.Error', message: 'ignored' }
    })

    await expect(sending).rejects.toBeInstanceOf(DDPError)
    await expect(sending).rejects.toMatchObject({
      message: 'not-allowed',
      error: 403,
      errorType: 'Meteor.Error'
    })
  })
})
