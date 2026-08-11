import { EventEmitter } from 'tiny-events'

import { SDKEventEmitter } from './emitter'

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
