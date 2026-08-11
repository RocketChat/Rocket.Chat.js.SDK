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
 * Internal: not exported from the package entry point, so its shape can change
 * without a breaking release.
 */
export class SDKEventEmitter extends EventEmitter {
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
