# ADR-0014: Connection work, its Deadline, and the rejections the SDK makes

**Status:** Accepted

**Succeeds:** ADR-0003

## Context

ADR-0003 settled which waits the SDK ends itself and what each one rejects with.
It settled them one wait at a time, because at the time each connection
operation was one wait. What a Socket was doing about its connection had no
owner, and the faults that left are not reachable by bounding another wait.

Ordinary `open()` calls did not join. Each one constructed a Transport, detached
and closed the one before it, and rejected the earlier caller with
`'[ddp] connection closed before it opened'`. Two callers asking the same Socket
for the same thing raced, and the loser was told a close had happened that no
consumer had asked for.

ADR-0003 bounded the handshake with the DDP response Deadline, and that Deadline
starts after the write. A Transport that never reached `onopen` never reached
that write, so it armed no Deadline at all and left its caller pending for the
life of the process. The documentation of `timeout` says it bounds abandoning a
connection, and for the half of a connection that hangs most often it bounded
nothing.

`reopenNow()` shared one promise between its callers and resolved `undefined`
whether the connection opened or its Deadline merely ran out. A caller could not
tell success from silence, and a construction or handshake failure never reached
it at all. An ordinary `open()` issued while `reopenNow()` was under way waited
on that work but held a promise of its own, so once the forced Deadline expired
several waiting opens each constructed a Transport of their own.

`disconnected` existed for exactly one caller. `reopenNow` emitted it, `send`
listened for it, and the settlement of a DDP wait therefore depended on an event
firing rather than on the connection actually changing hands. An event is an
observation of a transition. Making it the cause of a rejection puts listener
ordering on the path of that rejection.

`checkAndReopen()` opened without awaiting and logged what it caught, so the one
caller that most needed an answer, an app resuming to the foreground, received
none. It also replaced connections that were healthy, because it never asked.

None of this is a defect in a single wait. It is the absence of one owner for
what a Socket is doing about its connection.

## Decision

A Socket owns its Connection work, Connection work is one thing at a time, and
the waits ADR-0003 bounded are bounded on the same terms except where that
ownership moves them.

### Connection work

- Connection work is exactly one of three states: Idle, one Scheduled Reopen, or
  one active Connection Attempt. A Scheduled Reopen and a Connection Attempt
  never coexist. Neither Idle nor a Scheduled Reopen says anything about whether
  a Transport is attached: both may retain an established one, and the state
  names what the Socket is doing rather than whether it is connected. Close
  ownership displaces all three while it lasts, on the terms ADR-0015 sets.
- A Socket has at most one attached Transport. A predecessor it detached may
  still be open to the peer, and is then a Detached socket: nothing it does
  afterwards reaches the Socket.
- A Transport lost to the peer is released, not left attached. An attached
  Transport is one the Socket could still write on, so a caller that reads
  attachment reads it as such.
- A Connection Attempt spans Transport construction through DDP handshake
  success. Transport open alone is not success. The handshake completes, the
  session is recorded, the Liveness chain starts, and only then has the attempt
  succeeded. Every retry is a fresh attempt, with a fresh Deadline.
- The current Connection work is the sole authority for its timer or its
  attempt. Only callbacks belonging to the current attempt and its Transport may
  change Socket state. An attempt that fails or is cancelled loses that
  authority and detaches its Transport before any successor work begins, so a
  late callback changes nothing, settles nobody and emits nothing.
- A successful handshake terminalizes its attempt, retains its Transport as the
  established Transport, and returns Connection work to Idle. A Scheduled Reopen
  is consumed or cancelled before any Connection Attempt begins.

### Which operation does what

Internal `open()`, which Driver `connect()` delegates to, retains a usable
Transport or establishes one. Internal `reopen()` owns normal delayed recovery
after a drop. Public `reopenNow()` forces one immediate replacement. Sharing an
attempt means waiting on that one attempt and constructing no second Transport.

