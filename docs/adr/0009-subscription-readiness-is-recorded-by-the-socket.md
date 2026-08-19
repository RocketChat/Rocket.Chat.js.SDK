# ADR-0009: Subscription readiness is recorded by the Socket, scoped to a connection

**Status:** Accepted

**Succeeds:** ADR-0006

## Context

Issue 312: the Socket keeps no record of whether a DDP subscription was
confirmed. The caller that needs one is Rocket.Chat.ReactNative's call-accept
path: after a forced reconnect the app must know when its `media-signal` and
`media-calls` streams are live again before it answers. What it has today is
`resubscribeWhenRecorded`, which polls `subscriptions` every 100ms until the
entries exist, re-sends each under the id it was first sent with, and resolves
on whether the re-send was acknowledged.

Three properties of that mechanism fail the caller.

Readiness is nowhere recorded. A caller that arrives after the streams
confirmed cannot learn it; the only way to ask is to send another `sub`.

The re-send is the readiness check. Sending a `sub` to learn whether a `sub`
is needed only works while the session is authenticated. A reopened connection
is anonymous until the app logs in again, and that window is reachable: the app
forces a reconnect on foreground and inside the call-accept path itself, and
re-logs in only when a `close` flipped its stored connection state. On the
anonymous session the server refuses the `sub` with an errored `nosub`, and per
ADR-0004 that refusal forgets the entry — the check destroys the state it
checks. `loggedIn` cannot gate the re-send either: it is `connected &&
!!resume`, `resume` survives across connections, and nothing clears it, so an
anonymous reopened session reports logged in.

The poll exists because the only readiness signal on offer was the ack of the
mechanism's own re-send. Once readiness is recorded, the signal is the record,
and the poll has nothing left to wait for.

The re-send itself cannot be repaired inside this issue. The only way to know a
session is authenticated is to log it in, and resume login on a reopened
connection is its own change — it was switched off deliberately once already
and the reason has to be re-established first. It is tracked as #359.

## Decision

Readiness is recorded state; the query is derived; the query sends nothing.

- Readiness lives in a private set of confirmed subscription ids the Socket
  owns, beside the entries; the entry itself stays a stream handle and the
  public `ISubscription` carries no readiness field. `whenReady` is a thin
  query over the entries and the set: it resolves `true` when every stream
  asked for has a Confirmed sub, `false` when the Deadline rings first, and
  never rejects. It sends no `sub` of its own.
- Readiness is scoped to a connection: `onClose` clears the set the moment
  the connection ends and `createConnection` clears it again for the new
  one, so a reopen turns every sub Unconfirmed without a pass over
  `subscriptions` — the clear does the forgetting.
- The 100ms poll dies with the mechanism that needed it. The re-send stays
  where it has always belonged: `subscribeAll` on Login. A reopen sends
  nothing, so on an anonymous reopened session the entries survive
  Unconfirmed and `whenReady` resolves `false` at the Deadline — pinned as a
  test. The re-send on that path returns when #359 makes the reopened session
  authenticated.
- `ISocket.resubscribeWhenRecorded` is replaced by
  `whenReady(streams, timeoutMs?): Promise<boolean>`, the Deadline defaulting
  to `config.timeout`. `IDriver.waitForNotifyUserMediaSubs` keeps its
  signature and becomes a caller of `whenReady`.
- A stream matches exactly: same name, same params length, element-wise `===`.
  The prefix match in `findSubscriptions` stays as it is for its current
  callers and is kept out of the readiness path.
- When no entry exists yet, `whenReady` waits until the Deadline rather than
  answering early — the `sub` may still be in flight — and resolves `false`.

## Consequences

- `waitForNotifyUserMediaSubs` no longer re-sends. On the call-accept path
  after a forced reconnect without a login, it resolves `false` at the
  Deadline where the old mechanism re-subscribed. That is a visible behaviour
  change on a path where today's code loses the entries anyway — the refused
  re-send deletes them — so what is traded away is a re-send that failed
  destructively, and what is gained is an honest answer and entries that
  survive to be re-established at the next Login. #359 closes the gap by
  making the reopened session authenticated.
- Any stream's readiness can be asked, not only the two media streams, and the
  answer costs no wire traffic once it is recorded.
- An entry confirmed on a previous connection reads Unconfirmed the moment a
  new connection is created, however the old one ended.
- The pinning suite keeps its assertions on `id`, `name` and `params`. Tests
  that inferred readiness from a re-send going out are rewritten against the
  recorded state, and the Driver reopen test gains the Login the real app
  performs, plus a sibling pinning that a reopen without a login resolves
  `false` at the Deadline.
- The two `nosub` shapes this work surfaced — an errored one forgets the
  entry, an errorless one keeps it, and the SDK never inspects `msg` to tell
  them apart — are unchanged here and tracked as #360.
