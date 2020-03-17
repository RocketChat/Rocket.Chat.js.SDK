import 'mocha'
import sinon from 'sinon'
import { expect } from 'chai'
import { silence } from './log'
import { botUser } from '../utils/config'
import * as util from './util'

const delay = (ms: number) => new Promise((resolve, reject) => setTimeout(resolve, ms))

describe('[util]', () => {
  describe('debounce', () => {
    it('does not call immediately by default', async () => {
      const spy = sinon.spy()
      const debounced = util.debounce(spy, 30)
      debounced()
      sinon.assert.callCount(spy, 0)
      await delay(30)
      sinon.assert.callCount(spy, 1)
    })
    it('can be called immediately with option', async () => {
      const spy = sinon.spy()
      const debounced = util.debounce(spy, 30, true)
      debounced()
      sinon.assert.callCount(spy, 1)
    })
    it('does not call consecutively within time given time', async () => {
      const spy = sinon.spy()
      const debounced = util.debounce(spy, 30, true)
      debounced()
      debounced()
      await delay(30)
      sinon.assert.callCount(spy, 1)
    })
    it('can be called again after delay', async () => {
      const spy = sinon.spy()
      const debounced = util.debounce(spy, 30, true)
      debounced()
      await delay(30)
      debounced()
      sinon.assert.callCount(spy, 2)
    })
  })
  describe('hostToWS', () => {
    it('converts hostname to ws url', () => {
      expect(util.hostToWS('localhost:3000')).to.equal('ws://localhost:3000')
    })
    it('converts http/s path to ws url', () => {
      expect(util.hostToWS('http://localhost:3000')).to.equal('ws://localhost:3000')
    })
    it('converts host to secure ws url', () => {
      expect(util.hostToWS('localhost:3000', true)).to.equal('wss://localhost:3000')
    })
  })
})
