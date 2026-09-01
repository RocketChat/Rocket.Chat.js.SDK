import { EventEmitter } from 'tiny-events'

import { SDKEventEmitter } from '../emitter'

/**
 * `removeAllListeners` is not upstream API — `tiny-events` ships only
 * on/once/off/emit. It used to be installed onto that package's prototype at
 * module load, so it reached every emitter in the host process. These specs pin
 * the two halves of the replacement: the capability belongs to the SDK's own
 * emitters, and nothing outside them is touched.
 */
describe('SDKEventEmitter.removeAllListeners', () => {
  let emitter: SDKEventEmitter

  beforeEach(() => {
    emitter = new SDKEventEmitter()
  })

  it('does not reach emitters the SDK did not create', () => {
    // The guarantee the old prototype patch broke. `tiny-events` has no
    // `removeAllListeners`, and importing the SDK must not give it one.
    expect((new EventEmitter() as any).removeAllListeners).toBeUndefined()
  })

  it('removes the listeners for one event and returns them', () => {
    const stayListening = jest.fn()
    const stopListening = jest.fn()
    emitter.on('kept', stayListening)
    emitter.on('dropped', stopListening)

    expect(emitter.removeAllListeners('dropped')).toEqual([stopListening])

    emitter.emit('dropped')
    expect(stopListening).not.toHaveBeenCalled()
    emitter.emit('kept')
    expect(stayListening).toHaveBeenCalledTimes(1)
  })

  it('removes every listener and returns them all when given no event', () => {
    const first = jest.fn()
    const second = jest.fn()
    emitter.on('one', first)
    emitter.on('two', second)

    expect(emitter.removeAllListeners()).toEqual([first, second])

    emitter.emit('one')
    emitter.emit('two')
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })

  it('returns one entry per registration, not per distinct function', () => {
    // A function registered for two events was removed twice, so it appears
    // twice. The return value counts registrations removed rather than distinct
    // functions — de-duplicating would lose the fact that two events were
    // cleared. Pinned because either reading is arguable and callers should be
    // able to rely on one.
    const listener = jest.fn()
    emitter.on('one', listener)
    emitter.on('two', listener)

    expect(emitter.removeAllListeners()).toEqual([listener, listener])
  })

  it('reports a `once` listener as the function that was registered', () => {
    // `tiny-events` stores a wrapper for `once` and hangs the caller's function
    // off it as `.listener`, which is the same back-reference its own `off`
    // follows. Returning the wrapper would hand back something the caller never
    // passed in and cannot match against.
    const listenOnce = jest.fn()
    emitter.once('greeting', listenOnce)

    expect(emitter.removeAllListeners('greeting')).toEqual([listenOnce])
  })

  it('returns an empty array for an event with no listeners', () => {
    expect(emitter.removeAllListeners('never-registered')).toEqual([])
  })
})

/**
 * `off` and `emit` are overridden for the same reason: `tiny-events` mutates the
 * listener array by index, and both of its index bugs are silent — a listener
 * that was never asked to go stops receiving events.
 */
describe('SDKEventEmitter.off', () => {
  let emitter: SDKEventEmitter

  beforeEach(() => {
    emitter = new SDKEventEmitter()
  })

  it('is a no-op when the listener is no longer registered', () => {
    // Upstream splices at `indexOf`'s -1, and `splice(-1, 1)` removes the *last*
    // listener of the event. Removing an already-fired `once` — which the driver
    // does on every settled send — unsubscribed whoever registered last.
    const listenOnce = jest.fn()
    const stayListening = jest.fn()
    emitter.once('reply', listenOnce)
    emitter.on('reply', stayListening)

    emitter.emit('reply')
    expect(listenOnce).toHaveBeenCalledTimes(1)

    emitter.off('reply', listenOnce)

    emitter.emit('reply')
    expect(listenOnce).toHaveBeenCalledTimes(1)
    expect(stayListening).toHaveBeenCalledTimes(2)
  })

  it('is a no-op for a listener that was never registered', () => {
    const stayListening = jest.fn()
    emitter.on('reply', stayListening)

    emitter.off('reply', jest.fn())

    emitter.emit('reply')
    expect(stayListening).toHaveBeenCalledTimes(1)
  })

  it('removes a `once` listener by the function that was registered', () => {
    // The `.listener` back-reference scan, kept from upstream: the caller never
    // saw the wrapper, so it can only pass its own function.
    const listenOnce = jest.fn()
    emitter.once('reply', listenOnce)

    emitter.off('reply', listenOnce)

    emitter.emit('reply')
    expect(listenOnce).not.toHaveBeenCalled()
  })

  it('leaves every listener registered when given neither event nor listener', () => {
    const first = jest.fn()
    const second = jest.fn()
    emitter.on('reply', first)
    emitter.on('other', second)

    expect(emitter.off()).toBe(emitter)

    emitter.emit('reply')
    emitter.emit('other')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('clears every listener for the event when given no listener', () => {
    const first = jest.fn()
    const second = jest.fn()
    emitter.on('reply', first)
    emitter.on('reply', second)

    expect(emitter.off('reply')).toBe(emitter)

    emitter.emit('reply')
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })
})

describe('SDKEventEmitter.emit', () => {
  let emitter: SDKEventEmitter

  beforeEach(() => {
    emitter = new SDKEventEmitter()
  })

  it('does not skip a listener sitting behind a firing `once`', () => {
    // A `once` wrapper removes itself as it fires, shifting every later listener
    // down one index. Upstream iterates the live array, so the next listener was
    // stepped over entirely.
    const listenOnce = jest.fn()
    const nextListener = jest.fn()
    emitter.once('reply', listenOnce)
    emitter.on('reply', nextListener)

    emitter.emit('reply', 'payload')

    expect(listenOnce).toHaveBeenCalledWith('payload')
    expect(nextListener).toHaveBeenCalledWith('payload')
  })

  it('is a no-op for an event with no listeners', () => {
    const listener = jest.fn()
    emitter.on('reply', listener)

    expect(emitter.emit('other')).toBe(emitter)

    expect(listener).not.toHaveBeenCalled()
  })

  it('calls every listener when they are all `once`', () => {
    const first = jest.fn()
    const second = jest.fn()
    const third = jest.fn()
    emitter.once('reply', first)
    emitter.once('reply', second)
    emitter.once('reply', third)

    expect(emitter.emit('reply')).toBe(emitter)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(third).toHaveBeenCalledTimes(1)
  })
})
