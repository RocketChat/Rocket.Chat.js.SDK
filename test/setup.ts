import { EventEmitter } from 'tiny-events'

import * as settings from '../lib/settings'

// Importing the DDP driver overwrites `EventEmitter.prototype.removeAllListeners`
// on the library itself, for every consumer in the process. See PINNED-BUGS.md.
//
// This file runs before the spec's own imports, so the reference captured here is
// the pristine one. Restoring happens in teardown only: during a test file the
// patched prototype stays in place, because that is what the driver ships with
// and what the specs must pin. The restore keeps the mutation from outliving the
// file that caused it.
const pristineRemoveAllListeners = EventEmitter.prototype.removeAllListeners

afterAll(() => {
  EventEmitter.prototype.removeAllListeners = pristineRemoveAllListeners
})

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
