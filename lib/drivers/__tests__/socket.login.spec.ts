import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  FakeWebSocket,
  flushMicrotasks,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

// Hoisted above the imports by jest, so the driver's own `import WebSocket from
// 'universal-websocket-client'` resolves to the fake. See test/fakeTransport.ts.
jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

describe('Socket login', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = new Socket({ host: 'localhost:3000', logger: createSilentLogger() })
    transport = await openFakeConnection(socket)
  })

  const loginAndAck = async (result = { id: 'user-1', token: 'resume-token' }) => {
    const logging = socket.login({ resume: 'resume-token' })
    await flushMicrotasks()
    transport.receive({ msg: 'result', id: transport.lastSent().id, result })
    return logging
  }

  describe('when the resubscribe after login fails', () => {
    const failResubscribe = (message: string) => jest
      .spyOn(socket, 'subscribeAll')
      .mockRejectedValue(new Error(message))

    it('reports the failure through the injected logger', async () => {
      failResubscribe('server said no')

      await loginAndAck()
      await flushMicrotasks()

      expect(socket.logger.error).toHaveBeenCalledWith(
        '[ddp] Resubscribe after login failed: server said no'
      )
    })

    it('emits resubscribe-error so a caller can see the streams did not come back', async () => {
      failResubscribe('server said no')
      const failures: Error[] = []
      socket.on('resubscribe-error', (err: Error) => failures.push(err))

      await loginAndAck()
      await flushMicrotasks()

      expect(failures).toHaveLength(1)
      expect(failures[0].message).toBe('server said no')
    })

    it('still resolves the login and emits login, which does not await the resubscribe', async () => {
      failResubscribe('server said no')
      const loggedIn = jest.fn()
      socket.on('login', loggedIn)

      await expect(loginAndAck()).resolves.toMatchObject({ id: 'user-1' })
      expect(loggedIn).toHaveBeenCalled()
    })
  })

  it('leaves resubscribe-error unemitted when the resubscribe succeeds', async () => {
    jest.spyOn(socket, 'subscribeAll').mockResolvedValue([])
    const failures = jest.fn()
    socket.on('resubscribe-error', failures)

    await loginAndAck()
    await flushMicrotasks()

    expect(failures).not.toHaveBeenCalled()
    expect(socket.logger.error).not.toHaveBeenCalled()
  })
})