| Connection work | Internal `open()` | Internal `reopen()` | Public `reopenNow()` |
| --- | --- | --- | --- |
| Idle with a usable Transport | Retain it. | Schedule one delayed Reopen, which retains the Transport if it is still usable when the delay is up. | Start one forced Connection Attempt immediately and replace the Transport. |
| Idle without a usable Transport | Start one ordinary Connection Attempt immediately. | Schedule one delayed Reopen. | Start one forced Connection Attempt immediately. |
| Scheduled Reopen | Consume the schedule, then retain a Transport that recovered meanwhile or start one ordinary Connection Attempt immediately. | Keep the existing schedule without resetting its delay. | Cancel the schedule and start one forced Connection Attempt immediately. |
| Active ordinary Connection Attempt | Share the active attempt. | Share the active attempt, and require one Scheduled Reopen only if it fails. | Cancel the ordinary attempt, detach its Transport, then start one forced Connection Attempt immediately. |
| Active forced Connection Attempt | Share the forced attempt. | Share the forced attempt, and require one Scheduled Reopen only if it fails. | Share the forced attempt without replacing it or resetting its Deadline. |

- A Reopen decides whether to retain the Transport when its delay is up, not
  when it is asked for. `reopen()` takes the schedule on the evidence it was
  given, and the schedule reads usability again when it fires: if the Socket is
  connected by then, it constructs nothing. Deciding at the moment the Reopen is
  asked for would answer the wrong question. `connected` is Transport open and
  alive, and `alive()` is inclusive at twice the ping interval, so at the instant
  a ping's own wait expires the Transport still reads usable by a millisecond.
  A Reopen refused on that reading is not refused: it is asked for again by the
  next liveness failure, a full ping interval later. Taking the schedule on the
  evidence and re-reading when it fires costs one pending timer in the case
  where the connection recovers on its own, and saves a ping interval on every
  liveness reconnect.
- An `open()` that consumed a Scheduled Reopen inherits its recovery intent, so
  a failure re-schedules rather than returning to Idle. Only an `open()` that
  found nothing scheduled is one-shot.
- `reopenNow()` may replace an ordinary attempt once. Repeated `reopenNow()`
  calls share the forced attempt. A foreground resume and a VoIP call arriving
  together therefore cost one Transport, not two, and no sequence of forced
  requests can churn Transports.
- A failed attempt that carries recovery intent creates exactly one Scheduled
  Reopen. Unexpected loss of the established Transport, internal `reopen()` and
  public `reopenNow()` carry that intent. An `open()` that fails on its own
  carries none and returns Connection work to Idle, so a consuming app that asks
  the Driver to connect gets one answer rather than a background retry it did
  not ask for.
- `checkAndReopen()` leaves the SDK. It made the decision the app is better
  placed to make, and made it without asking. The app composes the two public
  operations that already answer the question: `probe` says whether the
  connection still has a server behind it, and a `false` from `probe` is what
  calls `reopenNow()`. A `true` retains the Transport, and with it the Login,
  the DDP subscriptions and every request in flight, which is what replacing a
  healthy connection destroys.

### The Deadline on a Connection Attempt

- One absolute Deadline governs a Connection Attempt. It derives from
  `config.timeout`, it starts when Transport construction begins, and it spans
  the Transport connecting and the DDP handshake together. This replaces
  ADR-0003's rule for this one send, under which the handshake's Deadline
  started after its write and a Transport that never opened armed none.
- Transport-connection time is spent from the same budget. The handshake
  receives the time that is left, not a fresh `config.timeout`.
- A caller that joins an attempt inherits the remaining time. Joining neither
  starts nor resets a Deadline. A replacement attempt gets its own.
- The Deadline is armed before Transport construction is attempted, with
  `config.timeout`. The handshake is a send, and it is written when the Transport
  opens, so its own Deadline of the same `config.timeout` is armed strictly later
  than the attempt's. The attempt's Deadline therefore always expires first, and
  which of the two answers a handshake that hangs is structural rather than a
  race: it does not depend on the order two timers due at the same moment happen
  to run in.
