import { expect } from 'chai'
import { Driver } from './index'

describe('Index', () => {
  describe('Driver', () => {
    it('class is accessible', () => {
      expect(Driver).to.have.property('name', 'Driver')
    })
  })
})
