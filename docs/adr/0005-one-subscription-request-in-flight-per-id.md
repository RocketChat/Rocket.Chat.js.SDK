# ADR-0005: One subscription request in flight per DDP subscription id

**Status:** Accepted

**Succeeds:** ADR-0004

## Context

ADR-0004 left one question open: whether a `sub` may be sent for an id whose
`unsub` is still in flight, and what the server does when it is. Both halves are
answered here.

An `unsubscribe` that writes an `unsub` keeps its entry until the DDP response
arrives. `subscribeAll` re-sends every entry under its own id, and `login` calls
`subscribeAll`. A Login during that window therefore sends a `sub` carrying the
id of a DDP subscription that is still being unsubscribed. The reverse pairing
is reachable too: `resubscribe` re-sends an existing entry under its own id, and
`unsubscribe` can be called while that `sub` waits for its `ready`. Both
pairings are between frames on the wire. An `unsubscribe` on a Socket with no
attached Transport composes no frame at all — it forgets the entry and resolves
under ADR-0006 — so it opens no window, queues under no id, and is not one of
the requests this ADR orders.

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

The server does not behave badly. In Meteor's
`packages/ddp-server/livedata_server.js` — read at `devel`, and unchanged in
substance at `METEOR@2.16` and `METEOR@1.8.1` — `Session` takes one message from
a session at a time, through a single `inQueue` drained by one worker, and its
own design comment gives the reason: *"unsub needs to be ordered against sub"*.
The handlers are `Session.prototype.protocol_handlers.sub` and `.unsub`; the
names the issue used, `_livedata_sub` and `_livedata_unsub`, are not in the
source. `unsub` is synchronous — `_stopSubscription` deletes the id
from `_namedSubs` and sends `nosub` before the handler returns — so a following
`sub` for that id finds nothing registered, does not take the idempotency early
return that would otherwise drop it in silence, and is answered with its own
`ready`. Only `ping`, `pong` and `disconnect` bypass the queue.

## Decision

One `sub` or `unsub` is in flight per DDP subscription id. A second waits for
the first to have its DDP response before its own frame is written.

- The wait is `queueSubscriptionRequest` on `DDPSubscriptions`, and `subscribe` and
  `unsubscribe` are its only callers. It holds one promise per id.
- Every subscription request has an id and queues under it. The id of a `sub` is
  derived from the stream (ADR-0011), so a first-time `subscribe` knows its id
  before it sends. Nothing is delayed by this: `queueSubscriptionRequest` runs
  the request synchronously when no promise is registered under the id, and
  different streams derive different ids, so no request waits that did not wait
  before.
- The wait ends on the response, whether it succeeded or carried a DDP error.
  Neither outcome is examined here — what a rejection does to the entry stays
  with ADR-0004.
- Nothing here bounds the wait but the request before it. The chain adds no
  Deadline and no bookkeeping about the connection of its own: a subscription
  request is a send, so it carries the Deadline ADR-0014 gives every send, and a
  send cannot outlive the connection it was issued on. Every request settles, and
  a chain always drains.
- A request registers itself when it is queued, not when its frame is written. A
  third request must find the second and wait behind it. If the entry were
  written only at the moment the frame goes out, the second and the third would
  both find the first, both wait on it, and both be released together — two
  requests under one id, which is the fault this ADR removes.

## Consequences

- Serialising is enough. Matching a DDP response against the DDP message it
  answers is not needed, and would not be sufficient on its own: a `nosub`
  answers a refused `sub` as well as an `unsub`, so the two stay ambiguous
  whenever both are in flight. Keeping one on the wire removes the ambiguity
  rather than resolving it.
- Two `sub`s for one stream carry one id and serialise on this rule, and the
  second finds the record the first wrote and shares it rather than sending
  (ADR-0011). Two `unsub`s that both reach the wire under one id serialise on the
  same rule. Neither was known to lose data, but both left a second response with
  no listener. Where the first `unsubscribe` had no attached Transport it has
  already forgotten the entry, so the second finds no DDP subscription to end and
  rejects rather than queueing behind anything.
- A Login that runs while an `unsub` is in flight re-establishes that stream
  after the server has ended it, rather than racing it. The end state is the one
  the entry describes.
- `send` still correlates by id alone, and a listener stranded by a scheduled
  `reopen` is still able to catch a later response under the same id. That is
  the same class of fault and it is not fixed here. Separate issues track it,
  along with a `ready` that names more than one subscription id.
- A queued request is issued when it is released, not when it is queued, so it
  is written on whatever connection is current at that moment. A `sub` released
  onto a connection that has not logged in yet is refused, `subscribe` resolves
  `undefined`, and the entry it would have written is already there and
  survives. The next Login's `subscribeAll` re-establishes the stream.
- A request that a Reopen abandons is not re-sent by the queue. The queue holds
  the order of requests and nothing else. `subscribeAll` re-establishes the DDP
  subscriptions after a Login, and that stays the one path that re-sends.
- No single place on `Socket` owns what happens to work in flight when the
  connection changes. This ADR removed one of the places that held a piece of
  it, and ADR-0014 gathered the rest: `DDPRequests.abandonAll` ends every
  written wait on the ownership change, and `recoverAndKeepPinging` decides
  which failures still ask for a Reopen.
