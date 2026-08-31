# ADR-0015: A close takes the Socket, and leaves it Idle

**Status:** Accepted

**Succeeds:** ADR-0009

## Context

ADR-0009 bounded a close and had the Socket answer one the Transport would not.
It treated a close as one more operation competing for the Socket, and drew the
race the way the code drew it: if another Transport was installed while the
close waited, the close was superseded and resolved without changing the
replacement, its sends or its DDP subscriptions.

That reading does not survive contact with a mobile consumer. An app that is
being suspended calls disconnect and does not await it. If a close can be
superseded, the recovery that starts a moment later wins, and the app is
suspended holding a connection it asked to be rid of, with the Liveness chain
and a Scheduled Reopen still running behind it. Losing the race is not a
degraded outcome here. It is the opposite of what the caller asked for.

Two closes were neither coordinated nor tested. Nothing said what a `send`
issued during a close should do, so whether a DDP message reached a Transport
that was on its way out depended on where the close happened to be. `logout` was
worse: it clears local Login state, unsubscribes and then makes a Method call,
so a close arriving part way through left the app logged out locally and still
subscribed on a server it could no longer reach.

The `close` option compounded it. It was documented, spread onto the Driver's
config, and ignored: the Socket always used the 2000 ms constant. An option that
the type checker endorses and the code discards is worse than no option.

ADR-0014 gives the Socket one owner for its Connection work. A close needs the
same thing, one level up, and it needs to be the one owner no Connection
operation can take from it.

## Decision

One close takes the Socket, synchronously, and cannot be superseded.

### Ownership and admission

- The close records its ownership before it does anything that could hand
  control back, and before anything that may synchronously call the Transport's
  close callback. Everything after that point observes a Socket that a close
  owns.
- Close cancels the Scheduled Reopen or the active Connection Attempt that
  ADR-0014 allows the Socket to hold, whether that attempt is ordinary or
  forced. Every caller attached to the cancelled attempt rejects promptly with
  `'[ddp] connection closed before it opened'`, and none of them transfers to
  later Connection work.
- A new `Socket.open()` or `reopenNow()` while a close owns the Socket rejects
  with the same message rather than starting an attempt. Internal `reopen()`
  records no recovery intent, so nothing is waiting to run once the close is
  done.
- Driver `connect()` keeps delegating to `Socket.open()` and gains no admission
  check of its own. `connected` keeps the meaning ADR-0014 and the glossary give
  it, Transport open and alive, and does not become a flag for whether work is
  admitted. One place decides admission, and it is the Socket's own ownership.
- No new DDP message reaches the Transport while a close owns the Socket. That
  covers fresh DDP work, work waiting for the Transport to open, work released
  from a queue during the close, and the Liveness chain. Each of those rejects
  before the write, through a bare Abandoned wait with
  `'[ddp] connection closed before the response arrived'`, carrying no request
  id. DDP work already written keeps the `AbandonedRequest` behaviour it has,
  with the same close-specific message, because it did reach the wire and its id
  is what ADR-0006 reads.
- `logout` admitted while a close owns the Socket rejects through the same bare
  Abandoned wait before it clears local Login state, before `unsubscribeAll()`,
  before it touches a request queue and before it writes. Half a logout is worse
  than none: the alternative leaves an app that believes it is logged out and a
  server that holds its streams. The Driver's result is the same whether or not
  a synchronous close callback has already made `connected` false, so the caller
  sees one behaviour rather than two.

### Joined callers, the bound, and settlement

- Concurrent `Socket.close()` and Driver `disconnect()` callers join the first
  close. They share its one absolute 2000 ms Deadline and its `void` outcome.
  They share the operation, not a Promise reference: Promise identity is not
  contractual here any more than it is for a Connection Attempt under ADR-0014.
- The bound is the 2000 ms module constant `probe` also uses, and unlike `probe`
  the close does not take it as an argument. No caller reaches a close through a
  signature that accepts one, and a close settles either way, so there is no
  answer for a caller to vary its patience on. The `close` option is removed
  from the public Socket options rather than wired up, because a caller has
  nothing to gain by moving this bound.
