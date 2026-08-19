# ADR-0011: One DDP subscription per stream

**Status:** Accepted

**Succeeds:** ADR-0010

## Context

`Socket.subscriptions` is keyed by DDP subscription id, and ADR-0004 defines an
entry as an instruction to re-establish that stream at the next Login.
`subscribeAll` replays every entry under its recorded id, and `login` calls
`subscribeAll`. Nothing in that arrangement says how many entries one stream may
have.

`subscribe(name, params)` called with no explicit id minted a new id every time,
so it always got one. A caller asking twice for the same stream left two entries
that named it, and nothing collapsed them.

A Reopen compounds this. A Reopen forgets nothing, by ADR-0004, so the records
survive it. The Login that follows replays each of them, and a consuming app
that also re-subscribes as part of its own post-login flow adds one more record
per stream per cycle. Measured on an Android client over five consecutive
reopens, `subscriptions` grew 18 → 23 → 28 → 34 → 40, and a single
`subscribeAll` then sent five `sub` frames each for `public-settings-changed`,
`permissions-changed`, `Users:NameChanged`, `updateAvatar` and `stream-roles/roles`.
The cost is one redundant `sub` per surplus record per Login, and one callback
invocation per surplus record per incoming event. The same defect was reported
years earlier from the bot side, as a message handler firing once per record.

Collapsing the records raises four questions the old behaviour never had to
answer. What counts as the same stream. Who owns the one DDP subscription two
callers now share. What happens to the second caller's callback, which under the
old behaviour rode on its own entry. And which entries are fit to be reused at
all, since minting a fresh id made every caller independent of the state the
recorded one was in.

`findSubscriptions` already exists and is already how `resubscribeWhenRecorded`
identifies a stream, so stream identity is an established concept here — but it
matches params by prefix, so a call with `params: []` matches every record of
that name. Used as-is for this it would treat two distinct `stream-notify-logged`
streams as one.

There is also a second writer. ADR-0006 has `subscribe` write an entry when the
connection ended, or the Deadline rang, before the answer came. That write
happens on the rejection path, past any check made when the call was received, so
two concurrent subscribes for one stream that are both abandoned would each
write a record however carefully the entry point was guarded. That write also
resolves `undefined` to its caller, so an entry exists that no caller was ever
handed.

## Decision

One stream is one DDP subscription with one entry, and the callers that were
handed it are counted. An explicit id is not part of this rule.

- `subscribe` reuses when it is given no id. A caller that names one is on the
  resume path — `subscribeAll` and `resubscribeWhenRecorded` re-send a recorded
  stream under the id it already has — and that path bypasses the reuse entirely
  and still sends under that id. Re-sending is what those callers are for; an
  entry they find is the reason they are sending, not a reason to stop.
- Stream identity is the serialised form of the name and the full params. The
  params must match in length as well as in order, which the prefix match
  `findSubscriptions` makes does not require. Object keys are sorted as they are
  serialised, so the same params written in a different key order read as one
  stream; callers rebuild their params for every request, so identity has to be
  by value rather than by reference. Params no serialiser can read — circular,
  or holding a `BigInt` — yield no key at all, and `subscribe` then takes the
  non-shared path and sends as it did before rather than throwing. The exact
  match is the private `findSubscription`; `findSubscriptions` keeps its prefix
  semantics for its own callers.
- A subscribe still waiting for its answer counts as much as a recorded one. The
  in-flight request is held per stream, and a second caller arriving during that
  window is given a share of that one request rather than sending its own. This
  is what keeps the ADR-0006 write path from leaking: two concurrent subscribes
  for one stream are one request, so the rejection path can only write one entry.
  When that shared request resolves `undefined` — a failure, or the abandoned
  write that produced an entry rather than a `ready` — the second caller falls
  back to whatever entry is now recorded, and shares that.
- An entry whose `unsub` is on the wire is not reusable. `unsubscribe` marks the
  id as ending before it sends, `findSubscription` skips a marked id, and the
  mark is dropped when the entry is forgotten, or when the `unsub` was rejected
  by a rejection the SDK originated and the entry survives under ADR-0004. The
  holder count goes with the mark on that second path: the caller that sent the
  failed `unsub` has let go, so leaving its count behind would give the entry a
  holder that no longer exists, and the next caller's `unsubscribe` would only
  count that phantom down and send nothing.
  A caller sharing a request still in flight is answered by looking the stream up
  again once it settles, rather than by the object the request resolved, so the
  mark and the entry are read on one rule whichever branch the caller took.
  Without the mark, the pairing ADR-0005 serialises — a `subscribe` for a stream
  whose `unsub` is still in flight — would hand the new caller a subscription for
  a stream the server is about to end, with no `sub` ever sent. That is a
  regression against the old behaviour, where that caller minted a fresh id and
  got a live stream. Leaving a room and rejoining it is the ordinary path that
  reaches it.
