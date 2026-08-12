# ADR-0005: Every bounded wait in the connection lifecycle goes through one Deadline primitive

**Status:** Accepted

## Context

The Socket in `lib/drivers/ddp.ts` holds four waits it must be able to give up
on: `reopenNow` waits for `open`, `probe` waits for `pong`, `waitForOpen` waits
for `open`, and the Liveness chain waits for the answer to its ping.

Each one wrote the same sequence by hand. Register a `once` listener. Arm a
`setTimeout`. Guard a `settled` boolean so the two racers cannot both settle the
promise. Then remove the listener and clear the timer, whichever arrived first.

That sequence is not incidental. ADR-0002 names these same four waits as the
reason `SDKEventEmitter` had to replace `off` and `emit`: an `off` that misses
removes an unrelated listener, and a listener left attached after its wait ends
is a leak on a socket that lives for the length of the session. The pairing of
`once` with the matching `off` is load-bearing, and it was written out four
times, so a fifth wait meant getting it right a fifth time.

The two liveness waits had already drifted. A Probe and one turn of the Liveness
chain are the same act — write a ping frame, wait for the pong, give up on a
Deadline — but the chain raced a promise against a hand-built timer while the
Probe listened for an event with a timer of its own. Each needed its own fix for
the same class of fault.

## Decision

The Socket has one private bounded wait, `awaitEvent(event, deadlineMs, start)`.
It listens for the event, gives up on the Deadline, and detaches the listener and
clears the timer on either outcome. It resolves true when the event arrived and
false when the Deadline expired.

- `start` runs with the listener already attached, so a server that answers in
  the same tick as the write cannot be missed. Returning false from `start`
  abandons the wait, leaving neither timer nor listener behind. This is how a
  Probe reports a transport that refused the write.
- `reopenNow`, `probe` and `waitForOpen` are each expressed in terms of it.
- The Liveness chain is expressed as a repeated Probe: probe on the interval,
  schedule the next turn when the server answers, Reopen when it does not. The
  Deadline stays on the Probe rather than moving into `send`, so no other caller
  inherits a reply timeout.

## Consequences

- The `once`/`off` pairing ADR-0002 protects now exists in one place. A fifth
  wait gets it by construction.
- A Probe and a turn of the chain cannot drift apart again, because there is only
  one of them.
- The chain's ping is written straight to the transport rather than through
  `send`. The frame on the wire is unchanged — `send` assigns no id to a ping —
  but the chain no longer consumes an id from the `sent` counter and no longer
  registers the `disconnected` listener `send` attaches. Nothing reads the
  counter for anything but uniqueness.
- A chain turn on a transport that refuses the write now reopens at once instead
  of waiting for a reply that cannot come.
- The `settled` booleans are gone. Settling is idempotent because the primitive
  removes the listener and clears the timer together, so neither racer can reach
  the promise twice.
