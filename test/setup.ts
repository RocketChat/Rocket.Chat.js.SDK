import * as settings from '../lib/settings'

beforeEach(() => {
  jest.replaceProperty(settings, 'customHeaders', {})
})
