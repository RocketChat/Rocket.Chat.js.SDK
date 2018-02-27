import sinon from 'sinon'
import { expect } from 'chai'
import LRU from 'lru-cache'
import * as methodCache from './methodCache'

// Instance method variance for testing cache
const mockInstance = { methodOne: sinon.stub(), methodTwo: sinon.stub() }
mockInstance.methodOne.onCall(0).returns('foo')
mockInstance.methodOne.onCall(1).returns('bar')
mockInstance.methodTwo.withArgs('key').returns('value')

describe('lib:', () => {
  beforeEach(() => {
    mockInstance.methodOne.resetHistory()
    mockInstance.methodTwo.resetHistory()
  })
  afterEach(() => {
    methodCache.clearAll()
  })
  describe('methodCache', () => {
    describe('use', () => {
      it('calls apply to instance', () => {
        methodCache.use(mockInstance)
        methodCache.call('methodOne', 'key')
        expect(mockInstance.methodOne.callCount).to.equal(1)
      })
      it('accepts a class instance', () => {
        class MyClass {}
        const myInstance = new MyClass()
        const shouldWork = () => methodCache.use(myInstance)
        expect(shouldWork).to.not.throw()
      })
    })
    describe('create', () => {
      it('returns a cache for method calls', () => {
        expect(methodCache.create('anyMethod')).to.be.instanceof(LRU)
      })
      it('accepts options overriding defaults', () => {
        const cache = methodCache.create('methodOne', { maxAge: 3000 })
        expect(cache.max).to.equal(methodCache.defaults.max)
        expect(cache.maxAge).to.equal(3000)
      })
    })
    describe('call', () => {
      it('throws if instance not in use', () => {
        const badUse = () => methodCache.call('methodOne', 'key')
        expect(badUse).to.throw()
      })
      it('throws if method does not exist', () => {
        methodCache.use(mockInstance)
        const badUse = () => methodCache.call('bad', 'key')
        expect(badUse).to.throw()
      })
      it('returns a promise', () => {
        methodCache.use(mockInstance)
        expect(methodCache.call('methodOne', 'key').then).to.be.a('function')
      })
      it('calls the method with the key', () => {
        methodCache.use(mockInstance)
        return methodCache.call('methodTwo', 'key').then((result) => {
          expect(result).to.equal('value')
        })
      })
      it('only calls the method once', () => {
        methodCache.use(mockInstance)
        methodCache.call('methodOne', 'key')
        methodCache.call('methodOne', 'key')
        expect(mockInstance.methodOne.callCount).to.equal(1)
      })
      it('returns cached result on subsequent calls', () => {
        methodCache.use(mockInstance)
        return Promise.all([
          methodCache.call('methodOne', 'key'),
          methodCache.call('methodOne', 'key')
        ]).then((results) => {
          expect(results[0]).to.equal(results[1])
        })
      })
      it('calls again if cache expired', () => {
        const clock = sinon.useFakeTimers()
        methodCache.use(mockInstance)
        methodCache.create('methodOne', { maxAge: 10 })
        const result1 = methodCache.call('methodOne', 'key')
        clock.tick(20)
        const result2 = methodCache.call('methodOne', 'key')
        clock.restore()
        return Promise.all([result1, result2]).then((results) => {
          expect(mockInstance.methodOne.callCount).to.equal(2)
          expect(results[0]).to.not.equal(results[1])
        })
      })
    })
    describe('get', () => {
      it('returns cached result from last call', () => {
        methodCache.use(mockInstance)
        return methodCache.call('methodOne', 'key').then((result) => {
          expect(methodCache.get('methodOne', 'key')).to.equal(result)
        })
      })
    })
    describe('clear', () => {
      it('removes cached results for a method', () => {
        methodCache.use(mockInstance)
        const result1 = methodCache.call('methodOne', 'key')
        methodCache.clear('methodOne', 'key')
        const result2 = methodCache.call('methodOne', 'key')
        expect(result1).not.to.equal(result2)
      })
    })
    describe('clearAll', () => {
      it('clears all cached methods', () => {
        methodCache.use(mockInstance)
        methodCache.call('methodOne', 'key')
        methodCache.call('methodTwo', 'key')
        methodCache.clearAll()
        methodCache.call('methodOne', 'key')
        methodCache.call('methodTwo', 'key')
        expect(mockInstance.methodOne.callCount).to.equal(2)
        expect(mockInstance.methodTwo.callCount).to.equal(2)
      })
    })
  })
})
