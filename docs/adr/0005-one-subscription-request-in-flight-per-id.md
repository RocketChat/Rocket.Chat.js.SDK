# ADR-0005: One subscription request in flight per DDP subscription id

**Status:** Accepted

**Succeeds:** ADR-0004

## Context

ADR-0004 left one question open: whether a `sub` may be sent for an id whose
`unsub` is still in flight, and what the server does when it is. Both halves are
answered here.

`unsubscribe` keeps its entry until the DDP response arrives. `subscribeAll`
re-sends every entry under its own id, and `login` calls `subscribeAll`. A
Login during that window therefore sends a `sub` carrying the id of a DDP
subscription that is still being unsubscribed. The reverse pairing is reachable
too: `subscribe` re-sends an existing entry under its own id, and `unsubscribe`
can be called while that `sub` waits for its `ready`.

`send` matches a DDP response to its request by id alone. It registers one
listener under the id and settles on the first message that carries it, without
reading which DDP message it is. Two requests in flight under one id therefore
share every response, and the first response settles both:

- The `nosub` that ends the DDP subscription also settles the `sub`. That frame
  carries no `subs`, so `subscribe` resolves `undefined` and writes no entry.
  The server's `ready` then arrives with no listener left. The SDK holds no name
  for a stream that is running.
- The `ready` that establishes the DDP subscription also settles the `unsub`.
  The caller is told the unsubscribe succeeded, and `unsubscribe` forgets the
  entry, at the moment the server confirmed the stream is live.

Both outcomes break the assumption ADR-0004 rests on, that a DDP response tells
the truth about what the server holds. Neither depends on the server behaving
badly.

The server does not behave badly. Meteor's `Session` takes one message from a
session at a time, through a single queue drained by one worker, and its own
design comment gives the reason: `unsub` needs to be ordered against `sub`. The
`unsub` handler is synchronous — it removes the id and sends `nosub` before it
returns — so a following `sub` for that id finds nothing registered, does not
take the idempotency early return that would silently drop it, and is answered
with its own `ready`. Only `ping`, `pong` and `disconnect` bypass the queue.

## Decision

One `sub` or `unsub` is in flight per DDP subscription id. A second waits for
the first to have its DDP response before its own frame is written.

- The wait is `queueSubscriptionRequest` on `Socket`, and `subscribe` and
  `unsubscribe` are its only callers. It holds one promise per id.
- A request with no id does not queue. A first-time `subscribe` has no id to
  collide on, and `send` writes its frame synchronously on an open connection,
  so a hop through the queue would delay it by a turn of the microtask queue for
  no gain.
- The wait ends on the response, whether it succeeded or carried a DDP error.
  Neither outcome is examined here — what a rejection does to the entry stays
  with ADR-0004.
- The queue is bounded by the connection, not by a Deadline. `createConnection`
  drops it. A request left pending by a dropped socket would otherwise hold its
  id for the life of the Socket, because only `reopenNow` rejects in-flight
  sends and the scheduled `reopen` leaves them waiting.

## Consequences

- Serialising is enough. Matching a DDP response against the DDP message it
  answers is not needed, and would not be sufficient on its own: a `nosub`
  answers a refused `sub` as well as an `unsub`, so the two stay ambiguous
  whenever both are in flight. Keeping one on the wire removes the ambiguity
  rather than resolving it.
- Two `sub`s under one id, and two `unsub`s under one id, serialise on the same
  rule. Neither was known to lose data, but both left a second response with no
  listener.
- A Login that runs while an `unsub` is in flight now re-establishes that stream
  after the server has ended it, rather than racing it. The end state is the one
  the entry describes.
- `send` still correlates by id alone, and a listener stranded by a scheduled
  `reopen` is still able to catch a later response under the same id. That is
  the same class of fault and it is not fixed here. Separate issues track it,
  along with a `ready` that names more than one subscription id.
