# ADR-0002: The SDK's emitter hardens `off` and `emit`

**Status:** Accepted

## Context

`SDKEventEmitter` in `lib/emitter.ts` extends `tiny-events`, and two of that
package's methods mutate the listener array by index without checking the index.

`off` finds its listener with `indexOf`, falls back to a scan for a `once`
wrapper's `.listener` back-reference, and then splices at whatever it ended up
with. When neither lookup matches, that value is `-1`, and `splice(-1, 1)`
removes the event's **last** listener. So removing a listener that is no longer
registered — an already-fired `once` above all — silently unsubscribed an
unrelated listener instead of doing nothing.

`emit` iterates the live array with `forEach`. A `once` wrapper removes itself as
it fires, which shifts every later listener down one index while the iteration is
mid-flight, so the listener immediately behind a firing `once` was stepped over
entirely.

Both failures are silent. Nothing throws, nothing logs, and the symptom is a
listener that stops receiving events nobody asked it to stop receiving. The
driver pairs `once` with `off` on the same event at every wait it owns —
`reopenNow`, `probe`, `waitForOpen`, `send` — so more than one listener on one
event is the normal state of the driver, not an edge case, and consumers add
their own listeners to the same emitter through `onStreamData`.

## Decision

`SDKEventEmitter` overrides `off` and `emit`.

- `off` returns without splicing when neither lookup found the listener. A
  removal that matches nothing is a no-op, which is what the caller asked for.
- `emit` iterates a copy of the listener array, so the set of listeners called is
  the set that was registered when the emit began.
- The override lives on the SDK's emitter rather than at the call sites. The
  faulty pattern is not one call site: it is every `once`/`off` pair in the
  driver, plus whatever a consumer registers, and a guard added per site would
  have to be added again by the next person to write a wait.
- Upstream semantics are otherwise preserved deliberately: `off`'s clear-all
  branch when no listener is given, its `.listener` back-reference scan that
  identifies a `once` wrapper by the function the caller actually passed, and
  both methods returning `this`.

## Consequences

- A listener removed during an emit still runs in that emit, because the emit
  iterates the snapshot. This is what lets `waitForOpen`'s cleanup remove its own
  `once` without stealing the `open` event from the long-lived echo listener
  `DDPDriver.connect` registers — the case where a send that waited on open used
  to leave the driver permanently silent about every later reconnect.
- The fix is consumer-visible, not only internal. `DDPDriver.onStreamData` hands
  back a `stop` that calls `off` with its own
  listener; calling `stop` twice, or calling it after the listener was already
  gone, used to unsubscribe an unrelated listener on the same event. It now stops
  the listener it was given and nothing else.
- Rejections that were previously skipped now fire. Every in-flight send is
  rejected on a forced reconnect rather than roughly half of them, which is why
  the value those sends reject with had to be made a real Error — see ADR-0003.
- This is the ADR to revisit if `tiny-events` is ever replaced or upgraded. Both
  overrides exist only to compensate for that package's behaviour, and a
  replacement that does not share it makes them dead weight rather than
  protection.
