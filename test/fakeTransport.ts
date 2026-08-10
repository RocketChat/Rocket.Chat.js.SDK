import type WebSocketClient from 'universal-websocket-client'

import type { Socket } from '../lib/drivers/ddp'

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

  send (data: string): void {
    this.sent.push(data)
  }

  /**
   * Closes and fires the close handler with the code it was given — code 4000
   * versus anything else is a live branch in `onClose`.
   */
  close (code?: number): void {
    this.closedWith.push(code)
    this.readyState = CLOSED
    this.onclose?.({ code })
  }

  /** The last frame the driver sent, parsed. */
  lastSent (): Record<string, unknown> {
    return JSON.parse(this.sent[this.sent.length - 1])
  }

  /** Deliver a server message to the driver, as the transport would. */
  receive (data: object): void {
    this.onmessage?.({ data: JSON.stringify(data) })
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

  // `connected` reads the ready state, and the handshake send waits on it.
  transport.readyState = OPEN
  transport.onopen?.({})

  // Let `onOpen` reach the point where it is listening for the handshake reply.
  await jest.advanceTimersByTimeAsync(0)
  transport.receive({ msg: 'connected', session })

  await opening
  return transport
}
