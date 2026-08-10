# Pinned bugs

Behaviour the specs assert **as it is today**, not as it should be. Each row is a
known defect: the spec exists so a future fix is a deliberate, visible change
rather than a silent one. When a row is fixed, change the spec and delete the row.

| # | Bug | Where | Pinned by | Notes |
| - | --- | ----- | --------- | ----- |
| 1 | Importing the driver mutates `tiny-events` process-wide: it assigns `EventEmitter.prototype.removeAllListeners` at module scope, so every emitter in the host process — including ones the SDK never created — gets the replacement. It also returns `[]` instead of the removed listeners. | `lib/drivers/ddp.ts` (module top level) | `test/setup.ts` captures the pristine method before any spec import and restores it in teardown | Cannot be fixed without touching shipped source. The setup file contains the blast radius to one test file. |
| 2 | The OAuth credential guard tests `params.oath` — a typo for `oauth` — and reads `credentialToken`/`credentialSecret` off the root instead of the `oauth` object. A well-formed `ICredentialsOAuth` therefore fails the guard and falls through to the password branch, where `sha256(undefined)` throws. | `interfaces/index.ts`, `isLoginOAuth` | `lib/drivers/ddp.spec.ts`, the OAuth branch | The spec passes the misspelled shape, because that is the only shape that reaches the branch. |
