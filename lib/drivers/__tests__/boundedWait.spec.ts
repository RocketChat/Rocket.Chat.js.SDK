import { BoundedWait } from '../boundedWait'

/**
 * The single bounded wait every wait on the Socket is built from. What each of
 * those waits does with it lives in the socket specs; this file is only about
 * ending once, the deadline, and the release.
 */
describe('BoundedWait', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('resolves with the value it is settled with', async () => {
    const wait = new BoundedWait<string>()
    wait.resolve('ready')

    await expect(wait.promise).resolves.toBe('ready')
  })

  it('rejects with the error it is failed with', async () => {
    const wait = new BoundedWait<void>()
    wait.reject(new Error('gone'))

    await expect(wait.promise).rejects.toThrow('gone')
  })

  it('keeps the first settle when a second follows', async () => {
    const wait = new BoundedWait<string>()
    wait.resolve('first')
    wait.reject(new Error('second'))

    await expect(wait.promise).resolves.toBe('first')
  })

  it('ends on its deadline', async () => {
    const wait = new BoundedWait<string>(100, () => wait.resolve('expired'))
    jest.advanceTimersByTime(100)

    await expect(wait.promise).resolves.toBe('expired')
  })

  it('does not reach its deadline once it is settled', async () => {
    const onDeadline = jest.fn()
    const wait = new BoundedWait<string>(100, onDeadline)
    wait.resolve('answered')
    jest.advanceTimersByTime(1000)

    await expect(wait.promise).resolves.toBe('answered')
    expect(onDeadline).not.toHaveBeenCalled()
  })

  it('releases what it attached, once, when it settles', () => {
    const release = jest.fn()
    const wait = new BoundedWait<void>()
    wait.release(release)

    wait.resolve(undefined)
    wait.resolve(undefined)

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases every release it was given', () => {
    const first = jest.fn()
    const second = jest.fn()
    const wait = new BoundedWait<void>()
    wait.release(first)
    wait.release(second)

    wait.resolve(undefined)

    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
  })

  it('leaves the promise to another settler when it is cancelled', async () => {
    const release = jest.fn()
    const onDeadline = jest.fn()
    const wait = new BoundedWait<void>(100, onDeadline)
    wait.release(release)

    wait.cancel()
    jest.advanceTimersByTime(1000)

    expect(release).toHaveBeenCalled()
    expect(onDeadline).not.toHaveBeenCalled()
    await expect(Promise.race([wait.promise, Promise.resolve('pending')])).resolves.toBe('pending')
  })
})
