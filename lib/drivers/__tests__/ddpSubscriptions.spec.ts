import { DDPSubscriptions } from '../ddpSubscriptions'
import { DDPError } from '../ddpError'
import { AbandonedRequest, ExpiredWait } from '../ddpRequests'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { sha256 } from 'js-sha256'

/**
 * DDPSubscriptions on its own, with the send, the event registry and the
 * connection state given as fakes. What the same contract looks like from the
 * outside, over a websocket, belongs to the ddp.subscription*.spec.ts files;
 * this one reaches the branches that are awkward to provoke through a socket.
 */
const deadlineMs = 1000

const idFor = (name: string, params: any[]) =>
  `sub-${name}-${sha256(JSON.stringify(params))}`

const flushMicrotasks = () => Promise.resolve().then(() => undefined)

const createSubscriptions = (
  send: jest.Mock = jest.fn((message: any) => Promise.resolve({ subs: [message.id] }))
) => {
  const logger = createSilentLogger()
  const onEvent = jest.fn()
  const hasConnection = jest.fn(() => true)
  const subscriptions = new DDPSubscriptions({
    getLogger: () => logger,
    send,
    onEvent,
    hasConnection,
    deadlineMs
  })
  return { subscriptions, send, onEvent, hasConnection, logger }
}

