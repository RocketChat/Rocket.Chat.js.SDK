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

`send` wrote the DDP message to the Socket inside a `try` block. If that write
threw an error, `send` wrote a log line and returned nothing. The promise then
stayed open for the life of the process.

`waitForOpen` used a Deadline of `config.reopen`. But `reopen()` does not build a
new Socket at that interval. `reopen()` only schedules the retry at that
interval. Therefore the new Socket starts to open as the Deadline expires. A send
that a drop interrupted could not wait for the Reopen that the send needed.

`ping` sent its DDP message while `connected` was still true. That send therefore
did not wait for `open`. That send waited for the `pong`. On a Socket that the
server does not answer, this wait had no bound. The `.catch(() => this.reopen())`
behind the wait never ran. The Liveness chain stopped, and the Socket stayed open
and dead.

An immediate reconnect emits `disconnected` with no arguments, and `send` gave
`reject` to that event directly. Each send in flight therefore rejected with
`undefined`. Callers read `err.message` in their own `catch` blocks, and each of
those reads threw a TypeError. ADR-0002 makes this path run for each send in
flight, not for approximately one half of them. This ADR therefore settles the
value.

## Decision

Each wait that the SDK can hold has a Deadline. An expired Deadline rejects with
an Error that the SDK writes.

- A failed write rejects. The log line stays. The silent return does not.
- The default Deadline of `waitForOpen` is `config.reopen * 2`. This Deadline
  outlasts the Reopen that the send waits for: at exactly `config.reopen`, no
  Reopen can meet the Deadline.
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
  this ADR. A wait that a connection going away abandoned is the one exception: it
  carries a subclass of `Error`, because the driver itself branches on it. It is a
  plain Error to every caller, and ADR-0004 still reads it as one — the subclass is
  not a `DDPError` and does not carry a server reason.
- `send` ends its wait when the connection the message was issued on ends. A DDP
  response can only arrive on the connection its message went out on, so the wait
  ends on `disconnected`, `connecting` and `close`. A Reopen rejects with
  `'[ddp] connection reopened before the response arrived'`, and a close with
  `'[ddp] connection closed before the response arrived'` — a close is not a
  Reopen, and a caller retrying on the wrong one retries into a closed Socket.
- One window stays open to all three events: `send` attaches its listeners a
  microtask after `waitForOpen` resolves, so a connection lost in between is
  announced to nobody, and a guard at that point abandons the wait instead. The
  guard reads `readyState`, not `connected`: `connected` is bookkeeping the SDK
  updates when the events land, and in this window they have not landed, so only
  the transport knows whether the connection went away. Reading `connected` there
  also folds in `alive()`, which would abandon a send on a socket that is open and
  merely quiet — and, because an abandoned wait suppresses the Reopen, would
  suppress it for the one connection with nobody rebuilding it.
- `send` belongs to the connection that was current when it was called. If another
  connection has taken its place before the write, `send` rejects with
  `'[ddp] connection replaced before the message was written'`. A DDP session
  belongs to the connection that carries it. The replacement has a session of its
  own, and no Login on it yet, so a Method call moved to it is sent under an
  identity the caller did not ask for. A `sub` moved to it is worse: it is written
  under an id from a session that has ended.
- Whether `send` waits for the connection to open is decided on the transport's
  own state. A send on a Transport open Socket does not wait: it is written to
  that connection at once, and `waitForOpen` — the only Deadline in this path — is
  not reached. A send on a Socket that is not Transport open waits for the same
  connection to open, and its Deadline bounds it. Either way, the connection is
  read before the write.
