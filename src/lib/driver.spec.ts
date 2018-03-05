import sinon from 'sinon'
import { expect } from 'chai'
import * as driver from './driver'
import * as methodCache from './methodCache'
let clock

describe('lib:', () => {
  describe('driver', () => {
    describe('.connect', () => {
      context('with localhost connection', () => {
        it('without args, returns a promise', () => {
          const promise = driver.connect()
          expect(promise.then).to.be.a('function')
          promise.catch((err) => console.error(err))
          return promise
        })
        it('accepts an error-first callback, providing asteroid', (done) => {
          driver.connect({}, (err, asteroid) => {
            expect(err).to.equal(null)
            expect(asteroid).to.be.an('object')
            done()
          })
        })
        it('without url takes localhost as default', (done) => {
          driver.connect({}, (err, asteroid) => {
            expect(err).to.eql(null)
            // const connectionHost = asteroid.endpoint
            const connectionHost = asteroid._host
            expect(connectionHost).to.contain('localhost:3000')
            done()
          })
        })
        it('promise resolves with asteroid in successful state', () => {
          return driver.connect({}).then((asteroid) => {
            const isActive = asteroid.ddp.readyState === 1
            // const isActive = asteroid.ddp.status === 'connected'
            expect(isActive).to.equal(true)
          })
        })
        it('provides the asteroid instance to method cache', () => {
          return driver.connect().then((asteroid) => {
            expect(methodCache.instance).to.eql(asteroid)
          })
        })
      })
      context('with timeout, on expiry', () => {
        beforeEach(() => {
          clock = sinon.useFakeTimers(0)
        })
        afterEach(() => {
          clock.restore()
        })
        it('with url, attempts connection at URL', (done) => {
          driver.connect({ host: 'localhost:9999', timeout: 10 }, (err, asteroid) => {
            expect(err).to.be.an('error')
            const connectionHost = asteroid.endpoint || asteroid._host
            expect(connectionHost).to.contain('localhost:9999')
            done()
          })
          clock.tick(200)
        })
        it('returns error', (done) => {
          let opts = { host: 'localhost:9999', timeout: 10 }
          driver.connect(opts, (err, asteroid) => {
            const isActive = (asteroid.ddp.readyState === 1)
            expect(err).to.be.an('error')
            expect(isActive).to.eql(false)
            done()
          })
          clock.tick(20)
        })
        it('without callback, triggers promise catch', () => {
          const promise = driver.connect({ host: 'localhost:9999', timeout: 20 })
          .catch((err) => expect(err).to.be.an('error'))
          clock.tick(30)
          return promise
        })
        it('with callback, provides error to callback', (done) => {
          driver.connect({ host: 'localhost:9999', timeout: 10 }, (err) => {
            expect(err).to.be.an('error')
            done()
          })
          clock.tick(30)
        })
      })
    })
    describe('disconnect', () => {
      // Only Asteroid v2 has a disconnect method
      /*
      it('disconnects from asteroid', async () => {
        await driver.connect()
        const asteroid = await driver.connect()
        await driver.disconnect()
        const isActive = asteroid.ddp.readyState === 1
        // const isActive = asteroid.ddp.status === 'connected'
        expect(isActive).to.equal(false)
      })
      */
    })
  })
})
