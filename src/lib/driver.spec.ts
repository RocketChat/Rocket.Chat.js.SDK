import sinon from 'sinon'
import { expect } from 'chai'
import * as driver from './driver'
let clock

describe('lib:', function () {
  this.timeout(5000)
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
            expect(asteroid.endpoint).to.contain('localhost:3000')
            done()
          })
        })
      })
      context('with timeout, on expiry', () => {
        beforeEach(() => clock = sinon.useFakeTimers(0))
        afterEach(() => clock.restore())
        it('returns error', (done) => {
          let opts = { host: 'localhost:3000', timeout: 10 }
          driver.connect(opts, (err) => {
            expect(err).to.be.an('error')
            done()
          })
          clock.tick(20)
        })
        it('with url, attempts connection at URL', (done) => {
          let opts = { host: 'localhost:9999', timeout: 10 }
          driver.connect(opts, (err, asteroid) => {
            expect(err).to.be.an('error')
            expect(asteroid.endpoint).to.contain('localhost:9999')
            expect(asteroid.ddp.status).to.equal('disconnected')
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
    // describe('login', () => {})
  })
})
