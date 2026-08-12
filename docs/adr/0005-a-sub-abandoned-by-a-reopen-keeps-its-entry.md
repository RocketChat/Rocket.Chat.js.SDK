# ADR-0005: A `sub` abandoned by a Reopen keeps its entry

**Status:** Accepted

**Succeeds:** ADR-0004

## Context

ADR-0004 settled which rejections forget a DDP subscription, and left one
question open: when a `sub` response is abandoned rather than refused, which
loss is preferable — the orphaned stream, or a provisional entry that risks a
phantom.

The question was posed on the assumption that a Reopen leaves the previous
socket open, so an abandoned `sub` the server had already processed would go on
streaming under a name the SDK no longer held. That assumption no longer holds.
`createConnection` detaches the previous socket's four handlers and closes it
with the user-disconnect code before it installs the replacement. A DDP
subscription lives on its connection, so an abandoned `sub` streams nothing once
the Reopen has run.

What survives is the other half of the loss, and it is silent. `subscribe`
swallows its own rejection and resolves `undefined`. With no entry written,
`subscribeAll` sends nothing for that stream at the next Login. A consuming app
that asked for a stream never receives it again for the life of the Socket, and
nothing anywhere reports a failure.

So the choice is not between an orphaned stream and a phantom. It is between a
silently dropped stream and a phantom, and the phantom is the cheaper of the
two. A phantom entry is self-correcting: `subscribeAll` re-sends it, and the
server either establishes the stream the app asked for or answers `nosub`.

ADR-0004 already defines an entry as an instruction to re-establish a stream,
not a record of a stream that existed. Read against that definition, the write
rule should turn on whether the server refused, not on whether the server
answered. That also makes `subscribe` symmetric with `unsubscribe`, which keeps
its entry on exactly this class of rejection.

## Decision

The server's answer decides; silence keeps the instruction.

- `subscribe` writes its entry on the `ready` DDP response, under the id the
  server confirmed, and also when a Reopen abandoned the wait, under the id the
  request was sent with. A `sub` the server refused with a `nosub` carrying a DDP
  error still leaves nothing behind.
- A `sub` that never reached the wire leaves nothing behind. A failed write, and
  a send that expired waiting for the connection to open, are both cases where
  the server cannot have acted on the request. The entry is written only when the
  frame went out and no answer came.
- The rejection that a Reopen originates carries the id the request was sent
  under, as `IAbandonedRequest`. `send` mints that id inside its promise
  executor, after the wait on `open`, so no caller can compute it in advance
  without racing another send for the same number. Carrying it on the rejection
  is what lets `subscribe` name a request the server never answered.
- `IAbandonedRequest` is a plain `Error` with one added field, so it remains not
  a `DDPError` and ADR-0003 is unchanged. `subscribe` discriminates the two the
  same way `unsubscribe` does, with `instanceof DDPError`.
- `subscribe` still resolves `undefined` on every failure. This ADR governs the
  bookkeeping only. What a caller receives is unchanged.

## Consequences

- A stream abandoned by a Reopen is re-established at the next Login, under the
  id it was first sent with, so the server is never asked for the same stream
  twice under two names.
- An entry may now name a `sub` the server never received — if the Reopen
  abandoned the wait before the server read the frame. `subscribeAll` re-sends
  it and the entry becomes real. This is the phantom the question weighed, and
  it costs one redundant `sub` frame at the next Login.
- `unsubscribeAll` and `close` now have entries to act on that they did not have
  before, and send `unsub` frames for them. Both already tolerate a server that
  refuses: `unsubscribeAll` catches each failure, and `close` forgets everything
  regardless.
- ADR-0004's remaining open question is untouched. Whether a `sub` may be sent
  for an id whose `unsub` is still in flight is still not settled, and the
  behaviour of the server in that case is still not known.
- The consequence ADR-0004 records about `subscribe` never removing a stale
  entry is also untouched. `subscribe` remains a pure writer, so an entry that a
  successful `sub` wrote survives a later refusal.
