import { Socket } from '../socket'
import { createSocket, REOPEN_DELAY, socketOptions } from '../../../test/createSocket'
import {
  CLOSED,
  CONNECTING,
  connectionWork,
  FakeWebSocket,
  fakeSockets,
  hasScheduledReopen,
  INTENTIONAL_CLOSE,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

/** Mirrors the bound `close` waits on the transport's close event. */
const CLOSE_DEADLINE = 2000

const CLOSED_BEFORE_OPEN = '[ddp] connection closed before it opened'

describe('Socket close', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket(socketOptions)
    transport = await openFakeConnection(socket)
  })

  describe('close', () => {
    it('resolves on the close event itself, without waiting out the deadline', async () => {
      const settled = jest.fn()

      socket.close().then(settled)
      await jest.advanceTimersByTimeAsync(0)

      expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      expect(settled).toHaveBeenCalled()
      expect(socket.connection).toBeUndefined()
      expect([transport.onopen, transport.onmessage, transport.onerror, transport.onclose])
        .toEqual([null, null, null, null])
    })

    it('settles without waiting when the transport refuses to close', async () => {
      transport.closeError = new Error('already gone')
      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      const settled = jest.fn()
      socket.close().then(settled)
      await jest.advanceTimersByTimeAsync(0)

      expect(settled).toHaveBeenCalled()
      expect(closeSeen).toHaveBeenCalledWith({
        code: INTENTIONAL_CLOSE,
        reason: 'the transport refused to close',
        wasClean: false
      })
      expect(socket.connection).toBeUndefined()
    })

    it('leaves no subscription behind for a sub it abandoned', async () => {
      const subscribing = socket.subscribe('stream-room-messages', ['GENERAL'])

      await socket.close()
      await subscribing

      expect(socket.connection).toBeUndefined()
      expect(socket.subscriptions).toEqual({})
    })

    it('leaves the socket idle with no session, liveness or recovery intent', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      await socket.close()

      expect(connectionWork(socket)).toBe('idle')
      expect(socket.connection).toBeUndefined()
      expect(socket.session).toBeUndefined()
      expect(socket.lastPing).toBe(0)
      expect(socket.connected).toBe(false)
    })

    it('joins a concurrent close to the same void outcome, asking the transport once', async () => {
      transport.answersClose = false

      const first = socket.close()
      const second = socket.close()

      await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
    })

    it('rejects a logout issued after it settled, rather than resolving silently', async () => {
      await socket.close()

      await expect(socket.logout())
        .rejects.toThrow('[ddp] connection closed before the response arrived')
    })

    it('forgets every entry and the login when the socket never connected', async () => {
      const unopened = createSocket(socketOptions)
      const subscription = await unopened.subscribe('stream-room-messages', ['GENERAL'])
      unopened.resume = { id: 'user-id', token: 'resume-token', createCipher: { $date: 0 } }
      expect(unopened.subscriptions[subscription!.id]).toBe(subscription)

      await expect(unopened.logout()).resolves.toBeUndefined()

      expect(unopened.subscriptions).toEqual({})
      expect(unopened.resume).toBeNull()
    })

    it('admits connection work again once it has settled', async () => {
      await socket.close()

      const reopened = await openFakeConnection(socket)

      expect(socket.connection).toBe(reopened)
      expect(socket.connected).toBe(true)
    })

    describe('while it owns the socket', () => {
      beforeEach(() => {
        transport.answersClose = false
      })

      it('refuses a new open', async () => {
        const closing = socket.close()

        await expect(socket.open()).rejects.toThrow(CLOSED_BEFORE_OPEN)
        expect(fakeSockets).toHaveLength(1)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('refuses a new forced reopen', async () => {
        const closing = socket.close()

        await expect(socket.reopenNow()).rejects.toThrow(CLOSED_BEFORE_OPEN)
        expect(fakeSockets).toHaveLength(1)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('records no recovery intent for an internal reopen', async () => {
        const closing = socket.close()

        socket.reopen()
        expect(hasScheduledReopen(socket)).toBe(false)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
        expect(fakeSockets).toHaveLength(1)
      })

      it('refuses a new DDP send', async () => {
        const closing = socket.close()

        await expect(socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] }))
          .rejects.toThrow('[ddp] connection closed before the response arrived')

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('rejects a logout before it clears the login or writes anything', async () => {
        const login = { id: 'user-id', token: 'resume-token', createCipher: { $date: 0 } }
        socket.resume = login
        const closing = socket.close()
        const sentBefore = transport.sent.length

        await expect(socket.logout()).rejects.toThrow('[ddp] connection closed before the response arrived')
        expect(socket.resume).toEqual(login)
        expect(transport.sent).toHaveLength(sentBefore)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('writes no probe of its own', async () => {
        const closing = socket.close()
        const sentBefore = transport.sent.length

        await expect(socket.probe()).resolves.toBe(false)
        expect(transport.sent).toHaveLength(sentBefore)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
      })

      it('settles and announces one close when the transport reports the close it never answered', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)
        const settled = jest.fn()

        const closing = socket.close()
        closing.then(settled, settled)
        await jest.advanceTimersByTimeAsync(0)

        transport.onclose?.({ code: 1006 })
        await closing

        expect(settled).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledWith({ code: 1006 })
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
        expect([transport.onopen, transport.onmessage, transport.onerror, transport.onclose])
          .toEqual([null, null, null, null])
      })

      it('announces one close for a transport that reports its close twice', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)
        const settled = jest.fn()

        const closing = socket.close()
        closing.then(settled, settled)
        await jest.advanceTimersByTimeAsync(0)

        const reportClose = transport.onclose!
        reportClose({ code: 1006 })
        reportClose({ code: 1006 })
        await closing

        expect(settled).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledTimes(1)
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      })

      it('refuses a send that was still waiting for the transport to open', async () => {
        transport.readyState = CLOSED
        const sentBefore = transport.sent.length
        const sending = socket.send({ msg: 'method', method: 'getUsersOfRoom', params: [] })
        await jest.advanceTimersByTimeAsync(0)

        const closing = socket.close()

        await expect(sending).rejects.toThrow('[ddp] connection closed before the response arrived')
        expect(transport.sent).toHaveLength(sentBefore)

        await closing
      })
    })

    describe('when the peer never answers', () => {
      beforeEach(() => {
        transport.answersClose = false
      })

      it('settles on its deadline instead of waiting for a close that never arrives', async () => {
        const settled = jest.fn()

        socket.close().then(settled)

        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE - 1)
        expect(settled).not.toHaveBeenCalled()

        await jest.advanceTimersByTimeAsync(1)
        expect(settled).toHaveBeenCalled()
      })

      it('drops the socket, so a second close waits for nothing', async () => {
        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing
        expect(socket.connection).toBeUndefined()

        const settled = jest.fn()
        socket.close().then(settled)
        await jest.advanceTimersByTimeAsync(0)

        expect(settled).toHaveBeenCalled()
        expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])
      })

      it('detaches the socket, so a peer that revives reaches nothing', async () => {
        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        expect(transport.onopen).toBeNull()
        expect(transport.onmessage).toBeNull()
        expect(transport.onerror).toBeNull()
        expect(transport.onclose).toBeNull()
      })

      it('announces the close it never got, so a wait on this connection ends', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        expect(closeSeen).toHaveBeenCalledWith({
          code: INTENTIONAL_CLOSE,
          reason: 'the transport did not answer the close',
          wasClean: false
        })
      })

      it('ignores a late transport close that lands after the deadline answered for it', async () => {
        const closeSeen = jest.fn()
        socket.on('close', closeSeen)

        const closing = socket.close()
        // The sync advance fires the deadline — the driver answers itself —
        // without draining the microtask continuation that detaches the
        // socket. That is the window a transport's trailing close event lands
        // in; the async advance would close it before the event could arrive.
        jest.advanceTimersByTime(CLOSE_DEADLINE)
        transport.onclose?.({ code: 1006 })

        expect(closeSeen).toHaveBeenCalledTimes(1)
        expect(closeSeen).toHaveBeenCalledWith({
          code: INTENTIONAL_CLOSE,
          reason: 'the transport did not answer the close',
          wasClean: false
        })
        expect(hasScheduledReopen(socket)).toBe(false)

        await closing
        expect(socket.connection).toBeUndefined()
      })

      it('is not kept alive by a revived peer it has already detached', async () => {
        const messageSeen = jest.fn()
        socket.on('updated', messageSeen)

        const closing = socket.close()
        await jest.advanceTimersByTimeAsync(CLOSE_DEADLINE)
        await closing

        transport.receive({ msg: 'updated' })

        expect(messageSeen).not.toHaveBeenCalled()
        expect(socket.lastPing).toBe(0)
      })
    })
  })

  /**
   * A close shares the driver with the reopen machinery, and each of these pins
   * one way that interplay goes wrong: a reopen the close should have cancelled
   * surviving it, and an attempt left hanging by the teardown.
   */
  describe('close racing a reopen', () => {
    it('deletes the pending reopen it cancels, so a later close can schedule one again', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      await socket.close()
      expect(hasScheduledReopen(socket)).toBe(false)

      const reopened = await openFakeConnection(socket)
      reopened.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it('does not let a reopen armed during the wait survive it', async () => {
      transport.answersClose = false
      const closing = socket.close()
      await jest.advanceTimersByTimeAsync(0)

      transport.onclose?.({ code: 1006 })
      await closing

      expect(hasScheduledReopen(socket)).toBe(false)
      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(1)
    })

    it('rejects a forced attempt that never got its open, so its awaiter is not left hanging', async () => {
      const reopening = socket.reopenNow()
      const replacement = fakeSockets[1]
      expect(replacement.readyState).toBe(CONNECTING)

      const rejected = expect(reopening).rejects.toThrow(CLOSED_BEFORE_OPEN)
      await socket.close()
      await rejected

      expect(socket.connected).toBe(false)
      expect(socket.connection).toBeUndefined()
    })

    it('rejects a pending open rather than hanging it when the connecting socket is closed', async () => {
      transport.readyState = CLOSED
      const opening = socket.open()
      const connecting = fakeSockets[1]
      expect(connecting.readyState).toBe(CONNECTING)

      await socket.close()

      await expect(opening).rejects.toThrow(CLOSED_BEFORE_OPEN)
      expect(socket.connection).toBeUndefined()
    })

    it('leaves the next open free to build a socket when it interrupted a forced reconnect', async () => {
      const reopening = socket.reopenNow()
      const rejected = expect(reopening).rejects.toThrow(CLOSED_BEFORE_OPEN)
      await socket.close()
      await rejected

      const rebuilt = await openFakeConnection(socket)
      expect(socket.connection).toBe(rebuilt)
    })
  })
})
