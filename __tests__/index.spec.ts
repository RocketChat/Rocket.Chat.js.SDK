import * as sdk from '../index'
import * as settings from '../lib/settings'

describe('SDK entry point', () => {
  afterEach(() => {
    settings.customHeaders = {}
  })

  it('exports settings as the same mutable module namespace', () => {
    expect(sdk.settings.customHeaders).toEqual({})

    sdk.settings.customHeaders = { 'X-Test': 'value' }

    expect(settings.customHeaders).toEqual({ 'X-Test': 'value' })
  })
})
