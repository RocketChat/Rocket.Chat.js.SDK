# ADR-0011: The id for a `sub` is derived from the stream

**Status:** Accepted

**Succeeds:** ADR-0005

## Context

`subscribe` used to take whatever id `send` minted for the frame — `ddp-N`,
where N counts sends on the Socket. Two calls for the same stream therefore
produced two ids, two `sub` frames, and two entries in `subscriptions`. The
consuming app reaches `subscribe` on every room open, so a room opened twice
left two DDP subscriptions on one stream: the server streams each message once
per registration, every registered callback fires once per copy, and
`subscribeAll` replays both at every Login. The registry grew for the life of the
socket and nothing in the SDK could tell the two apart, because nothing recorded
what either was for.

Deduplicating after the fact needs an index from "this stream" to "the entry that
already holds it". The SDK already has one: `subscriptions` is keyed by id. The
index only fails because the key carries no information about the stream.

## Decision

The id for a `sub` is derived from the stream it subscribes to:

```
sub-<name>-<sha256(JSON.stringify(params))>
```

One stream is one id, so `subscriptions[id]` *is* the dedup index. `subscribe`
looks the id up, and a call that finds a record shares it — no frame goes out and
the caller is handed the record that is already there.

- **Identity.** Two subscribes are the same stream iff `name` matches and
  `JSON.stringify(params)` matches byte for byte. This is the definition of the
  stream's identity, not an approximation of one: key order in an object param is
  part of it, and `JSON.stringify` renders an `undefined` array member as `null`
  and drops an `undefined` object value, so param sets that differ only in those
  ways derive one id and are one stream.
- **Ordering.** The lookup and the write both happen inside the thunk
  `queueSubscriptionRequest` runs, so the record is written before the queue slot
  for that id releases. A second `subscribe` released into the gap would find
  nothing and put a second `sub` frame on the wire under an id already in use —
  worse than the fault this record removes.
- **Derivation is unconditional.** There is no fallback id for params that do not
  serialise: `send` stringifies the whole frame a moment later, so such a `sub`
  cannot reach the wire either way, and a fallback would be the one place two id
  schemes could coexist.
- **Re-establishing is a different act from subscribing.** `subscribeAll` and
  `resubscribeWhenRecorded` go through `resubscribe`, which always sends. They
  exist to put a recorded stream back on a new connection, and the record they
  read from is the very thing a share-check would find.
- **No refcounting.** A shared record has no holder count. The lifetime contract
  below is the whole of the rule.

## Consequences

- **A DDP subscription is shared.** Two `subscribe` calls for one stream get one
  record, and the first `unsubscribe` ends the stream for every caller holding
  it. There is no way to ask for a private one: the id is derived, so a caller
  cannot supply its own.
- **A second holder's `unsubscribe()` rejects.** Once the first has ended the
  stream, the second finds no entry and gets `[ddp] No subscription to
  unsubscribe from`. That rejection was previously a redundant no-op on a
  duplicate entry; it is now the visible edge of the shared lifetime, and the
  only warning a second holder gets. The risk this carries is a consumer that
  mounts the same stream twice concurrently — a `navigate('RoomView')` that
  bypasses the guard against re-entering the room already open. The contract is
  what covers it.
- **Three keys mean "the same stream", and they do not agree.** They are
  deliberately different and each is load-bearing:
  1. the derived id — exact, by value, over `name` and every param;
  2. `findSubscriptionsByParamPrefix` — a *prefix* match over `params`, compared with `===`,
     so an object param never matches it at all. `resubscribeWhenRecorded`
     depends on the looseness; it is not a defect to be aligned with (1).
  3. `rememberSubscription` binds `onEvent` and `unsubscribe` to the stream
     **name**, so message delivery is name-keyed and every sharer of a name
     receives every frame under it.
  It is (3) that decides whether a message is delivered once. Sharing a record
  removes the duplicate delivery because it removes the duplicate `onEvent`
  registration, not because the id changed. This is also why deduplicating
  through `findSubscriptionsByParamPrefix` — the fix the issue suggested — cannot work: it
  matches streams the server considers distinct, and misses object params
  entirely.
- **Ids are readable.** The stream name stays in the id, so
  `[ddp] sending message` logs and `socket.subscriptions` still name what each
  entry is for, and the hash bounds the length of an id derived from a large
  param — a whole username array, in the presence stream's case.
- **The registry stops growing for deduplicable streams only.** A caller that
  varies its params per call — a presence registration carrying the usernames
  currently on screen — still leaves one entry per distinct param set. Those are
  different streams by this ADR's definition and no id scheme collapses them.
