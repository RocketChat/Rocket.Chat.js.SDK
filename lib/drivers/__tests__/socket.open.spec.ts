import { Socket } from '../socket'
import { ILogger } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import { createSocket, REOPEN_DELAY, socketOptions, TIMEOUT } from '../../../test/createSocket'
import {
  CLOSED,
  CONNECTING,
  connectionWork,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  fakeTransportModule,
  hasScheduledReopen,
  INTENTIONAL_CLOSE,
  wiredTransports,
  OPEN,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const SUPERSEDED = '[ddp] connection attempt was superseded before it completed'
const ATTEMPT_DEADLINE = '[ddp] connection attempt did not complete before the deadline'
const TRANSPORT_FAILED = '[ddp] transport failed during the connection attempt'

describe('Socket open', () => {
  let socket: Socket
  let transport: FakeWebSocket
  let logger: ILogger

  beforeEach(async () => {
    logger = createSilentLogger()
    socket = createSocket({ logger, ...socketOptions })
    transport = await openFakeConnection(socket)
  })

  describe('opening over a previous connection', () => {
    it('nulls all four handlers and closes the predecessor with the intentional code', async () => {
      const reopening = socket.reopenNow()

      expect(transport.onopen).toBeNull()
      expect(transport.onmessage).toBeNull()
      expect(transport.onerror).toBeNull()
      expect(transport.onclose).toBeNull()
      expect(transport.closedWith).toEqual([INTENTIONAL_CLOSE])

      await driveToHandshake(fakeSockets[1])
      await reopening
    })

    it('replaces the predecessor even when tearing it down throws', async () => {
      transport.closeError = new Error('teardown boom')

      const debug = logger.debug as jest.Mock

      const reopening = socket.reopenNow()

      expect(debug).toHaveBeenCalledWith(
        '[ddp] the transport refused to close: teardown boom'
      )
      expect(fakeSockets).toHaveLength(2)
      expect(socket.connection).toBe(fakeSockets[1])

      await driveToHandshake(fakeSockets[1])
      await reopening
    })

    it('rejects the superseded attempt rather than leaving it pending', async () => {
      const stillConnecting = createSocket({ logger, ...socketOptions })
      const superseded = stillConnecting.open()
      const socketsBeforeReplacement = fakeSockets.length

      const forced = stillConnecting.reopenNow()
      const replacement = fakeSockets[socketsBeforeReplacement]

      await expect(superseded).rejects.toThrow(SUPERSEDED)
      expect(hasScheduledReopen(stillConnecting)).toBe(false)

      await driveToHandshake(replacement)
      await forced
    })

    it('schedules no Reopen for the superseded attempt', async () => {
      const stillConnecting = createSocket({ logger, ...socketOptions })
      const superseded = stillConnecting.open()
      const socketsBeforeReplacement = fakeSockets.length

      const forced = stillConnecting.reopenNow()

      await expect(superseded).rejects.toThrow(SUPERSEDED)
      await driveToHandshake(fakeSockets[socketsBeforeReplacement])
      await forced

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(socketsBeforeReplacement + 1)
    })
  })

  describe('sharing one connection attempt', () => {
    it('builds one transport for concurrent ordinary opens, and fulfills both', async () => {
      transport.readyState = CLOSED

      const first = socket.open()
      const second = socket.open()

      expect(fakeSockets).toHaveLength(2)

      await driveToHandshake(fakeSockets[1])

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(connectionWork(socket)).toBe('idle')
    })

    it('retains a usable transport without attempting anything', async () => {
      await expect(socket.open()).resolves.toBeUndefined()

      expect(fakeSockets).toHaveLength(1)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('joins an ordinary attempt to the forced one that replaced it', async () => {
      transport.readyState = CLOSED

      const superseded = socket.open().catch((err) => err)
      const forced = socket.reopenNow()
      const joining = socket.open()

      expect(fakeSockets).toHaveLength(3)
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      await driveToHandshake(fakeSockets[2])
      await expect(forced).resolves.toBeUndefined()
      await expect(joining).resolves.toBeUndefined()
    })

    it('consumes the scheduled reopen rather than leaving it to fire behind an attempt', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      const opening = socket.open()
      expect(connectionWork(socket)).toBe('attempting')

      await driveToHandshake(fakeSockets[1])
      await opening

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)
    })

    it('builds a replacement for a lost transport even if it reports itself open again', async () => {
      transport.close(1006)
      transport.readyState = OPEN

      const opening = socket.open()

      expect(fakeSockets).toHaveLength(2)
      await driveToHandshake(fakeSockets[1])
      await expect(opening).resolves.toBeUndefined()
    })

    it('builds nothing for a recovery request during an ordinary attempt, and reopens once it fails', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      socket.reopen()

      expect(connectionWork(socket)).toBe('attempting')

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)

      fakeSockets[1].onerror?.(new Error('no route to host'))
      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)

      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it('schedules no reopen when the ordinary attempt a recovery request joined succeeds', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      socket.reopen()

      await driveToHandshake(fakeSockets[1])
      await opening

      expect(hasScheduledReopen(socket)).toBe(false)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)
    })

    it('builds nothing for a recovery request during a forced attempt, and leaves its deadline alone', async () => {
      const reopening = socket.reopenNow().catch((err) => err)
      socket.reopen()

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)

      await jest.advanceTimersByTimeAsync(TIMEOUT - REOPEN_DELAY - 1)
      expect(connectionWork(socket)).toBe('attempting')

      await jest.advanceTimersByTimeAsync(1)

      await expect(reopening).resolves.toThrow(ATTEMPT_DEADLINE)
      expect(hasScheduledReopen(socket)).toBe(true)
    })

    it('hands both callers of one attempt the same failure', async () => {
      transport.readyState = CLOSED

      const first = socket.open().catch((err) => err)
      const second = socket.open().catch((err) => err)

      fakeSockets[1].onerror?.(new Error('no route to host'))

      await expect(first).resolves.toThrow(TRANSPORT_FAILED)
      await expect(second).resolves.toThrow(TRANSPORT_FAILED)
    })
  })

  describe('reopenNow', () => {
    it('constructs one transport for concurrent callers and fulfills both', async () => {
      const retiredEventSeen = jest.fn()
      socket.on('disconnected', retiredEventSeen)

      const first = socket.reopenNow()
      const second = socket.reopenNow()

      expect(fakeSockets).toHaveLength(2)
      expect(retiredEventSeen).not.toHaveBeenCalled()

      await driveToHandshake(fakeSockets[1])

      await expect(first).resolves.toBeUndefined()
      await expect(second).resolves.toBeUndefined()
      expect(connectionWork(socket)).toBe('idle')
    })

    it('rejects its callers on the attempt deadline instead of resolving them', async () => {
      const reopening = socket.reopenNow()
      const settled = jest.fn()
      reopening.then(settled, settled)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      expect(settled).not.toHaveBeenCalled()

      const rejected = expect(reopening).rejects.toThrow(ATTEMPT_DEADLINE)
      await jest.advanceTimersByTimeAsync(1)
      await rejected
    })

    it('does not reset the deadline of the forced attempt a later caller joins', async () => {
      const first = socket.reopenNow().catch((err) => err)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      const joining = socket.reopenNow().catch((err) => err)

      await jest.advanceTimersByTimeAsync(1)

      await expect(first).resolves.toThrow(ATTEMPT_DEADLINE)
      await expect(joining).resolves.toThrow(ATTEMPT_DEADLINE)
      expect(fakeSockets).toHaveLength(2)
    })

    it('schedules one reopen once the deadline has rejected its callers', async () => {
      const reopening = socket.reopenNow()

      await jest.advanceTimersByTimeAsync(TIMEOUT)
      await expect(reopening).rejects.toThrow(ATTEMPT_DEADLINE)

      expect(hasScheduledReopen(socket)).toBe(true)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(3)
      expect(connectionWork(socket)).toBe('attempting')
    })

    it('gives the forced replacement a whole deadline, not what the ordinary attempt left', async () => {
      transport.readyState = CLOSED
      const ordinary = socket.open().catch((err) => err)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      const forced = socket.reopenNow().catch((err) => err)
      await expect(ordinary).resolves.toThrow(SUPERSEDED)

      await jest.advanceTimersByTimeAsync(TIMEOUT - 1)
      expect(connectionWork(socket)).toBe('attempting')

      await jest.advanceTimersByTimeAsync(1)
      await expect(forced).resolves.toThrow(ATTEMPT_DEADLINE)
    })

    it('starts one forced attempt when there is no usable transport to replace', async () => {
      transport.readyState = CLOSED

      const reopening = socket.reopenNow()

      expect(fakeSockets).toHaveLength(2)
      expect(connectionWork(socket)).toBe('attempting')
      expect(wiredTransports()).toEqual([fakeSockets[1]])

      await driveToHandshake(fakeSockets[1])
      await expect(reopening).resolves.toBeUndefined()
    })

    it('cancels the scheduled reopen it replaces', async () => {
      transport.close(1006)
      expect(hasScheduledReopen(socket)).toBe(true)

      const reopening = socket.reopenNow()
      expect(connectionWork(socket)).toBe('attempting')

      await driveToHandshake(fakeSockets[1])
      await reopening

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY)
      expect(fakeSockets).toHaveLength(2)
    })
  })

  describe('a transport that fails during the attempt', () => {
    it('rejects the attempt when the transport reports an error', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      fakeSockets[1].onerror?.(new Error('no route to host'))

      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('rejects the attempt when the transport closes before the handshake completes', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      const connecting = fakeSockets[1]
      connecting.readyState = OPEN
      connecting.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      connecting.close(1006)

      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
    })

    it('rejects the attempt when the transport closes while it is still being wired', async () => {
      // The close lands from the `connecting` emission, before `open()` has been
      // handed the transport. The attempt has to own it by then, or nothing but
      // the Deadline can end the caller's wait.
      transport.readyState = CLOSED
      socket.once('connecting', () => fakeSockets[1].close(1006))

      const opening = socket.open()

      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
      expect(connectionWork(socket)).toBe('idle')
    })

    it('closes the transport of the attempt it abandoned', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      const abandoned = fakeSockets[1]
      abandoned.onerror?.(new Error('no route to host'))
      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)

      expect(abandoned.closedWith).toEqual([INTENTIONAL_CLOSE])
      expect(abandoned.readyState).toBe(CLOSED)
    })

    it('rejects the attempt with the reason the server refused the handshake with', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      const connecting = fakeSockets[1]
      connecting.readyState = OPEN
      connecting.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      connecting.receive({ msg: 'connected', error: { reason: 'unsupported DDP version' } })

      await expect(opening).rejects.toThrow('unsupported DDP version')
    })

    it('closes the transport of the attempt it superseded', async () => {
      transport.readyState = CLOSED
      const superseded = socket.open().catch((err) => err)
      const abandoned = fakeSockets[1]

      const forced = socket.reopenNow()
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      expect(abandoned.closedWith).toEqual([INTENTIONAL_CLOSE])
      expect(abandoned.readyState).toBe(CLOSED)

      await driveToHandshake(fakeSockets[2])
      await expect(forced).resolves.toBeUndefined()
    })

    it('does not let a superseded transport fail the attempt that replaced it', async () => {
      transport.readyState = CLOSED

      const superseded = socket.open().catch((err) => err)
      const abandoned = fakeSockets[1]
      const failAbandoned = abandoned.onerror!
      const closeAbandoned = abandoned.onclose!

      const forced = socket.reopenNow()
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      const closeSeen = jest.fn()
      socket.on('close', closeSeen)

      failAbandoned(new Error('no route to host'))
      closeAbandoned({ code: 1006 })

      expect(closeSeen).not.toHaveBeenCalled()
      expect(connectionWork(socket)).toBe('attempting')

      await driveToHandshake(fakeSockets[2])
      await expect(forced).resolves.toBeUndefined()
    })

    it('schedules one reopen for a recovery attempt that failed, and none for a plain open', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      fakeSockets[1].onerror?.(new Error('no route to host'))
      await expect(opening).rejects.toThrow(TRANSPORT_FAILED)
      expect(hasScheduledReopen(socket)).toBe(false)

      const recovering = socket.reopenNow()
      fakeSockets[2].onerror?.(new Error('no route to host'))
      await expect(recovering).rejects.toThrow(TRANSPORT_FAILED)
      expect(hasScheduledReopen(socket)).toBe(true)
    })
  })

  describe('a handshake the server never answers', () => {
    it('rejects the attempt on one deadline that spans the transport connection', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      expect(fakeSockets).toHaveLength(2)
      const replacement = fakeSockets[1]

      // Half the budget goes on the transport connection, so the handshake gets
      // only what is left of it rather than a fresh `timeout`.
      await jest.advanceTimersByTimeAsync(TIMEOUT / 2)
      replacement.readyState = OPEN
      replacement.onopen?.({})
      await jest.advanceTimersByTimeAsync(0)

      expect(replacement.lastSent()).toMatchObject({ msg: 'connect' })

      const settled = jest.fn()
      opening.then(settled, settled)

      await jest.advanceTimersByTimeAsync(TIMEOUT / 2 - 1)
      expect(settled).not.toHaveBeenCalled()

      const rejected = expect(opening).rejects.toThrow(ATTEMPT_DEADLINE)
      await jest.advanceTimersByTimeAsync(1)
      await rejected
    })

    it('rejects an attempt whose transport never opens at all', async () => {
      transport.readyState = CLOSED

      const opening = socket.open()
      expect(fakeSockets[1].readyState).toBe(CONNECTING)

      const rejected = expect(opening).rejects.toThrow(ATTEMPT_DEADLINE)
      await jest.advanceTimersByTimeAsync(TIMEOUT)
      await rejected
    })
  })

  describe('a transport constructor that throws', () => {
    it('rejects the open, logs the error, and builds nothing', async () => {
      // Replacing the mocked module's export is the only seam that reaches the
      // driver's `catch` around `new WebSocket(...)`: the driver reads the
      // export at call time, and `restoreMocks` puts it back afterwards.
      const failure = new Error('transport unavailable')
      jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => { throw failure })

      const error = logger.error as jest.Mock

      // The existing socket has to stop being connected first, or `open` short
      // circuits before it ever constructs anything.
      transport.readyState = CLOSED

      await expect(socket.open()).rejects.toThrow('transport unavailable')

      expect(error).toHaveBeenCalledWith(failure)
      expect(fakeSockets).toHaveLength(1)
    })

    it('reports its own failure when the constructor throws something that is not an Error', async () => {
      jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => {
        throw 'transport unavailable'
      })
      transport.readyState = CLOSED

      await expect(socket.open()).rejects.toThrow(TRANSPORT_FAILED)
    })

    it('emits no connecting for a transport it never constructed', async () => {
      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)
      jest.spyOn(fakeTransportModule, 'default').mockImplementation(() => {
        throw new Error('transport unavailable')
      })
      transport.readyState = CLOSED

      await expect(socket.open()).rejects.toThrow('transport unavailable')

      expect(connectingSeen).not.toHaveBeenCalled()
    })
  })
})
