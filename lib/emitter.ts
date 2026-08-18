/// <reference path="../types/events.d.ts" />
/**
 * @module emitter
 * The event emitter every SDK class inherits from.
 */

import { EventEmitter } from 'tiny-events'

/**
 * `tiny-events` stores a wrapper for `once` listeners and hangs the function the
 * caller actually registered off it as `.listener` — the same back-reference its
 * own `off` follows to identify one. Unwrap it so a removed `once` listener is
 * reported as the function that was handed in, not the internal wrapper.
 */
const registeredListener = (listener: Function): Function =>
  (listener as any).listener || listener

/**
 * `tiny-events` has no `removeAllListeners`, but `ISocket` advertises one. This
 * class owns it, so the capability travels with the SDK's own emitters instead
 * of being installed onto the shared `tiny-events` prototype — which reached
 * every emitter in the host process, including ones the SDK never created.
 *
 * The class is not exported from `index.ts`, but do not read that as freedom to
 * reshape it. `removeAllListeners` is public API twice over: `Socket`,
 * `Driver` and `Api` inherit it, so it reaches consumers through
 * `Rocketchat`, and `package.json` sets `"main": "index.ts"` —
 * the package ships TypeScript source, so `lib/emitter` is importable directly.
 * Narrowing the signature is a breaking change.
 */
export class SDKEventEmitter extends EventEmitter {
  /**
   * `tiny-events` splices at the index it found without checking it found one,
   * and `splice(-1, 1)` drops the *last* listener of the event — so removing a
   * listener that is no longer registered, an already-fired `once` above all,
   * silently unsubscribes an unrelated one. Guard the miss.
   *
   * Everything else is upstream's behaviour, deliberately: the clear-all branch
   * when no listener is given, the `.listener` back-reference scan that
   * identifies a `once` wrapper by the function it wraps, and returning `this`.
   */
  off (event?: string, listener?: Function): this {
    const listeners = event ? this._listeners[event] : undefined
    if (!Array.isArray(listeners)) return this

    if (typeof listener === 'undefined') {
      this._listeners[event as string] = []
      return this
    }

    let index = listeners.indexOf(listener)
    if (index === -1) {
      index = listeners.findIndex((registered: any) => registered.listener === listener)
    }
    if (index === -1) return this

    listeners.splice(index, 1)
    return this
  }

  /**
   * `tiny-events` iterates the live listener array, so a `once` wrapper that
   * removes itself as it fires shifts every later listener down one index and
   * `forEach` skips the next one. Iterate a snapshot instead; the return value
   * is upstream's `this`.
   */
  emit (event: string, ...args: any[]): this {
    const listeners = this._listeners[event]
    if (!Array.isArray(listeners)) return this

    listeners.slice().forEach((listener) => listener.apply(this, args))
    return this
  }

  /** Drop the listeners for one event, or for every event, and return them. */
  removeAllListeners (event?: string): Function[] {
    if (event) {
      const removed = (this._listeners[event] || []).map(registeredListener)
      this._listeners[event] = []
      return removed
    }
    const removed = Object.keys(this._listeners).reduce(
      (all: Function[], type) => all.concat(this._listeners[type].map(registeredListener)),
      []
    )
    this._listeners = {}
    return removed
  }
}
