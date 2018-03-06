import { expect } from 'chai'
import * as exported from './index'

describe('index:', () => {
  it('exports all lib members', () => {
    expect(Object.keys(exported)).to.eql([
      'driver',
      'methodCache'
    ])
  })
})
