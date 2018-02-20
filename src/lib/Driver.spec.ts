import { expect } from 'chai'
import { Driver } from './Driver'

describe('lib:', () => {
  describe('Driver', () => {
    describe('#constuctor', () => {
      context('without url', () => {
        it('takes localhost as default', () => {
          const d: Driver = new Driver()
          expect(d.host).to.equal('localhost:3000')
        })
      })
      context('with localhost url', () => {
        it('emits connected event', (done) => {
          new Driver('localhost:3000').on('connected', () => done())
        })
      })
    })
  })
})
