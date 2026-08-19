# ADR-0003: Rejections that the SDK makes, and the Deadlines that cause them

**Status:** Accepted

**Succeeds:** ADR-0001

## Context

ADR-0001 governs one type of rejection from `Socket.send`. That type carries a
DDP error that the server sent. This ADR governs the other type, which the SDK
makes itself. For that type there is no DDP response, and therefore there is no
server reason to carry. The two ADRs do not overlap. If a server reason is part
of the rejection, ADR-0001 applies. If not, this ADR applies.

Three waits in `lib/drivers/socket.ts` made no rejection at all. Each of the three
left a caller with a promise that could never settle.

`send` writes the DDP message to the Socket inside a `try` block. If that write
threw an error, `send` wrote a log line and returned nothing. The promise then
stayed open for the life of the process.

`waitForOpen` used a Deadline of `config.reopen`. But `reopen()` does not build a
new Socket at that interval. `reopen()` only schedules the retry at that
interval. Therefore the new Socket starts to open as the Deadline expires. A send
that a drop interrupted could not wait for the Reopen that the send needed.

`ping` sent its DDP message while `connected` was still true. That send therefore
did not wait for `open`. That send waited for the `pong`. On a Socket that the
server no longer answers, this wait had no bound. The `.catch(() => this.reopen())`
behind the wait never ran. The Liveness chain stopped, and the Socket stayed open
and dead.

An immediate reconnect emits `disconnected` with no arguments, and `send` gave
`reject` to that event directly. Each send in flight therefore rejected with
`undefined`. Callers read `err.message` in their own `catch` blocks, and each of
those reads threw a TypeError. ADR-0002 makes this path run for each send in
flight, not for approximately one half of them. This ADR must therefore settle
the value.

## Decision

Each wait that the SDK can hold has a Deadline. An expired Deadline rejects with
an Error that the SDK writes.

- A failed write rejects. The log line stays. The silent return does not.
- The default Deadline of `waitForOpen` is `config.reopen * 2`. This Deadline
  outlasts the Reopen that the send waits for, where before the Deadline expired
  as that Reopen started. A measurement gives the multiplier of 2. It is not a
  margin for comfort: at exactly `config.reopen`, no Reopen can meet the Deadline.
- `ping` races its send against a Deadline of `config.ping`. If the Deadline wins,
  `ping` calls `reopen()`. A `pong` that does not arrive therefore causes the
  reconnect that it always had to cause.
- That Deadline is in `ping`, not in `send`. A Deadline on the DDP response of
  `send` applies to each Method call and each DDP subscription of the consuming
  app. The correct bound for a Login, or for the history of a Room, is not the
  ping interval. That bound is also not for the SDK to choose. `ping` is the one
  caller that knows both what it waits for and what to do when the answer does
  not arrive.
- A rejection that the SDK decides on is a plain `new Error` with a fixed message.
  An expired Deadline and an abandoned Reopen are of this type. Such a rejection
  does not go through `toError`, because the work of `toError` is to turn a server
  reason into an Error under ADR-0001, and here there is no server reason. A send
  that a reconnect abandons rejects with
  `'[ddp] connection reopened before the response arrived'`.
- The failed write is the one exception, and the exception is deliberate. A failed
  write rejects with the error that the Socket threw, and the SDK does not wrap
  that error. Unlike a Deadline, a failed write has a reason, and that reason is
  the only description of the fault. The Socket knows why the write failed and the
  SDK does not. A fixed message discards the one useful part of the rejection.
- The rule for a wait that a person adds later has three branches. A rejection
  with a server reason goes through `toError` under ADR-0001. A rejection with a
  reason from the Socket passes that error through. A rejection that the SDK
  decides on, with no reason to carry, is a plain Error with a fixed message under
  this ADR. One exception, added by the amendment below: a wait that a connection
  going away abandoned carries a subclass of Error, because the driver itself
  branches on it. It is a plain Error to every caller, and ADR-0004 still reads it
  as one — the subclass is not a DDPError and does not carry a server reason.

## Consequences

- Callers get a rejection where before they got a wait that never ended. Three
  such waits now settle, so code that handles only the success path now gets
  rejections that it has never seen.
- What a caller gets from an immediate reconnect changes, from `undefined` to an
  Error. This change is deliberate and visible. A read of `err.message` in the
  `catch` block of a caller was already the common shape, and that read threw
  before this change.