- The close is bounded on the liveness question rather than the patience one.
  The Transport being closed may be one that never opened at all, and a stale
  ping cannot vouch for any of them, so the close may never be answered. Binding
  a logout's exit to `timeout` would make the app that raised it the slowest to
  leave.
- On the Deadline the Socket lets the Transport go and becomes a Detached socket
  rather than one that keeps waiting. A Transport the peer never releases costs
  less than a caller that never returns. The Deadline settles the wait rather
  than rejecting it, because a close promises only that the Socket has let its
  Transport go, which is true either way.
- Settlement leaves the Socket Idle: no Transport, no DDP session, no Liveness
  chain, no recovery intent, and no close in progress. A close called on a
  Socket in that state fulfils immediately, and Connection work asked for
  afterwards is admitted normally.

### Announcing the close, and what it forgets

- When the Transport neither answers nor accepts the close, the Socket answers
  itself by feeding a close event with the user-disconnect code through
  `onClose` rather than emitting `close` directly, so a consumer sees the same
  event whether the Transport answered or the Socket answered for it. `onClose`
  owns the identity guard and the log line and hands the transition to the
  Connection work, which owns the guard against announcing one Transport's close
  twice, the emit, and the decision to recover. Nothing on that path schedules a
  Reopen while a close owns the Socket.
- A close with no Transport emits nothing. There is no connection to announce
  the end of.
- A close does not unsubscribe. Closing the connection ends every stream on the
  server, so the Socket forgets its DDP subscriptions locally and sends no
  `unsub`. `logout` on an attached Transport is the deliberate exception, because
  it stays on the same connection and awaits its own `unsubscribeAll` first.
- `logout` with no attached Transport and no close taken ends locally rather than
  doing nothing. It forgets every entry and clears the stored Login, so the next
  user inherits neither an instruction to re-establish the previous user's
  streams nor a token to resume with. It writes no `unsub`: there is nothing to
  write on, and the server has already lost every stream with the connection.
  This is the same forgetting a close does, reached without a close, and it is
  why an Offline sub does not outlive the Login that asked for it.

### Transport callbacks

- A callback from a Transport the close has detached cannot change Socket state,
  cannot start Connection work and emits nothing. This is the same rule ADR-0014
  applies to a cancelled attempt, reached from the other side.
- ADR-0009 held the reject of a not-yet-landed open per Transport, because a
  detach could run on an old Transport while the open of its replacement was
  still pending. ADR-0014 removes the case: a Socket has one attached Transport
  and one Connection Attempt, and that attempt owns the settlement of its own
  callers. There is no second wait for a close to reach by mistake.

## Consequences

- A fire-and-forget disconnect is enough. An app suspending itself cannot lose
  the Socket to recovery that starts a moment later, because there is no moment
  in which the close is not already the owner.
- The superseded close is gone. ADR-0009 described an outcome that a caller
  could not distinguish from success and that left the Socket connected; this
  ADR removes it rather than documenting it better.
- Two closes cost one close. The second joins the first, waits no longer than it
  does, and receives the same `void`.
- A DDP message issued during a close fails with a message that names a close,
  so a caller retrying does not retry into a Socket that is on its way out. The
  distinction ADR-0014 draws between the close message and the Reopen message is
  what makes that decision available to a caller.
- `logout` during a close is a rejection rather than a partial teardown. The app
  stays logged in locally on a connection that is going away, which is the state
  a later Login can correct. The alternative is not correctable.
- The `close` option is removed from the public Socket options type and its
  documentation. It is a compile-time break for anyone passing it, and it
  changes no behaviour, because the Socket already ignored it.
- A Socket the consuming app closed keeps no instruction to re-establish
  anything. The per-entry rule ADR-0004 draws never runs on this path, since no
  DDP response can arrive to decide one, and ADR-0006's rule for what an
  abandoned `sub` keeps turns on this being a close rather than a replacement.
- The Socket may let go of a Transport the peer still holds open. It is then a
  Detached socket: its handlers are gone, so a late close event on it reaches
  nothing.
