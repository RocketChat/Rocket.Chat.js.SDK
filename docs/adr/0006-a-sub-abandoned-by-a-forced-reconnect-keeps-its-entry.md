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
the ordinary path. A forced attempt constructs its Transport first and only then
releases the predecessor, unhooking its handlers and closing it with the
user-disconnect code, and a DDP subscription lives on its connection.

It is not unconditional. The construction comes first so that a constructor that
throws leaves the Socket the connection it already had, which means that failure
is the one case where the predecessor stays attached and open. The orphaned
stream the question describes is therefore rare rather than impossible, and in
exactly that case an entry is strictly better than none, because it is the only
thing that can name the stream.

What survives is the other half of the loss, and it is silent. `subscribe`
swallows its own rejection and resolves `undefined`. With no entry written,
`subscribeAll` sends nothing for that stream at the next Login. A consuming app
that asked for a stream never receives it again for the life of the Socket, and
nothing anywhere reports a failure.

So the choice is not between an orphaned stream and a phantom. It is between a
silently dropped stream and a phantom, and the phantom is the cheaper of the
two. A phantom entry is self-correcting: `subscribeAll` re-sends it, and the
server either establishes the stream the app asked for or answers `nosub`.

The same reasoning reaches further than the abandoned `sub` it was raised for. A
`subscribe` made while the Socket holds no attached Transport had nothing to
write on, so it dropped the stream in exactly the silent way described above, on
the one occasion a consuming app is most likely to ask: a mobile app returning
to the foreground, before the connection it was suspended with has been
replaced. The Socket has no connection to lose the request on, and no server
answer is pending, so nothing about the entry is provisional — it is purely the
instruction, waiting for a Transport.

ADR-0004 already defines an entry as an instruction to re-establish a stream,
not a record of a stream that existed. Read against that definition, the write
rule should turn on whether the server refused, not on whether the server
answered. That also makes `subscribe` symmetric with `unsubscribe`, which keeps
its entry on exactly this class of rejection.

## Decision

An entry is written when the Socket held no attached Transport at the moment of
the send. Where a Transport was attached, the server's answer decides, and
silence keeps the instruction.

### No attached Transport

- A `subscribe` on a Socket that holds no attached Transport composes no `sub`
  frame at all. It writes the entry and resolves it, and `subscribeAll` issues
  the `sub` once a Transport is attached. The glossary calls that entry an
  Offline sub.
- The predicate reads whether a Transport is attached, and nothing weaker. It is
  not a liveness question and not a Transport-open one. Widening it either way
  reverses the expired-wait rule: a send on an attached Transport that is not
  open, or is open with the Liveness chain lapsed, would stop reaching the wire
  and start recording without sending.
- The Socket itself is unchanged: `send` still refuses to write with no attached
  Transport, and the subscription path does not reach `send` at all when there
  is none. The entry it writes is the instruction, and `subscribeAll` is what
  issues it.
- The expired-wait case and the no-Transport case are two cases with opposite
  outcomes, not one "no usable connection" case: a send that expired waiting for
  the connection to open had a Transport to wait on, so it leaves no entry.
- A Close is excluded. A Socket a Close owns has no Transport either, and it is
  the one loss that leaves nothing to instruct, so a `subscribe` there records
  nothing. That is the same rule the generation guard below draws, read at the
  moment of the send rather than at the moment of the write.

### An answer that never came

- `subscribe` writes its entry on the `ready` DDP response, under the id the
  server confirmed, and also when the connection ended before the answer came,
  under the id the request was sent with. A `sub` the server refused with a
  `nosub` carrying a DDP error still leaves nothing behind.
- Either write is conditional on no Close having taken the Socket since the
  request went out. `sendSubscription` reads how many Closes the Socket has
  taken before it sends, and `rememberSubscription` records only if that count
  has not moved. An entry is an instruction to a later Login on this Socket, and
  a Close is the one loss that leaves nothing to instruct: ADR-0015 forgets every
  entry and leaves the Socket Idle with no connection.
- The condition is a generation and not a current-state question. Both of the
  obvious current-state readings reverse this ADR, so the count is worth the
  field it costs.
- Asking whether a Transport is attached is not close-specific, so it cannot be
  the guard here. A failed or cancelled attempt detaches its Transport and drops
  the reference, so a forced Reopen that abandons an in-flight `sub` and then
  fails would record nothing, and that is exactly the case this ADR exists for.
  It also never answers the question a Reopen raises: `attachTransport` installs
  the replacement before it releases the predecessor, so a Reopen leaves the
  Socket holding a connection by the time any rejection is delivered.
- Asking whether a Close owns the Socket right now is close-specific and too
  short-lived. A `sub` a Close abandoned settles a few microtasks after the
  Close has released ownership, so the boolean reads false at the moment the
  entry would be recorded and the entry is written back after
  `forgetAllSubscriptions` has already run. Only a count that never goes down
  answers correctly for a request that settles later than the event which ended
  it.
- A `sub` that reached the Transport and was not written leaves nothing behind. A
  failed write, and a send that expired waiting for the connection to open, are
  both cases where the server cannot have acted on the request and a Transport
  was there to write to.