- `reopenNow` and `waitForNotifyUserMediaSubs` take their Deadline from
  `config.timeout`. `probe` keeps a default of 2000ms that no option derives. This
  is deliberate, and it is the one Deadline in the driver that no option moves.
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
- `close` joins `probe` as a Deadline no option moves, and holds the same 2000ms
  bound. Unlike `probe` it does not take that bound as an argument: no caller
  reaches `close` through a signature that accepts one, and `close` settles either
  way, so there is no answer for a caller to vary its patience on. The bound is a
  module constant the two share. The socket it waits on may be one the transport
  never called open at all — a still-connecting socket is closed and waited on the
  same way, and letting it go settles that open as an Abandoned wait rather than
  leaving it pending — and a stale ping cannot vouch for any of them, so the close
  may never be answered. That is the liveness question `probe` asks, not the
  patience question `timeout` asks, and binding a logout's exit to `timeout` would
  make the app that raised it slowest to leave. On the Deadline the Socket becomes
  a Detached socket rather than one the driver keeps waiting on: a socket the peer
  never releases costs less than a caller — a logout, a teardown, a Reopen — that
  never returns. This Deadline settles the wait rather than rejecting it, because
  `close` promises only that the driver has let the connection go, which is true
  either way. When the transport neither answers nor accepts the close, the driver
  answers itself by feeding a close event with the user-disconnect code through
  `onClose`, rather than emitting `close` directly. `onClose` therefore stays the
  sole owner of the identity guard, the emit, the Reopen decision — code 4000
  skips the Reopen — and the log line, and an in-flight `send` learns its
  connection ended on the same event the transport would have used. `close` does
  not unsubscribe. Closing the connection ends every stream on the server, so
  `close` forgets its DDP subscriptions locally and sends no `unsub`. `logout` is
  the deliberate exception: it stays on the same connection, so it awaits its own
  `unsubscribeAll`. The reject of a not-yet-open Socket is held per Socket, because
  a detach can run on an old Socket while a newer open is still pending, and a
  single field would settle the wrong wait. It is settled on a microtask, so a
  handshake rejection already in flight settles that wait first.

## Consequences

- Callers get a rejection instead of a wait that never ends. Three such waits
  settle, so code that handles only the success path gets rejections it has never
  seen.
- What a caller gets from an immediate reconnect is an Error, not `undefined`.
  This change is deliberate and visible. Callers already read `err.message` in
  their `catch` blocks, and that read threw when the rejection was `undefined`.
- The Deadline of `ping` is `config.ping`. A consuming app that lowers that option
  for the Liveness chain therefore also lowers the bound on the wait for the
  `pong`. The documentation of the option says this at `interfaces/index.ts`.
- `send` has **no** Deadline for the DDP response, and this ADR does not give
  `send` one. A Method call on a Socket that is open and dead does not wait on a
  timer. Something else must end that wait: a close, or the Liveness chain. Nothing
  here bounds a Method call on a connection that stays up and stays silent.
- Rejections reach the two places that Reopen on a failure — `ping` and the retry
  inside `reopen`. A close would rebuild the Socket the caller had just closed,
  and a Reopen would queue a second Reopen behind the one already under way. An
  abandoned wait therefore carries its own Error type, and both places Reopen on
  every rejection except that one: a connection that went away has already been
  answered, by `onClose` or by the replacement itself, and only a failure that
  leaves nobody rebuilding it asks for a Reopen. The type is unexported and sets
  no `name`, so a caller that receives one — the rejection does reach callers,
  through `open()` — sees an ordinary Error and the message above. It adds no
  public surface because nothing about it is observable, not because it stays
  inside the driver.
- The handshake is the one send with no caller of its own, and `createConnection`
  waits on it through `onOpen`. Ending its wait therefore has to settle that wait
  too — `onOpen` rejects the connection it was opening, rather than trading a
  stranded send for a stranded `open()`. `open` can reject, so `checkAndReopen`,
  which opens without awaiting, handles that rejection rather than raising it to
  the global handler of the app.
- A failed write of a `sub` DDP message leaves an entry in the subscription map.
  `send` writes that map before `send` writes to the Socket, and the write can
  reject, so the map can hold an entry for a DDP subscription that the server
  never received. This fault in the bookkeeping is not new, because `send` writes
  the map ahead of the answer of the server in each case. But the failed write is
  a new way to reach the fault. A separate issue tracks the fault, and this ADR
  does not correct it.
- Results do not cross a Reopen; the caller receives a rejection. `subscribe`
  turns each rejection into `undefined` and `unsubscribeAll` ignores each one, so
  the DDP subscription paths do not change for a caller. A Method call issued in
  the window between a drop and the next open fails: the consuming app decides
  whether to call again. Without the rejection, it has no basis for that
  decision.
- A spec that asserts a rejection of this type asserts both halves, in the way
  that ADR-0001 established. The spec asserts that the value is an `Error`, and
  the spec asserts the message that a caller reads. A later change therefore
  cannot return to a rejection with a bare value.
