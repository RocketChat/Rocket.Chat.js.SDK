import * as settings from '../lib/settings'
import { installFreshFetchMock } from './stubbedFetch'

// `settings.customHeaders` is a mutable module global the driver reads when it
// constructs a socket, so a test that sets headers would otherwise leak into the
// next one. `replaceProperty` registers the restore with jest itself, and
// `restoreMocks` in jest.config.js undoes it before the next test — so the reset
// is guaranteed by config rather than by every file remembering to do it.
//
// The two obvious alternatives are wrong: direct assignment and in-place merging
// both leak, and `jest.resetModules()` hands back a fresh module object while the
// already-imported driver keeps the old one in its closure.
beforeEach(() => {
  jest.replaceProperty(settings, 'customHeaders', {})
})

beforeEach(installFreshFetchMock)