const deferred = () => {
  let settle: (value: any) => void = () => undefined
  const promise = new Promise<any>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

describe('DDPSubscriptions', () => {
  describe('subscribe', () => {
    it('records an acknowledged stream under the id derived from its params', async () => {
      const { subscriptions, send } = createSubscriptions()

      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      const id = idFor('stream-room-messages', ['GENERAL'])
      expect(send).toHaveBeenCalledWith({
        msg: 'sub',
        id,
        name: 'stream-room-messages',
        params: ['GENERAL']
      })
      expect(subscription).toMatchObject({ id, name: 'stream-room-messages', params: ['GENERAL'] })
      expect(subscriptions.records[id]).toBe(subscription)
    })

    it('records nothing for a stream the server refuses', async () => {
      const { subscriptions } = createSubscriptions(jest.fn(() => Promise.resolve({ subs: [] })))

      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      expect(subscription).toBeUndefined()
      expect(subscriptions.records).toEqual({})
    })

    it('records nothing when the send is rejected', async () => {
      const { subscriptions } = createSubscriptions(
        jest.fn(() => Promise.reject(new DDPError('refused')))
      )

      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      expect(subscription).toBeUndefined()
      expect(subscriptions.records).toEqual({})
    })

    it('records a stream whose answer was abandoned', async () => {
      const id = idFor('stream-room-messages', ['GENERAL'])
      const { subscriptions } = createSubscriptions(jest.fn(() => Promise.reject(
        new AbandonedRequest(id, '[ddp] connection closed before the response arrived')
      )))

      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      expect(subscription).toMatchObject({ id })
      expect(subscriptions.records[id]).toBe(subscription)
    })

    it('records a stream whose wait expired', async () => {
      const id = idFor('stream-room-messages', ['GENERAL'])
      const { subscriptions } = createSubscriptions(
        jest.fn(() => Promise.reject(new ExpiredWait(id)))
      )

      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      expect(subscription).toMatchObject({ id })
      expect(subscriptions.records[id]).toBe(subscription)
    })

    it('records nothing when the connection is gone', async () => {
      const { subscriptions, hasConnection } = createSubscriptions()
      hasConnection.mockReturnValue(false)

      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      expect(subscription).toBeUndefined()
      expect(subscriptions.records).toEqual({})
    })

    it('registers the callback on the stream name', async () => {
      const { subscriptions, onEvent } = createSubscriptions()
      const callback = jest.fn()

      await subscriptions.subscribe('stream-room-messages', ['GENERAL'], callback)

      expect(onEvent).toHaveBeenCalledWith('stream-room-messages', callback)
    })

    it('shares a recorded stream with a second caller without sending again', async () => {
      const { subscriptions, send, onEvent } = createSubscriptions()
      const first = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      const callback = jest.fn()
      const second = await subscriptions.subscribe('stream-room-messages', ['GENERAL'], callback)

      expect(second).toBe(first)
      expect(send).toHaveBeenCalledTimes(1)
      expect(onEvent).toHaveBeenCalledWith('stream-room-messages', callback)
    })

    it('holds a second request for an id until the first has been answered', async () => {
      const { subscriptions, send } = createSubscriptions()
      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      const unsub = deferred()
      send.mockImplementation(() => unsub.promise)
      send.mockClear()
      const unsubscribing = subscriptions.unsubscribe(subscription!.id).catch(() => undefined)
      const resubscribing = subscriptions.subscribeAll()
      await flushMicrotasks()
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenLastCalledWith({ msg: 'unsub', id: subscription!.id })

      unsub.settle({ result: 'unsubscribed' })
      await unsubscribing
      await resubscribing
      expect(send.mock.lastCall[0]).toMatchObject({ msg: 'sub', id: subscription!.id })
    })

    it('forgets an existing record when a resubscribe under its id is refused', async () => {
      const { subscriptions, send } = createSubscriptions()
      await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      send.mockImplementation(() => Promise.reject(new DDPError('refused')))
      await subscriptions.subscribeAll()

      expect(subscriptions.records).toEqual({})
    })
  })

  describe('unsubscribe', () => {
    it('rejects for an id that was never recorded', async () => {
      const { subscriptions, send } = createSubscriptions()

      await expect(subscriptions.unsubscribe('sub-unknown')).rejects.toThrow(
        '[ddp] No subscription to unsubscribe from: sub-unknown'
      )
      expect(send).not.toHaveBeenCalled()
    })

    it('forgets the record and resolves with the response result', async () => {
      const { subscriptions, send } = createSubscriptions()
      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      send.mockImplementation(() => Promise.resolve({ result: 'unsubscribed' }))

      await expect(subscriptions.unsubscribe(subscription!.id)).resolves.toBe('unsubscribed')

      expect(subscriptions.records).toEqual({})
    })

    it('forgets the record when the server refuses the unsub', async () => {
      const { subscriptions, send } = createSubscriptions()
      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      send.mockImplementation(() => Promise.reject(new DDPError('nosub')))

      await expect(subscriptions.unsubscribe(subscription!.id)).rejects.toThrow('nosub')

      expect(subscriptions.records).toEqual({})
    })

    it('keeps the record when the unsub fails without a server answer', async () => {
      const { subscriptions, send } = createSubscriptions()
      const subscription = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      send.mockImplementation(() => Promise.reject(new ExpiredWait(subscription!.id)))

      await expect(subscriptions.unsubscribe(subscription!.id)).rejects.toBeInstanceOf(ExpiredWait)

      expect(subscriptions.records[subscription!.id]).toBe(subscription)
    })

    it('leaves nothing recorded after unsubscribing from all, refusals included', async () => {
      const { subscriptions, send } = createSubscriptions()
      await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      await subscriptions.subscribe('stream-notify-room', ['GENERAL/typing'])
      send.mockImplementation(() => Promise.reject(new DDPError('nosub')))

      await expect(subscriptions.unsubscribeAll()).resolves.toBeUndefined()

      expect(subscriptions.records).toEqual({})
    })
  })

  describe('forgetting', () => {
    it('drops every record at once', async () => {
      const { subscriptions } = createSubscriptions()
      await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      await subscriptions.subscribe('stream-notify-room', ['GENERAL/typing'])

      subscriptions.forgetAllSubscriptions()

      expect(subscriptions.records).toEqual({})
    })

    it('unsubscribes one record and leaves the others', async () => {
      const { subscriptions } = createSubscriptions()
      const dropped = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      const kept = await subscriptions.subscribe('stream-notify-room', ['GENERAL/typing'])

      await dropped!.unsubscribe()

      expect(Object.values(subscriptions.records)).toEqual([kept])
    })
  })

  describe('findSubscriptions', () => {
    it('matches every recorded stream of that name on a params prefix', async () => {
      const { subscriptions } = createSubscriptions()
      const messages = await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      const typing = await subscriptions.subscribe('stream-notify-room', ['GENERAL/typing'])

      expect(subscriptions.findSubscriptions({ name: 'stream-room-messages' })).toEqual([messages])
      expect(subscriptions.findSubscriptions({
        name: 'stream-notify-room',
        params: ['GENERAL/typing']
      })).toEqual([typing])
    })

    it('matches nothing when the params differ', async () => {
      const { subscriptions } = createSubscriptions()
      await subscriptions.subscribe('stream-room-messages', ['GENERAL'])

      expect(subscriptions.findSubscriptions({
        name: 'stream-room-messages',
        params: ['other']
      })).toEqual([])
    })
  })

  describe('resubscribeWhenRecorded', () => {
    it('resolves true once every stream asked for has been acknowledged again', async () => {
      const { subscriptions, send } = createSubscriptions()
      await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      send.mockClear()

      await expect(subscriptions.resubscribeWhenRecorded([
        { name: 'stream-room-messages', params: ['GENERAL'] }
      ])).resolves.toBe(true)

      expect(send).toHaveBeenCalledTimes(1)
    })

    it('resolves false when the server does not acknowledge a stream', async () => {
      const { subscriptions, send } = createSubscriptions()
      await subscriptions.subscribe('stream-room-messages', ['GENERAL'])
      send.mockImplementation(() => Promise.resolve({ subs: [] }))

      await expect(subscriptions.resubscribeWhenRecorded([
        { name: 'stream-room-messages', params: ['GENERAL'] }
      ])).resolves.toBe(false)
    })

    it('sends nothing and resolves false when a stream is never recorded', async () => {
      jest.useFakeTimers()
      const { subscriptions, send } = createSubscriptions()

      const resubscribing = subscriptions.resubscribeWhenRecorded(
        [{ name: 'stream-room-messages', params: ['GENERAL'] }],
        500
      )
      jest.advanceTimersByTime(500)

      await expect(resubscribing).resolves.toBe(false)
      expect(send).not.toHaveBeenCalled()
      jest.useRealTimers()
    })
  })
})
