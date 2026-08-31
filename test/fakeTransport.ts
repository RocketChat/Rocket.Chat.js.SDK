import type WebSocketClient from 'universal-websocket-client'

import type { Socket } from '../lib/drivers/socket'
import type { ISocketMessageCallback } from '../interfaces'

export const CONNECTING = 0
export const OPEN = 1
export const CLOSED = 3
export const USER_DISCONNECT = 4000

export const fakeSockets: FakeWebSocket[] = []

export class FakeWebSocket {
  sent: string[] = []

  closedWith: (number | undefined)[] = []

  readyState: number = CONNECTING

  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onclose: ((ev: { code?: number }) => void) | null = null

  constructor (
    public url: string,
    public protocols?: string | string[] | null,
    public options?: { headers?: { [key: string]: string } }
  ) {
    fakeSockets.push(this)
  }

  sendError: Error | null = null

  send (data: string): void {
    if (this.sendError) throw this.sendError
    this.sent.push(data)
  }

  answersClose: boolean = true

  closeError: Error | null = null

  close (code?: number): void {
    if (this.readyState === CLOSED) return
    if (this.closeError) throw this.closeError
    this.closedWith.push(code)
    if (!this.answersClose) return
    this.readyState = CLOSED
    this.onclose?.({ code })
  }

  lastSent (): Record<string, unknown> {
    return JSON.parse(this.sent[this.sent.length - 1])
  }

  receive (data: object): void {
    this.receiveRaw(JSON.stringify(data))
  }

  receiveRaw (data: string): void {
    this.onmessage?.({ data })
  }
}

const fakeTransportConstructor: new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers?: { [key: string]: string } }
) => WebSocketClient = FakeWebSocket

export const fakeTransportModule = {
  __esModule: true,
  default: fakeTransportConstructor
}

export const useFakeClockAndSocketRegistry = (): void => {
  beforeEach(() => {
    jest.useFakeTimers()
    fakeSockets.length = 0
  })
}

export const openFakeConnection = async (socket: Socket, session = 'fake-session'): Promise<FakeWebSocket> => {
  const constructedBefore = fakeSockets.length
  const opening = socket.open()

  expect(fakeSockets).toHaveLength(constructedBefore + 1)
  const transport = fakeSockets[constructedBefore]

  await driveToHandshake(transport, session)

  await opening
  return transport
}

export const driveToHandshake = async (transport: FakeWebSocket, session = 'fake-session'): Promise<void> => {
  transport.readyState = OPEN
  transport.onopen?.({})

  await jest.advanceTimersByTimeAsync(0)
  transport.receive({ msg: 'connected', session })

  await jest.advanceTimersByTimeAsync(0)
}

export const flushMicrotasks = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
}

export const connectionWork = (socket: Socket): 'idle' | 'scheduled' | 'attempting' | 'closing' => {
  const work = socket['connectionWork']
  if (work['closeOwned']) return 'closing'
  if (work['attempt']) return 'attempting'
  if (work['scheduledReopen']) return 'scheduled'
  return 'idle'
}

export const hasScheduledReopen = (socket: Socket): boolean =>
  connectionWork(socket) === 'scheduled'

export const wiredTransports = (): FakeWebSocket[] =>
  fakeSockets.filter(({ onopen, onmessage, onerror, onclose }) =>
    !!(onopen || onmessage || onerror || onclose))

export const subFrames = (frames: string[]) =>
  frames.map((frame) => JSON.parse(frame)).filter((frame) => frame.msg === 'sub')

export const lastSubId = (transport: FakeWebSocket): string => {
  const { msg, id } = transport.lastSent() as { msg: string, id: string }
  expect(msg).toBe('sub')
  return id
}

export const subscribeAndAck = async (
  socket: Socket,
  transport: FakeWebSocket,
  name: string,
  params: any[],
  callback?: ISocketMessageCallback
) => {
  const subscribing = socket.subscribe(name, params, callback)
  const id = lastSubId(transport)
  transport.receive({ msg: 'ready', subs: [id] })
  return subscribing
}

export const lastMethodCallId = (transport: FakeWebSocket): string => {
  const { msg, id } = transport.lastSent() as { msg: string, id: string }
  expect(msg).toBe('method')
  return id
}

export const answerLastMethodCall = (transport: FakeWebSocket, result: any) => {
  transport.receive({ msg: 'result', id: lastMethodCallId(transport), result })
}

export const errorLastMethodCall = (transport: FakeWebSocket, error: any) => {
  transport.receive({ msg: 'result', id: lastMethodCallId(transport), error })
}