- Expiry terminalizes the attempt and rejects every caller attached to it with
  `'[ddp] connection attempt did not complete before the deadline'`. A handshake
  response that expires afterwards finds an attempt that is no longer current
  and settles nobody.
- `timeout` therefore means what its documentation always said: how long the SDK
  waits before abandoning a connection, and how long a caller waits for a DDP
  response. Every other bound is unchanged, and one of them, `probe`, is
  deliberately not derived from it.

### What a caller observes

- One Connection Attempt owns one terminal outcome. Every caller attached when
  it terminalizes observes that outcome, at that moment.
- Success is the DDP handshake succeeding. Internal `open()` fulfils with
  `void`, Driver `connect()` fulfils with that Driver, and Driver `reopenNow()`
  fulfils with `void`. A call that retains an already usable Transport fulfils
  with its own value and creates no attempt.
- Callers that share an attempt share its outcome, not a Promise reference.
  Promise identity and Error identity are not contractual, and a spec that
  asserts either is asserting an implementation detail.
- The first terminal outcome wins. A later Transport callback, a late handshake
  response and a Deadline that rings afterwards cannot resettle a caller or
  regain authority.
- Any terminal failure rejects every attached caller at once. A Scheduled Reopen
  that follows is fresh Connection work: it neither fulfils the attempt that
  failed nor keeps that attempt's callers pending across attempts. A forced
  attempt from `reopenNow()` that fails rejects its callers and then enters one
  Scheduled Reopen, and those callers do not transfer to it.
- When `reopenNow()` supersedes an ordinary attempt, cancellation terminalizes
  the ordinary attempt before the forced one begins. Its callers reject with
  `'[ddp] connection attempt was superseded before it completed'` and do not
  transfer to the forced attempt. Only calls attached after the forced attempt
  begins observe its outcome.

### A DDP wait ends on the ownership change, not on the event

- A DDP wait belongs to the connection its message was issued on, and it ends
  when that connection stops being the Socket's. The transition itself settles
  the wait, synchronously, through `DDPRequests.abandonAll`, which holds every
  written wait and ends them all with the one message the transition names.
  Whatever lifecycle event follows is an observation of a transition that has
  already been made.
- `disconnected` is therefore retired. It existed only to carry that settlement
  out of `reopenNow`, and there is nothing left for it to carry. A replacement
  abandons the waits on its predecessor with the same Reopen-specific Abandoned
  wait as before, and the successor's `connecting` is not what caused it.
- The window ADR-0003 guarded stays guarded, and on the same reading. A `send`
  that resumes after waiting for the connection to open reads the Transport's
  own state rather than `connected`, because `connected` is bookkeeping and
  folds in `alive()`, which would abandon a send on a connection that is merely
  quiet and thereby suppress the Reopen for the one connection nobody is
  rebuilding.

### The rejections the SDK makes

Each wait the SDK can hold has a Deadline, and an expired Deadline rejects with
an Error the SDK writes.

- A failed write rejects with the error the Transport threw, unwrapped. It is
  the one rejection the SDK originates that carries a reason, and the exception
  is deliberate: the Transport knows why the write failed and the SDK does not,
  so a fixed message would discard the only description of the fault.
- `waitForOpen` has a default Deadline of `config.reopen * 2`. The multiplier is
  a measurement and not a margin for comfort: `reopen` is when the retry is
  scheduled, not when it has produced a connection, so at exactly `config.reopen`
  no Reopen can meet the Deadline.
- Every send has a Deadline on its DDP response, defaulting to `config.timeout`,
  starting after the write. The only other public surface is an optional
  per-send bound. A send issued while the Socket is not Transport open first
  waits out the wait on `open`, up to `config.reopen * 2`, and only then its own
  bound. The handshake is the one send this does not describe, because the
  attempt's absolute Deadline covers it from before the Transport existed.