- The Deadline of `ping` is `config.ping`. A consuming app that lowers that option
  for the Liveness chain therefore also lowers the bound on the wait for the
  `pong`. The documentation of the option says this at `interfaces/index.ts`.
- `send` still has **no** Deadline for the DDP response, and this ADR does not give
  `send` one. A Method call on a Socket that is open and dead does not wait on a
  timer. Something else must end that wait: a close, or the Liveness chain. To put
  a bound on the call itself, a person must choose that bound for each call, and
  that choice is a separate decision about the public surface of the SDK.
- **Amendment.** The sentence above named a close and the Liveness chain as the
  escape from that wait, and neither was one. `send` listened for `disconnected`
  alone, and `reopenNow` is the only place that emits it. A close and the Reopen
  that the Liveness chain schedules each replaced the connection without that
  event, so each stranded every send written to the connection it replaced — for
  the life of the process, holding the caller's promise and leaking its listeners.
  `send` now ends the wait on `close` and `connecting` as well. Both were already
  emitted, by `onClose` and by `createConnection`, so no new event and no new
  public surface answers this. The rule is the connection, not a clock: a DDP
  response can only arrive on the connection its message went out on, so the wait
  ends when that connection does. A Reopen rejects with
  `'[ddp] connection reopened before the response arrived'`, and a close with
  `'[ddp] connection closed before the response arrived'` — a close is not a
  Reopen, and a caller retrying on the wrong one retries into a closed Socket.
  This is not a Deadline, and the paragraph above still holds: nothing here bounds
  a Method call on a connection that stays up and stays silent.
  One window stays open to all three events: `send` attaches its listeners a
  microtask after `waitForOpen` resolves, so a connection lost in between is
  announced to nobody, and a guard at that point abandons the wait instead. The
  guard reads `readyState`, not `connected`: `connected` is bookkeeping the SDK
  updates when the events land, and in this window they have not landed, so only
  the transport knows whether the connection went away. Reading `connected` there
  also folds in `alive()`, which would abandon a send on a socket that is open and
  merely quiet — and, because an abandoned wait suppresses the Reopen, would
  suppress it for the one connection with nobody rebuilding it.
- Rejections now reach the two places that Reopen on a failure — `ping` and the
  retry inside `reopen` — that never reached them before. A close would rebuild
  the Socket the caller had just closed, and a Reopen would queue a second Reopen
  behind the one already under way. So an abandoned wait carries its own Error
  type, and both places Reopen on every rejection except that one: a connection
  that went away has already been answered, by `onClose` or by the replacement
  itself, and only a failure that leaves nobody rebuilding it asks for a Reopen.
  The type is unexported and sets no `name`, so a caller that receives one — the
  rejection does reach callers, through `open()` — sees an ordinary Error and the
  message above. It adds no public surface because nothing about it is
  observable, not because it stays inside the driver.
- The handshake is the one send with no caller of its own, and `createConnection`
  waits on it through `onOpen`. Ending its wait therefore has to settle that wait
  too — `onOpen` rejects the connection it was opening, rather than trading a
  stranded send for a stranded `open()`. `open` can therefore reject where it
  used to hang, so `checkAndReopen`, which opens without awaiting, now handles
  that rejection rather than raising it to the global handler of the app.
- A failed write of a `sub` DDP message leaves an entry in the subscription map.
  `send` writes that map before `send` writes to the Socket, and the write can now
  reject, so the map can hold an entry for a DDP subscription that the server never
  received. This fault in the bookkeeping is not new, because `send` writes the map
  ahead of the answer of the server in each case. But the failed write is a new way
  to reach the fault. A separate issue tracks the fault, and this ADR does not
  correct it.
- **Second amendment.** The rule above is the connection, not a clock, but one
  path did not follow it. `send` waits in `waitForOpen` when the connection is
  not open, and then wrote its DDP message to whichever connection was current at
  that moment. A send issued at a drop therefore moved to the connection that
  replaced the one it was issued on. A send does not do this now. `send` holds the
  connection that was current when it was called, writes to that connection alone,
  and rejects with
  `'[ddp] connection replaced before the message was written'` if another
  connection has taken its place. The type is the same one an abandoned wait
  carries, so `ping` and the retry inside `reopen` do not Reopen for it. This is
  correct: the connection was replaced by `createConnection`, which the close or
  the Reopen that replaced it had already started, and the replacement starts its
  own Liveness chain in `onOpen`.
  A DDP session belongs to the connection that carries it. The replacement has a
  session of its own, and no Login on it yet, so a Method call moved to it is sent
  under an identity the caller did not ask for. A `sub` moved to it is worse: it
  is written under an id from a session that has ended.
  A send waiting on a connection that stays open and merely quiet is unaffected.
  That send waits for the same connection to open, and its Deadline still bounds
  it.
