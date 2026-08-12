import type WebSocketClient from 'universal-websocket-client'

import type { Socket } from '../lib/drivers/ddp'

/**
 * The stand-in for the Rocket.Chat server at the other end of a Socket, and the
 * one and only way a spec reaches one. The transport module is mocked with
 * `fakeServerModule`, so the driver constructs the fake itself through
 * `new WebSocket(...)` on its normal code path. Nothing is ever assigned onto
 * `socket.connection`, and no shipped source is touched.
 *
 * A spec opts in with a hoisted mock — the one line that has to be repeated per
 * file, because `jest.mock` only hoists inside the file that calls it:
 *
 *     jest.mock('universal-websocket-client', () =>
 *       require('../../test/fakeServer').fakeServerModule)
 *
 * Everything else — the registry, the per-test setup, the ready states and the
 * four transport handlers — lives behind the acts below, so swapping the seam
 * later touches one file.
 */

const CONNECTING = 0
const OPEN = 1
const CLOSED = 3

const TRANSPORT_HANDLERS = ['onopen', 'onmessage', 'onerror', 'onclose'] as const

type DdpFrame = Record<string, unknown>

/**
 * A real class, not a stub object: a mocked class is what lets the fake satisfy
 * the declared transport type without casting. The four handlers are assignable
 * and nullable because the driver's teardown nulls all four.
 */
export class FakeServer {
  private frameBuffer: string[] = []
  private writeFailure: Error | null = null
  private teardownFailure: Error | null = null

  /** `undefined` records a bare close, which the driver never issues. */
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
    connections.record(this)
  }

  send (data: string): void {
    if (this.writeFailure) throw this.writeFailure
    this.frameBuffer.push(data)
  }

  close (code?: number): void {
    if (this.teardownFailure) throw this.teardownFailure
    this.closedWith.push(code)
    this.readyState = CLOSED
    this.onclose?.({ code })
  }

  /**
   * Take the connection through open and handshake, exactly as the transport and
   * the server would. Called on a held reference, or on `connections.latest`
   * when a Reopen built the connection behind a promise the spec never holds.
   */
  async accept (session = 'fake-session'): Promise<void> {
    // `connected` reads the ready state, and the handshake send waits on it.
    this.readyState = OPEN
    this.onopen?.({})

    // Let `onOpen` reach the point where it is listening for the handshake reply.
    await jest.advanceTimersByTimeAsync(0)
    this.deliver({ msg: 'connected', session })

    // And let everything the handshake reply resolves actually run.
    await jest.advanceTimersByTimeAsync(0)
  }

  deliver (ddpMessage: object): void {
    this.deliverRaw(JSON.stringify(ddpMessage))
  }

  /**
   * Deliver a DDP message body verbatim — the only way to reach the driver's
   * empty and malformed branches, which `deliver` can never produce because it
   * serialises whatever it is given.
   */
  deliverRaw (body: string): void {
    this.onmessage?.({ data: body })
  }

  /**
   * The connection stops being open without the driver ever being told, which is
   * what a caller sending into a dropped pipe sees.
   */
  closeQuietly (): void {
    this.readyState = CLOSED
  }

  get isOpen (): boolean {
    return this.readyState === OPEN
  }

  frames (): DdpFrame[] {
    return this.frameBuffer.map((frame) => JSON.parse(frame))
  }

  lastFrame (): DdpFrame {
    return this.frames()[this.frameCount - 1]
  }

  framesSince (previousFrameCount: number): DdpFrame[] {
    return this.frames().slice(previousFrameCount)
  }

  get frameCount (): number {
    return this.frameBuffer.length
  }

  /**
   * A real websocket throws from `send` once the socket has closed under it.
   */
  failWrites (failure: Error): void {
    this.writeFailure = failure
  }

  failTeardown (failure: Error): void {
    this.teardownFailure = failure
  }

  /**
   * The close handler the driver installed, kept callable across the teardown
   * that nulls it — the only way to reach `onClose` with a connection the driver
   * has already replaced.
   */
  captureCloseHandler (): (code: number) => void {
    const onclose = this.onclose
    if (!onclose) throw new Error('[test] the driver has attached no close handler')
    return (code: number) => onclose({ code })
  }

  attachedHandlers (): string[] {
    return TRANSPORT_HANDLERS.filter((handler) => this[handler] !== null)
  }
}

/**
 * The connections the driver has built, in construction order. `latest` is the
 * one every spec means: the connection a Reopen, a reconnect or the first open
 * just produced. `count` is how a spec says a Reopen happened at all.
 */
class ConnectionRegistry {
  private servers: FakeServer[] = []

  get count (): number {
    return this.servers.length
  }

  get latest (): FakeServer {
    const latest = this.servers[this.servers.length - 1]
    if (!latest) throw new Error('[test] the driver has built no connection')
    return latest
  }

  record (server: FakeServer): void {
    this.servers.push(server)
  }

  reset (): void {
    this.servers.length = 0
  }
}

export const connections = new ConnectionRegistry()

/**
 * Compile-time proof that the fake still satisfies the declared transport
 * constructor. If it ever drifts toward an untyped object, the test program
 * fails here rather than in a spec.
 */
const fakeServerConstructor: new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers?: { [key: string]: string } }
) => WebSocketClient = FakeServer

/** The module shape `jest.mock('universal-websocket-client', ...)` returns. */
export const fakeServerModule = {
  __esModule: true,
  default: fakeServerConstructor
}

/**
 * Make the next transport construction throw. The driver reads the module's
 * export at call time, and `restoreMocks` in jest.config.js puts it back.
 */
export const failNextConnection = (failure: Error): void => {
  jest.spyOn(fakeServerModule, 'default').mockImplementation(() => { throw failure })
}

/**
 * Per-file setup. Fake timers are installed before any connection is built, and
 * the registry is emptied so each test reads connections from a clean slate.
 *
 * From here on the rule holds for every spec file: no file mixes real and fake
 * timers, and the clock is only ever driven through the async advance calls —
 * the sync ones stall at the first pending promise, and the test then asserts
 * nothing while still passing.
 */
export const useFakeServers = (): void => {
  beforeEach(() => {
    jest.useFakeTimers()
    connections.reset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })
}

/**
 * Drive a freshly constructed Socket to an open, handshaken connection and
 * return the server on the other end of it.
 *
 * The assertion that the transport constructor actually ran lives here rather
 * than in each spec: if the mock ever stops intercepting, the driver opens a
 * real socket and the failure looks like an SDK bug instead of a harness bug.
 * Every behavioural assertion in every spec runs after this check.
 */
export const openFakeConnection = async (socket: Socket, session = 'fake-session'): Promise<FakeServer> => {
  const builtBefore = connections.count
  const opening = socket.open()

  expect(connections.count).toBe(builtBefore + 1)
  const server = connections.latest

  await server.accept(session)

  await opening
  return server
}