- `ping` names its own bound and names `config.ping`. If that Deadline wins,
  `ping` reopens, so a pong that does not arrive causes the recovery it always
  had to cause. Bounding the pong by the ping interval keeps an app that is
  patient with a Method call from being slow to notice a dead pipe. A `pong`
  waits for nothing and arms no Deadline.
- `probe` keeps a default of 2000 ms that no option derives, and it takes that
  bound as an argument so a caller that wants another one passes it. `close`
  shares the same module constant under ADR-0015. `probe` answers whether a
  Socket in the gray zone still has a server behind it, and it has to settle
  faster than the wait it exists to diagnose. Bound to `config.timeout` it would
  grow with the wait it is meant to shorten, and an app that raised `timeout` to
  be patient with a Login would make its own liveness check slower. The two
  bounds answer opposite questions: `timeout` asks how long a caller will wait
  for an answer, and `probe` asks how long is too long to still call a
  connection alive.
- `waitForNotifyUserMediaSubs` takes its Deadline from `config.timeout`.
- A rejection the SDK decides on is a plain `new Error` with a fixed message. It
  does not go through `toError`, whose work is turning a server reason into an
  Error under ADR-0001, because here there is no server reason. The fixed
  messages are:
  - `'[ddp] connection attempt was superseded before it completed'`, for callers
    of an ordinary attempt that `reopenNow()` replaced.
  - `'[ddp] connection attempt did not complete before the deadline'`, for the
    absolute Deadline above.
  - `'[ddp] transport failed during the connection attempt'`, for a Transport
    failure with no reason to carry. A Transport `error` event is always one of
    these: it carries no actionable reason, so it fails the attempt with this
    message rather than with a description of a fault it does not describe. A
    thrown value that is not an `Error`, and a Transport lost while the attempt
    owned it, take the same message. Construction and write errors are the
    exception and keep their sourced reason.
  - `'[ddp] connection closed before it opened'`, for callers a close took the
    Socket from, and for `open()` and `reopenNow()` refused while a close owns
    it, under ADR-0015.
  - `'[ddp] connection reopened before the response arrived'`, for a DDP wait a
    replacement abandoned.
  - `'[ddp] connection closed before the response arrived'`, for a DDP wait
    ended by the connection it was written on closing, whether the consuming app
    asked for that close or the peer dropped it. A close is not a Reopen, and a
    caller retrying on the wrong one retries into a Socket that is gone.
  - `'[ddp] connection replaced before the message was written'`, for a send
    that waited for the connection to open and found another one in its place.
    A DDP session belongs to its connection: a Method call moved across would go
    out under an identity the caller never asked for, and a `sub` would go out
    under an id from a session that has ended.
  - `'[ddp] no response arrived before the deadline'`, for a DDP response the
    server never sent on a connection that stayed up.
- An actual sourced `Error` from Transport construction or from a write keeps
  its reason. Its object identity is not contractual.
- The rule for a wait a person adds later has three branches. A rejection with a
  server reason goes through `toError` under ADR-0001. A rejection with a reason
  from the Transport passes that error through. A rejection the SDK decides on,
  with no reason to carry, is a plain Error with a fixed message under this ADR.
  A wait that a connection going away abandoned is the one exception: it carries
  a subclass of `Error`, because the driver itself branches on it. It is a plain
  Error to every caller, and ADR-0004 still reads it as one, since the subclass
  is not a `DDPError` and carries no server reason. Internal subclasses may
  control recovery; none of them adds a public error type.
- An expired wait is deliberately not an Abandoned wait. No connection went
  away, so nobody has answered the fault, and the Liveness chain does reopen on
  it. An Abandoned wait has already been answered, by the ownership change that
  caused it, so the chain does not.
- A liveness wait ended by an ownership change asks for nothing. It does not
  request a Reopen and it does not re-arm the ping chain: whoever took ownership
  decides the recovery, and the handshake of whatever connection replaces this
  one starts the chain again. Only a genuine liveness failure, an expired wait
  or a write that failed, asks for a Reopen and keeps pinging. This is the whole
  of `recoverAndKeepPinging`, and it is why a forced replacement does not leave
  two chains pinging one Socket.
