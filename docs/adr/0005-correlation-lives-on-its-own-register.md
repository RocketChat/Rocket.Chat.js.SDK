# ADR-0005: Correlation lives on its own register, not the emitter

**Status:** Accepted

## Context

ADR-0001, ADR-0003 and ADR-0004 all settle what a caller of `send` receives and
what the Socket does with its bookkeeping when a wait ends. None of them settle
*how* a DDP response finds the caller waiting for it.

It found the caller through the event emitter. `send` attached a `once`
listener named after the request id, or after `pong` / `connected` for the two
requests the protocol sends without one. `onMessage` emitted three names off
every incoming DDP message: `data.collection`, `data.msg` and `data.id`. Two
listeners in the Socket constructor translated a `result` and a `ready` into a
further emit on the correlation key.

That put four unrelated kinds of name in one keyspace: stream names, DDP message
names, correlation keys, and document ids. The last of those is the problem. An
`added`, `changed` or `removed` DDP message carries the document's own id, and
`onMessage` emitted it as though it were a correlation key. A document whose id
matched an in-flight request settled that request with a document.

It also spread the mechanism out. Nothing in `send` said which incoming DDP
messages could answer it; that lived in a constructor listener 250 lines away,
in a substring regex, and in an implicit fallthrough to `data.id`.

## Decision

Correlation gets its own register, `PendingResponses`, keyed by correlation key.
`send` registers a waiter on it. `onMessage` names the five DDP responses that
settle one — `result`, `ready`, `nosub`, `connected`, `pong` — and delivers to
it. Every other incoming DDP message reaches its consumers through the emitter
alone and settles nothing.

The emitter keeps exactly what consumers subscribe to: collection names and DDP
message names. `onMessage` no longer emits `data.id`.

A Reopen abandons every waiter through one listener on the Socket, rather than
each send registering and removing its own.

## Consequences

A document id can no longer settle a Method call, and the set of DDP responses
is stated in one place.

A correlation key can carry more than one waiter — a resubscribe racing
`subscribeAll` puts two sends on one id — and all of them are settled by the
one response, as the emitter did.

A `result` reaches its caller once rather than twice. The double delivery only
ever worked because `once` swallowed the second, and it was pinned as a quirk.

A waiter abandoned by a Reopen is dropped from the register. The emitter
listener it replaced stayed attached for the life of the Socket.

Delivery to a waiter now happens after the collection and `msg` consumers of the
same DDP message, where the constructor listeners used to put it first. Callers
settle on a microtask either way.

`PendingResponses` is exported and `Socket.pending` is public, so the register is
testable on its own rather than only through a socket and a clock. This is the
interface being the test surface, not test-only code: `Socket.subscriptions` is
public on the same grounds.