- A caller that got a result after a Reopen gets a rejection instead. `subscribe`
  turns each rejection into `undefined` and `unsubscribeAll` ignores each one, so
  the DDP subscription paths do not change for a caller. A Method call issued in
  the window between a drop and the next open now fails, where before it was
  answered on the connection that followed. The consuming app decides whether to
  call again. It could not have made that decision before, because it was not told.
- A spec that asserts a rejection of this type asserts both halves, in the way that
  ADR-0001 established. The spec asserts that the value is an `Error`, and the spec
  asserts the message that a caller reads. A later change therefore cannot return
  to a rejection with a bare value.
- **Amendment.** `reopenNow` and `waitForNotifyUserMediaSubs` now take their
  Deadline from `config.timeout`, where each held a constant of its own before.
  `probe` does not, and keeps a default of 2000ms that no option derives. This is
  deliberate, and it is the one Deadline in the driver that no option moves.
  `probe` answers whether a Socket in the gray zone still has a server behind it,
  and the caller acts on the answer — a `false` from `probe` is what decides on a
  Reopen. So `probe` has to settle faster than the wait it exists to diagnose. A
  `probe` bound to `config.timeout` would grow with the wait it is meant to
  shorten, and an app that raises `timeout` to be patient with a Login would make
  its own liveness check slower to notice a dead pipe. The two bounds answer
  opposite questions: `timeout` asks how long a caller is willing to wait for an
  answer, and `probe` asks how long is too long to still call the connection
  alive. `probe` takes its bound as an argument, so a caller that wants a
  different one passes it, and no option is needed to reach it.
- **Amendment.** `close` joins `probe` as a Deadline no option moves, and holds the
  same 2000ms bound. Unlike `probe` it does not take that bound as an argument: no
  caller reaches `close` through a signature that accepts one, and `close` settles
  either way, so there is no answer for a caller to vary its patience on. The
  bound is a module constant the two share. The socket it waits on
  may be one the transport never called open at all — a still-connecting socket is
  closed and waited on the same way, and letting it go settles that open as an
  Abandoned wait rather than leaving it pending — and a stale ping cannot vouch for
  any of them, so the close may never be answered. That is the liveness
  question `probe` asks, not the patience question `timeout` asks, and binding a
  logout's exit to `timeout` would make the app that raised it slowest to leave.
  On the Deadline the Socket becomes a Detached socket rather than one the driver
  keeps waiting on: a socket the peer never releases costs less than a caller — a
  logout, a teardown, a Reopen — that never returns.
  This Deadline settles the wait rather than rejecting it, because `close` promises
  only that the driver has let the connection go, which is true either way.
  When the transport neither answers nor accepts the close, the driver answers
  itself by feeding a close event with the user-disconnect code through `onClose`,
  rather than emitting `close` directly. `onClose` therefore stays the sole owner
  of the identity guard, the emit, the Reopen decision — code 4000 skips the
  Reopen — and the log line, and an in-flight `send` learns its connection ended
  on the same event the transport would have used.
  `close` does not unsubscribe. Closing the connection ends every stream on the
  server, so `close` forgets its DDP subscriptions locally and sends no `unsub`.
  `logout` is the deliberate exception: it stays on the same connection, so it
  awaits its own `unsubscribeAll`.
  The reject of a not-yet-open Socket is held per Socket, because a detach can run
  on an old Socket while a newer open is still pending, and a single field would
  settle the wrong wait. It is settled on a microtask, so a handshake rejection
  already in flight settles that wait first.
- **Third amendment.** The second amendment says a send waiting on a connection
  that stays open and merely quiet is unaffected, and that its Deadline still
  bounds it. Neither holds now. Whether `send` waits at all is decided on the
  transport's own state, so a send on a Transport open Socket does not wait: it
  is written to that connection at once, and `waitForOpen` — the only Deadline
  in this path — is never reached. What the second amendment decided is
  unchanged, because the connection is read before the write either way. What
  changes is that a quiet connection is no longer a bounded case at all. The
  rule is the one the first amendment states: the connection, not a clock.
