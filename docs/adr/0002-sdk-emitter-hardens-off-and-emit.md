# ADR-0002: The SDK emitter makes `off` and `emit` safe

**Status:** Accepted

## Context

`SDKEventEmitter` in `lib/emitter.ts` extends the `tiny-events` package. Two
methods of that package change the listener array by index. Neither method
checks the index first.

`off` finds its listener with `indexOf`. If `indexOf` finds nothing, `off` then
scans for the `.listener` back-reference of a `once` wrapper. If both steps find
nothing, the index is `-1`. `off` then calls `splice(-1, 1)`, and `splice`
removes the last listener of the event. Therefore `off` removed a listener that
no caller asked it to remove. A `once` that had already run was the usual cause.

`emit` reads the live listener array. A `once` wrapper removes itself while the
wrapper runs. That removal moves each later listener down one index. `emit` is
part way through the array at that moment, so `emit` steps over the listener
behind the `once`.

Both faults are silent. No code throws, and no code writes a log line. The only
symptom is a listener that stops to receive its events.

The Socket pairs `once` with `off` on the same event at each wait that the Socket
owns. These waits are `reopenNow`, `probe`, `waitForOpen` and `send`. More than
one listener on one event is therefore the normal state of the Socket, not a rare
case. A consuming app also adds its own listeners to that same emitter through
the Driver's `onStreamData`.

## Decision

`SDKEventEmitter` replaces `off` and `emit`.

- `off` returns and calls no `splice` if both lookups find nothing. A removal
  that matches nothing does nothing, which is what the caller asks for.
- `emit` reads a copy of the listener array. `emit` calls the listeners that were
  registered when `emit` started.
- The replacements are on the SDK emitter, not at each call site. The fault is
  not at one call site. The fault is at each pair of `once` and `off` in the
  Socket, and also in the code of a consuming app. A guard at each site needs the
  next person who writes a wait to add that guard again.
- The replacements keep the rest of the behaviour of the package, and this is
  deliberate. They keep the branch of `off` that removes all listeners when the
  caller gives no listener. They keep the `.listener` scan, because that scan
  identifies a `once` wrapper from the function that the caller gave. Both
  methods continue to return `this`.

## Consequences

- A listener that a caller removes during an emit still runs in that emit,
  because `emit` reads a copy. This result lets the cleanup of `waitForOpen`
  remove its own `once` and leave the `open` event for the listener the Driver
  registers on its Socket and keeps. A send that waits for `open` therefore does
  not silence the Driver about later Reopens.
- A consuming app sees the correction, not only the SDK. `Driver.onStreamData`
  gives the app a `stop` function, and `stop` calls `off` with the listener of the
  app. Two calls to `stop`, or one call after the listener was already gone,
  removed a different listener on the same event. `stop` removes only the
  listener that the app gave it.
- Every rejection reaches its listener, including the ones `emit` stepped over.
  An immediate reconnect rejects each send in flight, not approximately one half
  of them. For this reason the value of those rejections must be a true Error.
  Refer to ADR-0003.
- Read this ADR again if a person replaces or upgrades `tiny-events`. Both
  replacements exist only because of the behaviour of that package. A different
  package without that behaviour makes both replacements dead weight.
