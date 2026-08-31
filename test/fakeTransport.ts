import type WebSocketClient from 'universal-websocket-client'

import type { Socket } from '../lib/drivers/socket'
import type { ISocketMessageCallback } from '../interfaces'

/**
 * The one and only way a spec gets a websocket: the transport module is mocked
 * with `fakeTransportModule`, so the driver constructs the fake itself through
 * `new WebSocket(...)` on its normal code path. Nothing is ever assigned onto
 * `socket.connection`, and no shipped source is touched.
 *
 * A spec opts in with a hoisted mock — the one line that has to be repeated per
 * file, because `jest.mock` only hoists inside the file that calls it:
 *
 *     jest.mock('universal-websocket-client', () =>
 *       require('../../test/fakeTransport').fakeTransportModule)
 *
 * Everything the mock hands back — the fake, the registry and the per-test
 * setup — lives here, so swapping the seam later touches one file.
 */

/** The `readyState` values the driver actually branches on. */
export const CONNECTING = 0
export const OPEN = 1
export const CLOSED = 3
export const USER_DISCONNECT = 4000

/**
 * Every socket the driver has constructed, in construction order. Reaching the
 * first socket after a second one has replaced it is what makes the replacement
 * and teardown specs possible at all.
 */
export const fakeSockets: FakeWebSocket[] = []

/**
 * A real class, not a three-property stub: `readyState` is read-only on the
 * declared transport type, and a mocked class is what lets a spec move it
 * without casting. The four handlers are assignable and nullable because
 * teardown nulls all four.
 */
export class FakeWebSocket {
  /** Every frame handed to `send`, as the raw strings the driver produced. */
  sent: string[] = []

  /** Every code passed to `close`, in order. `undefined` for a bare close. */
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

  /**
   * Set to make `send` throw instead of recording the frame — the only way to
   * reach the driver's write-failure branch, since a real websocket throws from
   * `send` on a socket that closed under it. Off by default, so a spec that does
   * not set it sees the recording behaviour every other spec relies on.
   */
  sendError: Error | null = null

  send (data: string): void {
    if (this.sendError) throw this.sendError
    this.sent.push(data)
  }

  /**
   * Set to false for a socket whose peer is gone: `close` is recorded, but no
   * close event ever comes back and the state stays as it was.
   */
  answersClose: boolean = true

  closeError: Error | null = null

  /**
   * Closes and fires the close handler with the code it was given, code 4000
   * versus anything else being a live branch in `onClose`. A close asked of an
   * already closed socket does nothing, as it does on a real WebSocket.
   */
  close (code?: number): void {
    if (this.readyState === CLOSED) return
    if (this.closeError) throw this.closeError
    this.closedWith.push(code)
    if (!this.answersClose) return
    this.readyState = CLOSED
    this.onclose?.({ code })
  }

  /** The last frame the driver sent, parsed. */
  lastSent (): Record<string, unknown> {
    return JSON.parse(this.sent[this.sent.length - 1])
  }

  /** Deliver a server message to the driver, as the transport would. */
  receive (data: object): void {
    this.receiveRaw(JSON.stringify(data))
  }

  /**
   * Deliver a DDP message body verbatim — the only way to reach the driver's
   * empty and malformed branches, which `receive` can never produce because it
   * serialises whatever it is given.
   */
  receiveRaw (data: string): void {
    this.onmessage?.({ data })
  }
}

/**
 * Compile-time proof that the fake still satisfies the declared transport
 * constructor. If the fake ever drifts toward an untyped object, the test
 * program fails here rather than in a spec.
 */
const fakeTransportConstructor: new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers?: { [key: string]: string } }
) => WebSocketClient = FakeWebSocket

/** The module shape `jest.mock('universal-websocket-client', ...)` returns. */
export const fakeTransportModule = {
  __esModule: true,
  default: fakeTransportConstructor
}

/**
 * Per-file setup. Fake timers are installed before any socket is constructed,
 * and the registry is emptied so each test reads sockets by absolute index.
 *
 * From here on the rule holds for every spec file: no file mixes real and fake
 * timers, and the clock is only ever driven through the async advance calls —
 * the sync ones stall at the first pending promise, and the test then asserts
 * nothing while still passing.
 */
export const useFakeClockAndSocketRegistry = (): void => {
  beforeEach(() => {
    jest.useFakeTimers()
    fakeSockets.length = 0
  })

  afterEach(() => {
    jest.useRealTimers()
  })
}

/**
 * Drive a freshly constructed Socket to an open, handshaken connection and
 * return the fake it built.
 *
 * The assertion that the transport constructor actually ran lives here rather
 * than in each spec: if the mock ever stops intercepting, the driver opens a
 * real socket and the failure looks like an SDK bug instead of a harness bug.
 * Every behavioural assertion in every spec runs after this check.
 */
export const openFakeConnection = async (socket: Socket, session = 'fake-session'): Promise<FakeWebSocket> => {
  const constructedBefore = fakeSockets.length
  const opening = socket.open()

  expect(fakeSockets).toHaveLength(constructedBefore + 1)
  const transport = fakeSockets[constructedBefore]

  await driveToHandshake(transport, session)

  await opening
  return transport
}

/**
 * Take an already-constructed fake through open and handshake, exactly as the
 * transport and server would.
 *
 * Separate from `openFakeConnection` because a *reopen* constructs its socket
 * behind a promise the spec never gets to hold — so there is no `socket.open()`
 * call to wrap, only a fake out of the registry to drive.
 */
export const driveToHandshake = async (transport: FakeWebSocket, session = 'fake-session'): Promise<void> => {
  // `connected` reads the ready state, and the handshake send waits on it.
  transport.readyState = OPEN
  transport.onopen?.({})

  // Let `onOpen` reach the point where it is listening for the handshake reply.
  await jest.advanceTimersByTimeAsync(0)
  transport.receive({ msg: 'connected', session })

  // And let everything the handshake reply resolves actually run.
  await jest.advanceTimersByTimeAsync(0)
}

/**
 * Turn the microtask queue over by hand.
 *
 * Timers are faked, so there is no macrotask to await: settling a chain that
 * hops several promises before its next frame goes out means driving those
 * hops directly.
 */
export const flushMicrotasks = async (): Promise<void> => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
}

/**
 * The Connection work a Socket is doing, by name. Read from the private fields
 * through element access, so no spec-only surface has to exist in the source:
 * `closing` is the only one production exposes, and it cannot tell a Scheduled
 * Reopen from Idle.
 */
export const connectionWork = (socket: Socket): 'idle' | 'scheduled' | 'attempting' | 'closing' => {
  const work = socket['connectionWork']
  if (work['closeOwned']) return 'closing'
  if (work['attempt']) return 'attempting'
  if (work['scheduledReopen']) return 'scheduled'
  return 'idle'
}

export const hasScheduledReopen = (socket: Socket): boolean =>
  connectionWork(socket) === 'scheduled'

/**
 * Every fake still wired to the Socket. Both letting a Transport go and losing
 * an established one null all four handlers, so this answers "can it still
 * reach the Socket", not "does the Socket still hold it". That second question
 * is `socket.connection`, and the two diverge for a lost-but-retained Transport.
 */
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

export const resubscribeAllAndAck = async (
  socket: Socket,
  transport: FakeWebSocket,
  id: string
) => {
  const resubscribing = socket.subscribeAll()
  await flushMicrotasks()
  transport.receive({ msg: 'ready', subs: [id] })
  return resubscribing
}

/**
 * The server's `ready` carries the subscription id in `subs[0]`, and the
 * driver re-emits it under that id — so acknowledging a subscription means
 * naming the id it was created with.
 */
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
