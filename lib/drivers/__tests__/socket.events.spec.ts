import { Socket } from '../socket'
import { createSocket, REOPEN_DELAY, socketOptions } from '../../../test/createSocket'
import {
  CLOSED,
  connectionWork,
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  hasScheduledReopen,
  INTENTIONAL_CLOSE,
  wiredTransports,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const SUPERSEDED = '[ddp] connection attempt was superseded before it completed'

/**
 * Unless a test needs a connection that never opened, it starts from a real open
 * one built through `openFakeConnection`, which asserts the mocked transport
 * constructor actually ran — so no assertion below can pass against a socket the
 * driver never built.
 */
describe('Socket connection events', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = createSocket(socketOptions)
    transport = await openFakeConnection(socket)
  })

  describe('the transport the socket observes', () => {
    it('is only the newest one across a forced replacement', async () => {
      const reopening = socket.reopenNow()

      expect(wiredTransports()).toEqual([fakeSockets[1]])
      expect(socket.connection).toBe(fakeSockets[1])

      await driveToHandshake(fakeSockets[1])
      await reopening

      expect(wiredTransports()).toEqual([fakeSockets[1]])
      expect(socket.connection).toBe(fakeSockets[1])
    })

    it('is only the newest one across an ordinary attempt superseded by a forced one', async () => {
      transport.readyState = CLOSED

      const superseded = socket.open().catch((err) => err)
      const forced = socket.reopenNow()
      await expect(superseded).resolves.toThrow(SUPERSEDED)

      expect(wiredTransports()).toEqual([fakeSockets[2]])
      expect(socket.connection).toBe(fakeSockets[2])

      await driveToHandshake(fakeSockets[2])
      await forced
    })

    it('is none of them once a close has let the last one go', async () => {
      await socket.close()

      expect(wiredTransports()).toEqual([])
      expect(socket.connection).toBeUndefined()
    })
  })

  describe('lifecycle events', () => {
    it('announces one connecting for an attempt, and none for the caller that joined it', async () => {
      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)
      transport.readyState = CLOSED

      const first = socket.open()
      const joining = socket.open()

      expect(connectingSeen).toHaveBeenCalledTimes(1)

      await driveToHandshake(fakeSockets[1])
      await first
      await joining

      expect(connectingSeen).toHaveBeenCalledTimes(1)
    })

    it('announces no connecting for a transport it retained', async () => {
      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)

      await expect(socket.open()).resolves.toBeUndefined()

      expect(connectingSeen).not.toHaveBeenCalled()
    })

    it('announces no connecting for a scheduled reopen until it owns a transport', async () => {
      transport.close(1006)

      const connectingSeen = jest.fn()
      socket.on('connecting', connectingSeen)

      await jest.advanceTimersByTimeAsync(REOPEN_DELAY - 1)
      expect(hasScheduledReopen(socket)).toBe(true)
      expect(connectingSeen).not.toHaveBeenCalled()

      await jest.advanceTimersByTimeAsync(1)
      expect(connectingSeen).toHaveBeenCalledTimes(1)
    })

    it('has committed the work, the transport and the session before it announces the open', async () => {
      transport.readyState = CLOSED
      const observed: unknown[][] = []
      socket.on('open', () =>
        observed.push([connectionWork(socket), socket.connection, socket.session]))

      const opening = socket.open()
      await driveToHandshake(fakeSockets[1], 'reopened-session')
      await opening

      expect(observed).toEqual([['idle', fakeSockets[1], 'reopened-session']])
    })

    it('announces exactly one open for an attempt that succeeded', async () => {
      transport.readyState = CLOSED
      const announced = jest.fn()
      socket.on('open', announced)

      const opening = socket.open()
      await driveToHandshake(fakeSockets[1])
      await opening

      expect(announced).toHaveBeenCalledTimes(1)
    })

    it('has already scheduled the reopen by the time it announces the close', () => {
      const workAtClose: string[] = []
      socket.on('close', () => workAtClose.push(connectionWork(socket)))

      transport.close(1006)

      expect(workAtClose).toEqual(['scheduled'])
    })

    it('is idle by the time it announces a close it will not recover from', () => {
      const workAtClose: string[] = []
      socket.on('close', () => workAtClose.push(connectionWork(socket)))

      transport.close(INTENTIONAL_CLOSE)

      expect(workAtClose).toEqual(['idle'])
    })

    it('announces no close for a socket that never owned a transport', async () => {
      const untouched = createSocket(socketOptions)
      const closeSeen = jest.fn()
      untouched.on('close', closeSeen)

      await untouched.close()

      expect(closeSeen).not.toHaveBeenCalled()
    })

    it('announces no disconnected when the transport is lost', () => {
      const retiredEventSeen = jest.fn()
      socket.on('disconnected', retiredEventSeen)

      transport.close(1006)

      expect(retiredEventSeen).not.toHaveBeenCalled()
    })
  })
})
