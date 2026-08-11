# ADR-0003: SDK-originated rejections and the deadlines that raise them

**Status:** Accepted

**Succeeds:** ADR-0001

## Context

ADR-0001 governs one kind of rejection out of `Socket.send`: the one carrying a
DDP error the server sent. This one governs the other kind — the rejections the
SDK originates itself, where there is no server response and so no reason to
carry. The boundary between them is the subject of both ADRs, and the two do not
overlap: if a server-supplied reason is involved it is ADR-0001's, otherwise it
is this one's.

Three paths in `lib/drivers/ddp.ts` originated no rejection at all, and each one
left a caller holding a promise that could never settle.

A write that threw was logged and swallowed. `send` caught the transport's error
and returned nothing, so the promise stayed pending for the life of the process.

`waitForOpen` bounded its wait at `config.reopen`. But `reopen()` does not
reconnect at that interval — it *schedules* the retry there, so the reconnect only
begins as the deadline expires. A send issued at a drop therefore could not be
satisfied by the very reopen it was waiting for.

`ping` sent its ping while `connected` was still true, so the send never waited
on `open` — it waited on a pong reply. On a socket the server had stopped
answering, that wait had no bound, the `.catch(() => this.reopen())` behind it
never ran, and the ping chain stopped for good with the socket abandoned open.

A forced reconnect emits `disconnected` with no arguments, and `send` handed
`reject` to that event directly, so every in-flight send rejected with
`undefined`. Callers read `err.message` inside their own `catch` blocks, which
turned each of those into a TypeError thrown from a rejection handler. ADR-0002
made this fire for every in-flight send rather than for roughly half of them, so
it had to be settled here.

## Decision

Every wait the SDK can be left holding has a deadline, and expiring one rejects
with an Error the SDK wrote.

- A failed write rejects with the error the transport threw. The log line stays;
  the swallow does not.
- `waitForOpen`'s default deadline is `config.reopen * 2`, so it outlasts the
  reopen it is waiting on rather than expiring as that reopen begins. The
  multiplier is the measured relationship between the two, not a margin picked
  for comfort — at exactly `config.reopen` the deadline can never be met.
- `ping` races its send against a deadline of `config.ping` and calls `reopen()`
  when the deadline wins, so an unanswered pong reaches the reconnect it was
  always meant to trigger.
- That deadline lives in `ping`, not in `send`. A reply deadline on `send` would
  apply to every method call and subscription the consuming app makes, and the
  right bound for a login or a room history request is not the ping interval —
  nor is it the SDK's to choose. `ping` is the one caller that knows both what it
  is waiting for and what to do when it does not arrive.
- A rejection the SDK *decided on* — a Deadline expiring, a Reopen abandoning a
  wait — is a plain `new Error` with a fixed message. It does **not** go through
  `toError`: that helper's job is turning a server-supplied reason into an Error
  under ADR-0001, and there is no reason to turn here. A send abandoned by a
  reconnect rejects with
  `'[ddp] connection reopened before the response arrived'`.
- The failed write is the one exception, deliberately. It rejects with the error
  the transport threw, unwrapped, because unlike a Deadline it *has* a reason and
  that reason is the only description of what went wrong — the transport knows
  why the write failed and the SDK does not. Wrapping it in a fixed message would
  discard the one useful thing in the rejection.
- So the rule for paths added later has three branches: a rejection carrying a
  server-supplied reason goes through `toError` under ADR-0001; a rejection
  carrying a reason from the transport passes that error through; and a rejection
  the SDK decided on with no reason to carry is a plain Error with a fixed
  message under this one.

## Consequences

- Callers get a rejection where they used to hang. Three waits that could never
  settle now settle, and code that only ever handled the resolve path sees
  rejections it has never seen before.
- What a caller receives on a forced reconnect changed, from `undefined` to an
  Error. This is deliberate and visible: `err.message` inside a caller's `catch`
  was already the common shape, and it used to throw.
- `ping`'s deadline is `config.ping`, so a consumer tuning that option for
  liveness is also tightening how long a ping waits before the connection is
  reopened. The option's documentation says so at `interfaces/index.ts`.
- `send` still has **no** reply deadline, and this ADR does not give it one. A
  call on a socket that is open but dead — the server holding the connection and
  answering nothing — still hangs until something else, a close or the liveness
  chain, brings the connection down. That is a known gap, stated rather than
  papered over: fixing it means choosing a per-call bound, which is a separate
  decision about the SDK's public surface.
- Making the write reject opens a path that could not be reached before: `send`
  records a subscription in its map *before* it writes the `sub` frame, so a write
  that now rejects leaves an entry for a subscription the server was never told
  about. The bookkeeping defect is not new — the map is written ahead of the
  server's acknowledgement throughout — but this is a new way in, and it is
  tracked rather than fixed here.
- Specs that assert an SDK-originated rejection assert both halves the way
  ADR-0001 established — that it is an `Error`, and the message a caller will
  read — so a future change cannot quietly go back to rejecting with a bare
  value.
