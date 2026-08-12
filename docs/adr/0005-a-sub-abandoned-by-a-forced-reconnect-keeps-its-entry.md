# ADR-0005: A `sub` abandoned by a forced reconnect keeps its entry

**Status:** Accepted

**Succeeds:** ADR-0004

## Context

ADR-0004 settled which rejections forget a DDP subscription, and left one
question open: when a `sub` response is abandoned rather than refused, which
loss is preferable — the orphaned stream, or a provisional entry that risks a
phantom.

The question was posed on the assumption that the reconnect leaves the previous
socket open, so an abandoned `sub` the server had already processed would go on
streaming under a name the SDK no longer held. That assumption no longer
holds on the ordinary path. `createConnection` detaches the previous socket's
four handlers and closes it with the user-disconnect code before it installs
the replacement, and a DDP subscription lives on its connection.

It is not unconditional. The teardown sits after the `new WebSocket(...)` call,
so a constructor that throws returns early and leaves the previous socket
attached and open, with `reopenNow` swallowing the failure. The orphaned stream
the question describes is therefore rare rather than impossible — and in exactly
that case an entry is strictly better than none, because it is the only thing
that can name the stream.

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
  server confirmed, and also when the connection ended before the answer came,
  under the id the request was sent with. A `sub` the server refused with a
  `nosub` carrying a DDP error still leaves nothing behind.
- A `sub` that never reached the wire leaves nothing behind. A failed write, and
  a send that expired waiting for the connection to open, are both cases where
  the server cannot have acted on the request. The entry is written only when
  the frame went out and no answer came.
- That line is drawn by where the rejection comes from, not by which event ended
  the connection. `send` abandons a wait in two places: before the frame is
  written, where it throws a bare `AbandonedWait`, and after, from the listeners
  on `disconnected`, `connecting` and `close`, where it rejects with an
  `AbandonedRequest`. Only the second kind carries an id, so only the second kind
  can leave an entry. A forced reconnect is the common case; a socket that closes
  under an unanswered `sub` is the same loss and keeps its entry too.
- The rejection carries the id the request was sent under. `send` mints that id
  inside its promise executor, after the wait on `open`, so no caller can compute
  it in advance without racing another send for the same number. Carrying it on
  the rejection is what lets `subscribe` name a request the server never
  answered.
- `AbandonedRequest` marks provenance in the value, as ADR-0004 has `DDPError`
  do, and `subscribe` tests for it positively with `instanceof`. Testing instead
  for the absence of a `DDPError` plus the presence of an `id` would write an
  entry for any future rejection that happened to carry one.
- `AbandonedRequest` is an `AbandonedWait`, so it stays outside the retry that
  `reopenUnlessAbandoned` decides. It is not a `DDPError`, so the ADR-0001
  discriminator is unchanged, and it carries no server reason, so ADR-0003 is
  unchanged. What it adds over the bare `AbandonedWait` is the id, and nothing
  else.
- `subscribe` still resolves `undefined` on every failure. This ADR governs the
  bookkeeping only. What a caller receives is unchanged.

## Consequences

- A stream abandoned by a forced reconnect is re-established at the next Login,
  under the id it was first sent with, so the server is never asked for the same
  stream twice under two names.
- An entry may now name a `sub` the server never received — if the forced
  reconnect abandoned the wait before the server read the frame.
  `subscribeAll` re-sends it and the entry becomes real. This is the phantom the
  question weighed, and it costs one redundant `sub` frame at the next Login.
- `unsubscribeAll` and `close` now have entries to act on that they did not have
  before, and send `unsub` frames for them. Both already tolerate a server that
  refuses: `unsubscribeAll` catches each failure, and `close` forgets everything
  regardless.
- `DDPDriver.waitForNotifyUserMediaSubs` polls `subscriptions` for the two media
  entries and treats their presence as readiness. An entry written on an
  abandoned `sub` now satisfies that poll where it would previously have kept
  waiting, so the readiness it reports can stand on a `sub` the server never
  confirmed. That is the same trade this ADR makes everywhere else — the entry
  names a stream the server probably has — but this reader turns it into a
  signal rather than an instruction, and is the one place worth revisiting if
  the signal proves too eager.
- ADR-0004's remaining open question is untouched: whether a `sub` may be sent
  for an id whose `unsub` is still in flight is still not settled, and the
  behaviour of the server in that case is still not known. This ADR does make
  the case more frequent. `unsubscribe` already keeps its entry on the same
  class of rejection, so a forced reconnect that abandons an `unsub` and a `sub`
  together now leaves both, and `subscribeAll` re-sends the `sub` at the next
  Login under an id whose `unsub` never got an answer.
- The consequence ADR-0004 records about `subscribe` never removing a stale
  entry is also untouched. `subscribe` remains a pure writer, so an entry that a
  successful `sub` wrote survives a later refusal.
