# ADR-0003: Rejections that the SDK makes, and the Deadlines that cause them

**Status:** Accepted

**Succeeds:** ADR-0001

## Context

ADR-0001 governs one type of rejection from `Socket.send`. That type carries a
DDP error that the server sent. This ADR governs the other type, which the SDK
makes itself. For that type there is no DDP response, and therefore there is no
server reason to carry. The two ADRs do not overlap. If a server reason is part
of the rejection, ADR-0001 applies. If not, this ADR applies.

Three waits in `lib/drivers/ddp.ts` made no rejection at all. Each of the three
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
- Rejections now reach the two places that Reopen on a failure — `ping` and the
  retry inside `reopen` — that never reached them before. A close would rebuild
  the Socket the caller had just closed, and a Reopen would queue a second Reopen
  behind the one already under way. So an abandoned wait carries its own Error
  type, and both places Reopen on every rejection except that one: a connection
  that went away has already been answered, by `onClose` or by the replacement
  itself, and only a failure that leaves nobody rebuilding it asks for a Reopen.
  The type is internal to the driver, so this adds no public surface either.
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
- A spec that asserts a rejection of this type asserts both halves, in the way that
  ADR-0001 established. The spec asserts that the value is an `Error`, and the spec
  asserts the message that a caller reads. A later change therefore cannot return
  to a rejection with a bare value.
