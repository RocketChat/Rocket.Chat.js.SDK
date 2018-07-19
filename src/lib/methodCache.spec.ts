import sinon from 'sinon'
import { expect } from 'chai'
import LRU from 'lru-cache'
import * as methodCache from './methodCache'

// Instance method variance for testing cache
const mockInstance = { call: sinon.stub() }
mockInstance.call.withArgs('methodOne').onCall(0).returns({ result: 'foo' })
mockInstance.call.withArgs('methodOne').onCall(1).returns({ result: 'bar' })
mockInstance.call.withArgs('methodTwo', 'key1').returns({ result: 'value1' })
mockInstance.call.withArgs('methodTwo', 'key2').returns({ result: 'value2' })

describe('methodCache', () => {
  beforeEach(() => mockInstance.call.resetHistory())
  afterEach(() => methodCache.resetAll())
  describe('.use', () => {
    it('calls apply to instance', async () => {
      methodCache.use(mockInstance)
      await methodCache.call('methodOne', 'key1')
      expect(mockInstance.call.callCount).to.equal(1)
    })
    it('accepts a class instance', () => {
      class MyClass {}
      const myInstance = new MyClass()
      const shouldWork = () => methodCache.use(myInstance)
      expect(shouldWork).to.not.throw()
    })
  })
  describe('.create', () => {
    it('returns a cache for method calls', () => {
      expect(methodCache.create('anyMethod')).to.be.instanceof(LRU)
    })
    it('accepts options overriding defaults', () => {
      const cache = methodCache.create('methodOne', { maxAge: 3000 })
      expect(cache.max).to.equal(methodCache.defaults.max)
      expect(cache.maxAge).to.equal(3000)
    })
  })
  describe('.call', () => {
    it('throws if instance not in use', () => {
      methodCache.call('methodOne', 'key1')
        .then(() => { throw new Error('was not supposed to succeed') })
        .catch((e) => { expect(e).to.be.instanceof(Error) })
    })
    it('throws if method does not exist', () => {
      methodCache.use(mockInstance)
      methodCache.call('bad', 'key1')
        .then(() => { throw new Error('was not supposed to succeed') })
        .catch((e) => { expect(e).to.be.instanceof(Error) })
    })
    it('returns a promise', () => {
      methodCache.use(mockInstance)
      expect(methodCache.call('methodOne', 'key1').then).to.be.a('function')
    })
    it('calls the method with the key', () => {
      methodCache.use(mockInstance)
      return methodCache.call('methodTwo', 'key1').then((result) => {
        expect(result).to.equal('value1')
      })
    })
    it('only calls the method once', async () => {
      methodCache.use(mockInstance)
      await methodCache.call('methodOne', 'key1')
      await methodCache.call('methodOne', 'key1')
      expect(mockInstance.call.callCount).to.equal(1)
    })
    it('returns cached result on subsequent calls', async () => {
      methodCache.use(mockInstance)
      const result1 = await methodCache.call('methodOne', 'key1')
      const result2 = await methodCache.call('methodOne', 'key1')
      expect(result1).to.equal(result2)
    })
    it('calls again if cache expired', () => {
      const clock = sinon.useFakeTimers()
      methodCache.use(mockInstance)
      methodCache.create('methodOne', { maxAge: 10 })
      const result1 = methodCache.call('methodOne', 'key1')
      clock.tick(20)
      const result2 = methodCache.call('methodOne', 'key1')
      clock.restore()
      return Promise.all([result1, result2]).then((results) => {
        expect(mockInstance.call.callCount).to.equal(2)
        expect(results[0]).to.not.equal(results[1])
      })
    })
  })
  describe('.has', () => {
    it('returns true if the method cache was created', () => {
      methodCache.use(mockInstance)
      methodCache.create('methodOne')
      expect(methodCache.has('methodOne')).to.equal(true)
    })
    it('returns true if the method was called with cache', () => {
      methodCache.use(mockInstance)
      methodCache.call('methodOne', 'key')
      expect(methodCache.has('methodOne')).to.equal(true)
    })
    it('returns false if the method is not cached', () => {
      methodCache.use(mockInstance)
      expect(methodCache.has('methodThree')).to.equal(false)
    })
  })
  describe('.get', () => {
    it('returns cached result from last call with key', () => {
      methodCache.use(mockInstance)
      return methodCache.call('methodOne', 'key1').then((result) => {
        expect(methodCache.get('methodOne', 'key1')).to.equal(result)
      })
    })
  })
  describe('.reset', () => {
    it('removes cached results for a method and key', async () => {
      methodCache.use(mockInstance)
      const result1 = await methodCache.call('methodOne', 'key1')
      methodCache.reset('methodOne', 'key1')
      const result2 = await methodCache.call('methodOne', 'key1')
      expect(result1).not.to.equal(result2)
    })
    it('does not remove cache of calls with different key', async () => {
      methodCache.use(mockInstance)
      await methodCache.call('methodTwo', 'key1')
      await methodCache.call('methodTwo', 'key2')
      methodCache.reset('methodTwo', 'key1')
      const result = methodCache.get('methodTwo', 'key2')
      expect(result).to.equal('value2')
    })
    it('without key, removes all results for method', async () => {
      methodCache.use(mockInstance)
      await methodCache.call('methodTwo', 'key1')
      await methodCache.call('methodTwo', 'key2')
      methodCache.reset('methodTwo')
      const result1 = methodCache.get('methodTwo', 'key1')
      const result2 = methodCache.get('methodTwo', 'key2')
      expect(result1).to.equal(undefined)
      expect(result2).to.equal(undefined)
    })
  })
  describe('.resetAll', () => {
    it('resets all cached methods', async () => {
      methodCache.use(mockInstance)
      await methodCache.call('methodOne', 'key1')
      await methodCache.call('methodTwo', 'key1')
      methodCache.resetAll()
      await methodCache.call('methodOne', 'key1')
      await methodCache.call('methodTwo', 'key1')
      expect(mockInstance.call.callCount).to.equal(4)
    })
  })
})