- The types carry this distinction in the value, so a caller and the chain read
  the same thing. `FailedConnectionAttempt` names the three terminal outcomes of
  a Connection Attempt. `AbandonedWait` names a wait the ownership change ended,
  and `AbandonedRequest` extends it with the id ADR-0006 reads. `ExpiredWait`
  names a Deadline that rang on a connection that stayed up. None of them sets a
  `name`, so every caller sees an ordinary `Error` and the message above, and
  none of them is a `DDPError`.

### Lifecycle events observe, and do not decide

- Socket `connecting` occurs once per Connection Attempt that has successfully
  constructed and attached its Transport. A construction failure, a joined
  caller, a retained usable Transport and a Scheduled Reopen on its own emit
  none.
- Socket `open` occurs once per Connection Attempt that completes the handshake,
  after Connection work has returned to Idle with the Transport retained.
- Driver emits exactly one `connected` per Socket `open`, and it stays the only
  lifecycle event Driver emits directly. Joined callers add no `open` and no
  `connected`.
- Socket `close` occurs once when the currently owned Transport supplies a close
  event, or when ADR-0015 has the Socket supply one for it. A Transport detached
  before it closes emits nothing.
- Before any lifecycle event, the Socket commits the authoritative state: the
  ownership, the Connection work, the attachment or detachment of the Transport,
  and any Scheduled Reopen the failure required. Listeners therefore observe a
  Socket that has already decided. Attached callers settle after the event.
  Listener order within one emission is not contractual.

## Consequences

- Two callers asking the same Socket to connect cost one Transport and share one
  answer. The ordinary `open()` race is gone, and with it the rejection that
  reported a close nobody requested.
- A connection that hangs while connecting now fails within `config.timeout`
  rather than never. This is the wait the option was documented to bound and did
  not.
- `reopenNow()` reports what happened. A caller learns that the connection
  opened, or receives the attempt's terminal rejection, where before it received
  `undefined` either way. A foreground resume can log a real failure and a VoIP
  call can fail rather than answering on a connection that is not there.
- A rejected forced attempt still leaves the Socket recovering. One Scheduled
  Reopen follows, and it repeats until a handshake succeeds or a close takes the
  Socket. The caller that was rejected is not revived by it, which is the point:
  its answer was already given.
- `checkAndReopen` disappears from Client, Driver and `IDriver` with no
  deprecated alias, so a consuming app that called it fails to compile rather
  than silently losing recovery. The replacement is two calls it already has.
  ADR-0003's note that `checkAndReopen` had to swallow `open`'s rejection no
  longer describes anything.
- `disconnected` disappears from the Socket's events. An app listening for it
  through `onStreamData` receives nothing, and the DDP waits it used to carry
  settle earlier and unconditionally, because the ownership change cannot fail
  to happen the way an emit can fail to reach a listener.
- ADR-0002's hardening of `emit` still matters for `open`, `connecting` and
  `close`, and it no longer stands between a send in flight and its rejection.
  That path does not go through the emitter any more.
- The `close` option leaves the public Socket options. It was documented,
  retained on the Driver's config and ignored by the Socket, which always used
  the 2000 ms constant. ADR-0015 keeps that bound and this ADR removes the
  option that pretended to move it.
- A spec asserting a rejection of this type asserts both halves, as ADR-0001
  established: that the value is an `Error`, and the message a caller reads. It
  does not assert which Promise object or which Error object a caller received,
  because sharing an outcome is the contract and sharing a reference is not.
- Results still do not cross a Reopen. `subscribe` turns each rejection into a
  resolved value under ADR-0012, and what an abandoned `sub` leaves behind is
  ADR-0006's. A Method call issued between a drop and the next open still fails,
  and the consuming app still decides whether to call again.
- Reading this ADR requires reading ADR-0015 for the one operation it does not
  govern. A close cancels Connection work, refuses more of it, and settles every
  caller attached to it, and it does so on terms that no Connection operation can
  supersede.
