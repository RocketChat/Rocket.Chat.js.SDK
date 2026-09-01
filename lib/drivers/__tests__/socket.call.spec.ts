import { Socket } from '../socket'
import { createSilentLogger } from '../../../test/createSilentLogger'
import {
  FakeWebSocket,
  flushMicrotasks,
  openFakeConnection,
  useFakeClockAndSocketRegistry
} from '../../../test/fakeTransport'

jest.mock('universal-websocket-client', () => require('../../../test/fakeTransport').fakeTransportModule)

useFakeClockAndSocketRegistry()

describe('Socket call', () => {
  let socket: Socket
  let transport: FakeWebSocket

  beforeEach(async () => {
    socket = new Socket({ host: 'localhost:3000', logger: createSilentLogger() })
    transport = await openFakeConnection(socket)
  })

  const callAndAnswer = async (answer: object) => {
    const calling = socket.call('getRoom', 'room-1')
    await flushMicrotasks()

    expect(transport.lastSent()).toMatchObject({ msg: 'method', method: 'getRoom', params: ['room-1'] })
    const requestId = transport.lastSent().id as string
    transport.receive({ msg: 'result', id: requestId, ...answer })
    return { calling, requestId }
  }

  it('resolves with the result the server answered', async () => {
    const { calling } = await callAndAnswer({ result: { name: 'general' } })

    await expect(calling).resolves.toEqual({ name: 'general' })
  })

  it.each([null, 0, '', false])('resolves with the whole response when the result is %p', async (result) => {
    const { calling, requestId } = await callAndAnswer({ result })

    await expect(calling).resolves.toEqual({ id: requestId, result, error: undefined })
  })
})
