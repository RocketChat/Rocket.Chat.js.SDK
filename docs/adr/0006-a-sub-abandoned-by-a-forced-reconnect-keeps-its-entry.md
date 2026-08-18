# ADR-0006: A `sub` abandoned by a forced reconnect keeps its entry

**Status:** Accepted

**Succeeds:** ADR-0005

## Context

ADR-0004 settled which rejections forget a DDP subscription, and left one
question open: when a `sub` response is abandoned rather than refused, which
loss is preferable — the orphaned stream, or a provisional entry that risks a
phantom.

The question was posed on the assumption that the reconnect leaves the previous
socket open, so an abandoned `sub` the server had already processed would go on
streaming under a name the SDK did not hold. That assumption does not hold on
the ordinary path. `createConnection` detaches the previous socket's four
handlers and closes it with the user-disconnect code before it installs the
replacement, and a DDP subscription lives on its connection.

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
- Either write is conditional on the Socket still holding a connection.
  `rememberSubscription` returns early when it holds none, because an entry is an
  instruction to a later Login on this Socket, and a Socket with no connection has
  nothing to instruct.
- A `sub` that was never written to the Transport leaves nothing behind. A failed
  write, and a send that expired waiting for the connection to open, are both
  cases where the server cannot have acted on the request. The entry is written
  only when the DDP message was written to the Transport and no answer came.
- Written to the Transport is not the same as delivered. A send on a Socket that
  is Transport open while the Liveness chain has lapsed writes a DDP message the
  peer may never read, and that write keeps an entry. The entry is an
  instruction to establish the stream, not a claim the server holds it, so a
  stream the server never saw is established by the re-subscribe rather than
  duplicated by it.
- That line is drawn by where the rejection comes from, not by which event ended
  the connection. `send` abandons a wait in two places: before the frame is
  written, where it throws a bare `AbandonedWait`, and after, from the listeners
  on `disconnected`, `connecting` and `close`, where it rejects with an
  `AbandonedRequest`. A forced reconnect is the common case, and it installs the
  replacement connection, so the entry is written. `Socket.close()` is the same
  loss and keeps nothing: it drops the Transport and forgets every entry as it
  goes, so the guard above finds no connection to instruct. ADR-0009 settles that
  path.
- The rejection carries the id `send` minted for the wait. `send` mints it inside
  its promise executor, after the wait on `open`, so no caller can compute it in
  advance without racing another send for the same number. It names the request
  only for the sends whose frame carries an id — `method` and `sub`; a `connect`
  or a `ping` is minted an id too, but its frame goes out without one and no
  caller reads it. `subscribe` is the only reader, and it reads it to name a `sub`
  the server never answered.
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
- An entry may name a `sub` the server never received — if the forced reconnect
  abandoned the wait before the server read the frame. `subscribeAll` re-sends it
  and the entry becomes real. This is the phantom the question weighed, and it
  costs one redundant `sub` frame at the next Login.
- `unsubscribeAll` acts on these entries and sends `unsub` frames for them, on
  the terms ADR-0004 sets. `Socket.close()` forgets them all and sends nothing,
  under ADR-0009.
- `Socket.resubscribeWhenRecorded`, behind `Driver.waitForNotifyUserMediaSubs`,
  polls `subscriptions` for the two media entries, and an entry written on an
  abandoned `sub` ends that poll instead of keeping it waiting. Readiness itself
  is unchanged: the poll only decides when to re-send, and the gate resolves on
  whether that resubscribe was acknowledged. An abandoned one resolves
  `undefined`, which the gate counts as unacknowledged.
- `unsubscribe` already keeps its entry on the same class of rejection, so a
  forced reconnect that abandons an `unsub` and a `sub` together leaves both, and
  `subscribeAll` re-sends the `sub` at the next Login under an id whose `unsub`
  never got an answer. This ADR makes that pairing, the case ADR-0005
  serialises, more frequent.
- Under ADR-0004 `subscribe` forgets an entry whose resubscribe the server
  refuses, so an entry a successful `sub` wrote does not survive a later
  refusal.
- A Deadline that expires also carries an id: the one ADR-0003 gives the DDP
  response, which ends the wait when the connection stays up and the server
  never answers. It falls on the same side of the line as an abandoned one — the
  DDP message was written to the Transport and no answer came — so a `sub` that
  expires keeps its entry, and `subscribe` tests for it as positively as it tests
  for an `AbandonedRequest`. It is an `ExpiredWait`, not an `AbandonedWait`,
  because no connection went away — but `subscribe` asks nothing for a Reopen
  either way: it swallows the rejection to `undefined`. Where that decision is
  made, in `ping` and in the retry inside `reopen`, an expired wait does Reopen
  and an abandoned one does not.
