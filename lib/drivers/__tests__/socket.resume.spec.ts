import { Socket } from '../socket'
import { ILogger, ILoginResult } from '../../../interfaces'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  driveToHandshake,
  FakeWebSocket,
  fakeSockets,
  flushMicrotasks,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

const REOPEN_DELAY = 3000

const loginResult: ILoginResult = {
  id: 'user-id',
  token: 'resume-token',
  createCipher: { $date: 0 }
}

const createSocket = (logger: ILogger, resume: ILoginResult | null = null) => new Socket({
  host: 'localhost:3000',
  logger,
  reopen: REOPEN_DELAY,
  timeout: 7000,
  ping: 10 * 60 * 1000
}, resume)

const reopenAfterDrop = async (transport: FakeWebSocket) => {
  transport.close(1006)
  await jest.advanceTimersByTimeAsync(REOPEN_DELAY)

  const reopened = fakeSockets[1]
  expect(reopened).toBeDefined()
  await driveToHandshake(reopened)
  await flushMicrotasks()

  return reopened
}

const loginFrames = (transport: FakeWebSocket) =>
  transport.sent
    .map((frame) => JSON.parse(frame))
    .filter((frame) => frame.msg === 'method' && frame.method === 'login')

describe('Resume on reopen', () => {
  let logger: ILogger

  beforeEach(() => {
    logger = createSilentLogger()
  })

  it('sends a login method call on the reopened connection', async () => {
    const socket = createSocket(logger, loginResult)
    const transport = await openFakeConnection(socket)

    const reopened = await reopenAfterDrop(transport)

    expect(loginFrames(reopened)).toHaveLength(1)
    expect(loginFrames(reopened)[0].params).toEqual([{ resume: loginResult.token }])
  })

  it('sends no login method call with no token held', async () => {
    const socket = createSocket(logger)
    const transport = await openFakeConnection(socket)

    const reopened = await reopenAfterDrop(transport)

    expect(loginFrames(reopened)).toHaveLength(0)
  })

  it('resolves the open and emits open without waiting on the login response', async () => {
    const socket = createSocket(logger, loginResult)
    const opened = jest.fn()
    socket.on('open', opened)

    const opening = socket.open()
    const transport = fakeSockets[0]
    await driveToHandshake(transport)

    await expect(opening).resolves.toBe(transport)
    expect(opened).toHaveBeenCalled()
    expect(loginFrames(transport)).toHaveLength(1)
  })

  it('reports logged in only once the Resume has its result', async () => {
    const socket = createSocket(logger, loginResult)
    const transport = await openFakeConnection(socket)

    const reopened = await reopenAfterDrop(transport)

    expect(socket.loggedIn).toBe(false)

    reopened.receive({ msg: 'result', id: loginFrames(reopened)[0].id, result: loginResult })
    await flushMicrotasks()

    expect(socket.loggedIn).toBe(true)
  })
})
