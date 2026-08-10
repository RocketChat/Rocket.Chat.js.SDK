import { EventEmitter } from 'tiny-events'

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
