/**
 * @module EventEmitter
 * Typed port of the `tiny-events` package, vendored so the SDK owns its own
 * event base class instead of shadowing an untyped JS dependency with a shim.
 * `on`, `once`, `off` and `emit` are faithful to `tiny-events@1.0.1`.
 * `removeAllListeners` has no upstream counterpart: it replaces the method that
 * `lib/drivers/ddp.ts` used to monkey-patch onto the prototype, and it returns
 * the same empty listener array that patch returned so callers see no change.
 */

export type Listener = Function & { listener?: Function }

export class EventEmitter {
  _listeners: { [type: string]: Listener[] } = {}

  on (type: string, listener: Listener): this {
    if (!Array.isArray(this._listeners[type])) {
      this._listeners[type] = []
    }

    if (this._listeners[type].indexOf(listener) === -1) {
      this._listeners[type].push(listener)
    }

    return this
  }

  once (type: string, listener: Listener): this {
    const self = this

    const __once: Listener = function (this: any, ...args: any[]) {
      self.off(type, __once)
      listener.apply(self, args)
    }

    __once.listener = listener

    return this.on(type, __once)
  }

  off (type: string, listener?: Listener): this {
    if (!Array.isArray(this._listeners[type])) {
      return this
    }

    if (typeof listener === 'undefined') {
      this._listeners[type] = []
      return this
    }

    let index = this._listeners[type].indexOf(listener)

    if (index === -1) {
      for (let i = 0; i < this._listeners[type].length; i += 1) {
        if (this._listeners[type][i].listener === listener) {
          index = i
          break
        }
      }
    }

    this._listeners[type].splice(index, 1)
    return this
  }

  emit (type: string, ...args: any[]): this {
    if (!Array.isArray(this._listeners[type])) {
      return this
    }

    this._listeners[type].forEach(function __emit (this: any, listener: Listener) {
      listener.apply(this, args)
    }, this)

    return this
  }

  removeAllListeners (event?: string): Function[] {
    if (event) {
      this._listeners[event] = []
    } else {
      this._listeners = {}
    }
    return []
  }
}