- Holders are counted per DDP subscription id, and a count is incremented only
  where a caller is actually handed a subscription. `rememberSubscription`
  touches no count: it writes the instruction, and whether anyone holds it is a
  separate fact. So counts start absent, and the entry ADR-0006 writes for an
  abandoned or expired `sub`, whose `subscribe` resolves `undefined`, has no
  holder at all.
- `unsubscribe` reads an absent count as one. That is what keeps a zero-holder
  entry unsubscribable: the ADR-0006 write leaves an entry `unsubscribeAll` and
  the consuming app can both still name, and a count read as zero would make the
  `unsub` unreachable. It decrements and resolves `undefined` without sending
  anything while any holder remains, and sends the `unsub` only for the last one.
  `forgetSubscription` drops the count with the entry, so the two are never out
  of step.
- `unsubscribeAll` drops the count for each id before unsubscribing it. It is a
  teardown of everything, so it ends each stream whoever else holds it. This is
  what keeps ADR-0004's statement that `unsubscribeAll` sends `unsub` frames
  true once streams are shared, and with it the `logout` that awaits it.
- The count lives beside `subscriptions` rather than on the entry, because it
  belongs to this Socket's bookkeeping and not to the instruction a later Login
  reads. An entry replayed by `subscribeAll` says nothing about how many callers
  hold it. The ending mark and the per-stream request map live there for the same
  reason, and `forgetAllSubscriptions` clears the request map alongside the
  entries, so a Socket closed under ADR-0009 keeps no instruction of any kind —
  not an entry, not a count, not a mark, and not a request another caller could
  still be given a share of.
- A reuse registers the caller's callback before it returns. Callbacks are
  unaffected by the collapse because `rememberSubscription` binds `onEvent` to
  the stream name and a callback lands on the name-keyed emitter, not on the
  entry — so a second holder receives events on the shared DDP subscription
  exactly as it did on its own. It receives nothing at all if the reuse branch
  forgets to register it, which is the only way the collapse could lose one.
- `subscribe` still resolves `undefined` on failure, and resolves the entry on
  success whether that entry is new or shared. What a caller receives is
  unchanged by this ADR.

## Consequences

- `subscriptions` no longer grows across Reopens. One stream is one record for
  the life of the Socket, so `subscribeAll` sends one `sub` per stream and an
  incoming event invokes each registered callback once.
- A caller that unsubscribes twice for one id ends a stream another holder still
  wants. The second call decrements a count the caller never incremented, and the
  holder that is left is unsubscribed by it. The old behaviour hid this, because
  the second call rejected on a record that was already gone. Unsubscribing once
  per subscribe is now a requirement rather than a convention.
- The reuse is this Socket's bookkeeping and nothing else. A close forgets every
  entry, every count, every mark and every in-flight stream request, under
  ADR-0009, so a Socket the consuming app closed starts the next one from
  nothing. Nothing about a holder survives into a replacement Socket.
- ADR-0005's serialisation is unchanged and does less work. It keeps one `sub` or
  `unsub` in flight per id; the reuse removes the second `sub` before it reaches
  the queue, and the `unsub` a non-final holder would have queued is never sent.
  A first-time `subscribe` still has no id and still does not queue.
- A reuse resolves the recorded entry without touching the wire, so a caller may
  now be handed a DDP subscription the server has never confirmed — the phantom
  ADR-0006 accepted. It is the same phantom, shared rather than duplicated:
  `subscribeAll` re-sends it at the next Login and the server settles it.
- A Reopen forgets nothing, so an entry recorded on the connection that is gone
  is still reusable on the one that replaces it. A caller that re-runs its own
  `subscribe` between the Reopen and the next Login is handed that entry, and no
  `sub` goes out on the new connection. The stream is re-established by
  `subscribeAll` at the next Login, so correctness here rests on that ordering
  rather than on the reuse. This is not the ADR-0006 phantom: that one is an
  entry the server never confirmed, and this one was confirmed, on a connection
  that no longer exists.
- Two callers for one stream are now one caller as far as the server is
  concerned, so a `nosub` that forgets that entry under ADR-0004 ends the stream
  for all of its holders at once. The counts say how many callers hold an entry,
  not what to do when the server takes it away.
