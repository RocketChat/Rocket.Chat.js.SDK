# ADR-0012: A handle is returned exactly when an entry is written

**Status:** Accepted

**Succeeds:** ADR-0006

## Context

ADR-0006 settled the bookkeeping for a `sub` whose answer never came, and said
of the caller that nothing changed: `subscribe` resolved `undefined` on every
failure. That leaves the two halves of one act disagreeing. An abandoned `sub`
writes an entry — the instruction ADR-0004 defines, which `subscribeAll` replays
at every Login — and hands the caller nothing to name it with.

`unsubscribe` takes an id. A caller that received `undefined` has no id, and
under ADR-0011 the id is derived from the stream, so it cannot recover one
without recomputing the hash the SDK computes internally. The entry is therefore
unreachable from outside the SDK: the stream is re-established at every Login
for the life of the Socket, and no consuming app can end it. The consuming app
opens a room, the reconnect abandons the `sub`, and the stream it asked for
outlives every screen that wanted it.

The register-side rule already reads as a single condition — an entry exists when
there is an instruction to re-establish the stream, whether the server may be
streaming it or has never been asked for it. Nothing about the caller's side
needs a second rule; it needs the same one, which is why widening the entries
ADR-0006 writes widens the handles handed out rather than opening a gap between
them.

## Decision

A caller is handed a subscription exactly when an entry was written. A handle
exists if and only if an entry does.

- A `sub` the connection abandoned, and one whose Deadline expired, resolve with
  the subscription `rememberSubscription` wrote — the same object
  `subscriptions[id]` holds, not a copy of it. Both are the paths ADR-0006 keeps
  an entry for, and the handle is what makes that entry reachable: the caller can
  `unsubscribe` from it without holding an id.
- `rememberSubscription` returns what it wrote, and returns nothing when it wrote
  nothing. A `subscribe` on a Socket holding no attached Transport writes its
  entry under ADR-0006 without composing a `sub` frame, so its caller receives
  that entry: the instruction to a later Login exists, and the handle is what
  makes it reachable. Only a Close leaves a Socket with no connection and no
  instruction, and there the caller receives nothing.
- A success response that names no `subs` writes no entry and resolves
  `undefined`. The `ready` is the acknowledgement and the only writer under
  ADR-0004; a response that acknowledges no stream leaves nothing to hand out.
- A `sub` the server refused with a DDP error, and one whose frame an attached
  Transport never took, are unchanged: they write nothing under ADR-0004 and
  ADR-0006, and they resolve `undefined`.
- The bookkeeping ADR-0006 governs is untouched: which paths write an entry, and
  under which id, is still its rule, and this ADR reads the result of it rather
  than changing it.
- `subscribe` still resolves rather than re-throwing. A caller distinguishes the
  two outcomes by whether it received a subscription, not by a rejection, so
  nothing that awaits `subscribe` today changes shape.

## Consequences

- Every recorded stream can be unsubscribed from by the caller that asked for
  it, so an abandoned `sub` no longer leaks a stream for the life of the Socket.
- The invariant holds at hand-out time only. Under ADR-0004 a resubscribe the
  server refuses calls `forgetSubscription` and deletes an entry the caller still
  holds a handle for; `unsubscribe` on that handle then rejects, naming the id it
  found no subscription for. That is the same visible edge
  ADR-0011 describes for a second holder of a shared record, reached by a second
  route.
- A caller that treated a resolved value as proof the server acknowledged the
  stream is now wrong: a handle is also returned where the server never answered,
  and where no `sub` frame was composed at all. The distinction ADR-0006 draws —
  a recorded DDP subscription does not prove the server confirmed it — is now
  visible to callers rather than internal. A handle for an Offline sub names a
  stream that was never on the wire, and nothing in the Driver contract
  distinguishes it from one the server acknowledged.
- `Socket.resubscribeWhenRecorded`, behind `Driver.waitForNotifyUserMediaSubs`,
  counts a resubscribe as acknowledged from what `resubscribe` resolves. An
  abandoned or expired resubscribe now resolves a subscription rather than
  `undefined`, so the gate reads it as acknowledged where it previously did not.
  The poll on `subscriptions` was already ended by the entry ADR-0006 writes, so
  what changes is the gate's answer for that entry, not when it is asked.
- Two `subscribe` calls for one stream share one record under ADR-0011, and the
  handle is that record, so the first `unsubscribe` through either handle ends the
  stream for both.
