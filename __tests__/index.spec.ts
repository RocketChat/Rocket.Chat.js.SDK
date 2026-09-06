import * as sdk from '../index'
import * as settings from '../lib/settings'

describe('SDK entry point', () => {
  it('re-exports the live settings module rather than a copy of it', () => {
    jest.replaceProperty(settings, 'customHeaders', { 'X-Test': 'value' })

    expect(sdk.settings.customHeaders).toEqual({ 'X-Test': 'value' })
  })
})