- Written to the Transport is not the same as delivered. A send on a Socket that
  is Transport open while the Liveness chain has lapsed writes a DDP message the
  peer may never read, and that write keeps an entry. The entry is an
  instruction to establish the stream, not a claim the server holds it, so a
  stream the server never saw is established by the re-subscribe rather than
  duplicated by it.
- That line is drawn by where the rejection comes from, not by what announced
  the end of the connection. `send` abandons a wait in two places: before the
  frame is written, where it throws a bare `AbandonedWait`, and after, from
  `DDPRequests.abandonAll` on the ownership change itself, where it rejects with
  an `AbandonedRequest`. Under ADR-0014 that change settles the wait rather than
  waiting for a lifecycle event to carry it, so the entry does not depend on an
  emit reaching a listener. A forced replacement and an unexpected drop are both
  cases where no Close has taken the Socket, so the entry is written.
- The rejection carries the id the wait went out under. For a `method` that is
  the id `send` mints inside its promise executor, after the wait on `open`, so
  no caller can compute it in advance without racing another send for the same
  number. For a `sub` it is the caller's own: derived from the stream before the
  send (ADR-0011), which only strengthens the rule below — the entry is written
  under the id the frame carried, and the caller knew it all along. It names the request
  only for the sends whose frame carries an id — `method` and `sub`; a `connect`
  or a `ping` is minted an id too, but its frame goes out without one and no
  caller reads it. `subscribe` is the only reader, and it reads it to name a `sub`
  the server never answered.
- `AbandonedRequest` marks provenance in the value, as ADR-0004 has `DDPError`
  do, and `subscribe` tests for it positively with `instanceof`. Testing instead
  for the absence of a `DDPError` plus the presence of an `id` would write an
  entry for any future rejection that happened to carry one.
- `AbandonedRequest` is an `AbandonedWait`, so it stays outside the retry that
  `recoverAndKeepPinging` decides. It is not a `DDPError`, so the ADR-0001
  discriminator is unchanged, and it carries no server reason, so ADR-0014 is
  unchanged. What it adds over the bare `AbandonedWait` is the id, and nothing
  else.
- `subscribe` resolves with the entry this ADR writes, and `undefined` where it
  writes none. This ADR governs the bookkeeping; ADR-0012 reads its result to
  decide what a caller receives.

## Consequences

- A stream abandoned by a forced reconnect is re-established at the next Login,
  under the id it was first sent with, so the server is never asked for the same
  stream twice under two names.
- An entry may name a `sub` the server never received — if the forced reconnect
  abandoned the wait before the server read the frame, or if no `sub` frame was
  ever composed because no Transport was attached. `subscribeAll` re-sends it
  and the entry becomes real. This is the phantom the question weighed, and it
  costs one redundant `sub` frame at the next Login.
- A consuming app that subscribes across a suspend and resume keeps its streams.
  What it does not get is any signal that the stream is not yet on the wire: an
  Offline sub is indistinguishable, from outside the SDK, from one the server
  acknowledged.
- `unsubscribeAll` acts on these entries and sends `unsub` frames for them, on
  the terms ADR-0004 sets. `Socket.close()` forgets them all and sends nothing,
  under ADR-0015.
- An `unsubscribe` on a Socket with no attached Transport is the mirror of the
  Offline sub: the entry is the whole of what exists, so forgetting it ends the
  DDP subscription outright and the caller resolves without a frame being
  composed. Nothing is left for `subscribeAll` to re-establish, and no `unsub`
  enters the wire, so the pairings ADR-0005 serialises are not among the cases it
  reaches.
- `Socket.resubscribeWhenRecorded`, behind `Driver.waitForNotifyUserMediaSubs`,
  polls `subscriptions` for the two media entries, and an entry written on an
  abandoned `sub` ends that poll instead of keeping it waiting. Readiness itself
  is unchanged: the poll only decides when to re-send, and the gate resolves on
  whether that resubscribe was acknowledged, which ADR-0012 settles for an
  abandoned one. An Offline sub would end the poll on an entry no `sub` frame
  backs, so the gate does not attempt a resubscribe at all while no Transport is
  attached, and waits for one instead of reporting ready on its own instruction.
- `unsubscribe` already keeps its entry on the same class of rejection, so a
  forced reconnect that abandons an `unsub` and a `sub` together leaves both, and
  `subscribeAll` re-sends the `sub` at the next Login under an id whose `unsub`
  never got an answer. This ADR makes that pairing, the case ADR-0005
  serialises, more frequent.
- Under ADR-0004 `subscribe` forgets an entry whose resubscribe the server
  refuses, so an entry a successful `sub` wrote does not survive a later
  refusal.
- A Deadline that expires also carries an id: the one ADR-0014 gives the DDP
  response, which ends the wait when the connection stays up and the server
  never answers. It falls on the same side of the line as an abandoned one — the
  DDP message was written to the Transport and no answer came — so a `sub` that
  expires keeps its entry, and `subscribe` tests for it as positively as it tests
  for an `AbandonedRequest`. It is an `ExpiredWait`, not an `AbandonedWait`,
  because no connection went away — but `subscribe` asks nothing for a Reopen
  either way: it swallows the rejection and resolves with the entry. Where that
  decision is made, in `ping` and in the retry inside `reopen`, an expired wait
  does Reopen and an abandoned one does not.