- **Fourth amendment.** A scheduled Reopen replaces the connection, and no
  longer consults `connected` or opens through `open`, which declines to replace a
  connection that reads as connected. The one case where it does not build a
  connection of its own is a Reopen already in flight: it joins that rebuild
  rather than starting a second one, and that rebuild replaces the connection. `connected` cannot answer the question a
  Reopen asks: `lastPing` moves on any frame, so a server that emits frames and
  never answers a ping reads as connected while nothing it says is a pong. A
  Reopen that declined on that reading left the Liveness chain with nothing
  scheduled for the one connection whose pending sends had nothing else to end
  their wait, and consulting it at all was a livelock — ping deadline, Reopen,
  connected, ping, forever, and never a rebuild.
  The Reopen goes through `reopenNow` instead, so every send written to the
  connection it replaces settles under the first amendment. `reopenNow` re-arms
  the chain when it settles, through `rearmLivenessChain`, so it covers its public
  callers too: a consumer-invoked `reopenNow` that settled on its Deadline used to
  leave the chain with nothing scheduled — issue #294 through the public surface.
  Its own retry no longer routes through `reopenUnlessAbandoned`, because
  `reopenNow` swallows a creation error and settles on its own Deadline, leaving no
  rejection to branch on.
  Every other place the chain can end holds a rejection, and each of the three
  routes it through `reopenUnlessAbandoned`, the one point that decides whether a
  failure asks for a Reopen: an unanswered `ping`, a handshake that did not
  complete in `onOpen`, and a failed `open` from `checkAndReopen`. The last two
  used to log and stop, which left the connection set, the chain unarmed and
  nothing scheduled — issue #294, reached through a public entry point in the
  `checkAndReopen` case. Logging is not handling. A wait that a connection going
  away abandoned still asks for no Reopen, because whoever replaced that
  connection is already rebuilding. The re-arm also runs when a consumer listener on `disconnected` throws:
  that emit is guarded, so such a throw cannot abort the rebuild.
  The re-arm asks whether the chain is running, and `pingTimeout` alone did not
  answer that. It reads empty for the whole in-flight window, because the timer
  deletes it as it fires, so a ping with up to `config.ping` left to be answered
  counted as nothing scheduled and got a Reopen after `config.reopen` — a
  force-replace of a connection that may well have been healthy, prevented only
  when the answer beat the shorter of the two delays. A ping in flight is now
  tracked in its own field and reads as the chain running, so no Reopen is armed
  behind it. Nothing is lost when that ping never comes back: its own Deadline of
  `config.ping` settles it either way, and that failure reaches
  `reopenUnlessAbandoned` as before. That field holds the connection the ping went
  out on rather than a flag, because the question is whether the chain is running
  for the connection the driver has *now*. A ping written to a socket the
  transport had already closed waits in `waitForOpen`, so it is still in flight
  when a Reopen replaces the connection under it, and as a flag it answered yes
  for the replacement. It then rejected as an abandoned wait, which asks for no
  Reopen, and the rebuild was left with the connection set, the chain unarmed and
  nothing scheduled — issue #294, in the one shape that survived every amendment
  above: a rebuild whose transport opens and whose `connect` is never answered
  gets no rejection at all, since `send` has no Deadline for a DDP response, so
  `reopenNow`'s own Deadline is the only thing left to re-arm the chain. A ping in
  flight on a replaced connection therefore counts as nothing scheduled. A ping in
  flight on the connection the driver still has counts as the chain running, which
  is what a Reopen that could not build anything reads.
  A rebuild whose handshake has not landed still counts as nothing scheduled and
  still gets a Reopen.
  The other half of the guard stays: arming the chain cancels a scheduled Reopen.
  That cancel is now conditional, and two guards state the condition: the
  connection the ping went out on is still the current one, asked where the chain
  continues after a pong, and that connection is still open, asked where the chain
  is armed. A pong is not the answer a Reopen
  that `onClose` scheduled was waiting for — a late frame completing a ping on a
  transport that is gone used to cancel that Reopen and arm the chain on a closed
  socket, which pushed recovery from `config.reopen` out to `config.ping` plus two
  Reopen delays.
  `checkAndReopen` stays the exception: it is the deliberate force-reconnect entry
  point, reads `connected` itself and opens through `open`, so this amendment
  speaks only of the scheduled Reopen.
  `close` therefore lets go of any Reopen before its wait as well as after: one
  step, settling an in-flight Reopen and cancelling the scheduled one together.
  Cancelling a Reopen cannot undo a rebuild it already started, and a `close`
  that finds itself superseded now asks whether anything still answers for the
  connection that superseded it. Two things can: the Liveness chain armed for
  that connection, and an `open()` still waiting on its handshake. Either way the
  close is superseded as before and leaves that connection and its subscriptions
  alone. Where neither holds, the close lets go of it on the same terms —
  closing, detaching and forgetting — and it returns with no connection rather
  than with a replacement and nothing scheduled, the state issue #294 names. It
  is reached whenever a Reopen settles inside the close wait, arms the next one,
  and that Reopen delay is shorter than what is left of the wait. A `close` means
  the consumer has let the connection go, so a rebuild it did not ask for does not
  outlive it with nothing behind it.
  The armed chain alone was the wrong question, twice over. It is time-blind: the
  chain is armed in `onOpen` only after the handshake round-trip, so a healthy
  replacement mid-handshake read as unanswered-for for a full round-trip and a
  close landing in that window took it. And it says nothing about who asked for
  the connection: an `open()` the consuming app made during the wait installs one,
  and that connection is not the driver's rebuild to discard. So the question is
  asked of the connection: is an `open()` that built it still waiting on it. The
  pending-open reject the driver already holds per socket answers it, cleared when
  the handshake settles either way, so a connection whose `open()` has already
  failed is not mistaken for one still being waited on. A Reopen is not asked
  about, because a Reopen cannot name who asked for it and the close has settled
  and cancelled every Reopen by the time it asks — including one a consumer
  started, which is the same rule as before this amendment.
  Every connection the close lets go of is detached, not only the last one: the
  loop hands off to a replacement and can return on one, and a socket it walked
  past with its pending open unsettled is the stranded wait this ADR exists to
  end.
  It runs first because a settle arms a Reopen, and a consumer whose `reopen` is
  shorter than the close Deadline would otherwise have it fire inside the wait and
  leave `close` superseded by a connection nobody asked for. It runs again after
  the wait, for a transport close carrying any other code that reaches `onClose`
  during it — and it runs *before* `close` asks whether it was superseded. A
  Reopen that fired inside the wait is exactly the case that supersedes it, so a
  cancel behind that question is a cancel that case never reaches: the close
  returns leaving a Reopen armed against a connection its caller has already let
  go, rebuilding sockets for as long as the Socket lives.
  The connection `onClose` compares against is recorded for the length of the
  close and released when the wait is over, so a Socket does not hold the last
  Transport it closed for the rest of its life.
  The code-4000 carve-out in `onClose` — the one place a close asks for no Reopen —
  now applies only to a close the driver itself started. `close` feeds a synthetic
  close event with that code through `onClose` deliberately, and that path is
  unchanged: it still does not Reopen. But a server is free to send 4000 too, and
  such a close arrived at the same carve-out and was treated as the driver's own:
  an in-flight ping rejected as an abandoned wait, which asks for no Reopen
  either, and the chain ended with the connection still set and nothing scheduled
  — issue #294 again, this time chosen by the peer. `onClose` records the
  connection the driver started a close on and compares it, so a server-sent 4000
  Reopens like any other code.
  `ping` no longer wrote anything by the fourth amendment — the write moved into
  the timer — so it is named `armLivenessChain`, and the pong continuation, which
  did the same two things behind one more guard, is the same method: it takes the
  connection the ping went out on, and the current connection is the default for
  the caller that has just handshaken one. The continuation was never only a pong
  either; it runs whenever the race resolves. `ping` is not in `ISocket` and no
  caller outside `onOpen` reaches it, so no entry point is kept behind the name.
  A server that emits frames and never answers a ping therefore gets a fresh
  connection every `ping` interval plus `ping` deadline plus `reopen` delay: the
  chain waits `config.ping` before writing a ping, the written ping races a second
  `config.ping`, and the Reopen it fails into waits `config.reopen` — 50 seconds at
  the defaults, dominated by the ping timings rather than the reopen delay. That
  spacing is fixed, so the rebuild loop is unbounded and never backs off: the cure
  for the old livelock is a connection rebuilt at a constant rate for as long as
  the server stays that way.
