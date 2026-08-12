# ADR-0004: Which rejections forget a DDP subscription

**Status:** Accepted

**Succeeds:** ADR-0003

## Context

ADR-0001 governs the rejection that carries a DDP error. ADR-0003 governs the
rejection that the SDK originates itself. Both ADRs settle what a caller
receives. Neither settles what the Socket does with its own bookkeeping when a
rejection happens. `unsubscribe` is where that question first has consequences.

The Socket holds its DDP subscriptions in `Socket.subscriptions`, keyed by id.
`subscribeAll` rebuilds every one of them from that object, and `login` calls
`subscribeAll`. An entry is therefore not a record of the past. An entry is an
instruction to re-establish that stream at the next Login.

`unsubscribe` removed its entry before it sent the `unsub` DDP message. A DDP
subscription that the server refused to end was then a stream the SDK could no
longer name, and could neither retry nor re-establish. Moving the removal into
the DDP response corrected that case and created the opposite one: every
rejection kept the entry, including the rejection that says the server does not
have the DDP subscription at all.

The two rejections are opposite in what they report.

A `nosub` carrying a DDP error is a DDP response. The server answered. The
server does not have this DDP subscription. Nothing is streaming.

A rejection that the SDK originates carries no DDP response. The `unsub` never
reached the server, because a Reopen abandoned the wait or because the write
failed. The server may still be streaming.

`toError` returned a plain Error, so the two were not distinguishable at the
point where the decision has to be made.

## Decision

An entry is forgotten when the server has answered, and kept when it has not.

- `toError` returns a `DDPError`. Every value it produces is a `DDPError`,
  including the one it builds from a DDP error that arrived as a bare string.
  `toError` is the single place where a DDP error becomes an Error under
  ADR-0001, so the type marks provenance in the value itself, and a caller reads
  it with `instanceof`. A rejection the SDK originates under ADR-0003 is a plain
  `Error` and is therefore not a `DDPError`.
- `unsubscribe` forgets its DDP subscription on a DDP response, whether that
  response succeeded or carried a DDP error. It keeps its DDP subscription on
  any other rejection. It re-throws in both cases. The rejection a caller
  receives is unchanged by this ADR.
- `unsubscribeAll` decides nothing of its own. Each `unsubscribe` decides its own
  entry, and `unsubscribeAll` catches each failure so one refusal cannot stop the
  rest, or stop the Method call that `logout` makes after it.
- `close` forgets every DDP subscription. `close` does not wait for the `unsub`
  DDP messages it sends, and it tears the Socket down, so no DDP response can
  arrive and no per-entry decision can run. A Socket the consuming app closed
  keeps no instruction to re-establish anything.
- A Reopen forgets nothing. Every entry survives, and that is what lets
  `subscribeAll` restore the streams after the next Login. This half of the rule
  is expressed by the absence of any removal on that path.
- The removals are `forgetSubscription(id)` and `forgetAllSubscriptions()` on
  `Socket`. `forgetAllSubscriptions` removes one key at a time from the same
  object. `DDPDriver.subscriptions` is assigned `this.ddp.subscriptions` in
  `connect`, so the Driver and the Socket hold one object between them. Putting a
  fresh object in place of the old one would leave the Driver reading every entry
  the clear was meant to drop.

## Consequences

- A DDP subscription the server refuses to end is no longer re-requested at every
  Login for the life of the Socket. In practice a Rocket.Chat server answers
  `unsub` with a bare `nosub` and no DDP error, so the corrected path is rare.
  What changes is which behaviour the specs certify as correct.
- A caller that reads only `err.message` sees no difference. The `DDPError` type
  adds a distinction; it removes nothing. `name` stays `Error`, so nothing that
  matches on the name changes.
- `DDPError` restores its own prototype in its constructor. A consuming app
  compiles this SDK from TypeScript source with its own toolchain, and a
  toolchain that downlevels classes breaks `instanceof` for a subclass of `Error`
  without it.
- The rule governs the removal of an entry. It does not govern the writing of
  one, and the writing is where the same fault survives. `send` writes an entry
  for a `sub` DDP message before that message goes out, and `subscribe` swallows
  its own failure without removing anything, so a failed subscribe leaves an
  entry that `subscribeAll` re-requests at every Login. ADR-0003 already records
  the failed write as one way to reach this. A separate issue tracks it. Until it
  is corrected, this ADR describes an invariant that the `sub` path does not hold
  to.
- Whether a `sub` may be sent for an id whose `unsub` is still in flight is not
  settled here, and the behaviour of the server in that case is not known. A
  separate issue tracks the question.
