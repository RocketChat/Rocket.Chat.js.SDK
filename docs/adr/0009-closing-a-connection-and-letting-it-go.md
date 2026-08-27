# ADR-0009: Closing a connection, and letting it go

**Status:** Accepted

**Succeeds:** ADR-0003

## Context

ADR-0003 governs the rejections the SDK makes and the Deadlines that cause them.
Ending a connection raises its own questions, and they are not questions about
what a caller receives: `close` promises only that the Socket has let its
Transport go.

A close is a request to the Transport, and the Transport may neither answer it
nor accept it. The Transport being closed may be one that never opened at all. A
close also runs while another Transport may already have taken the place of the
one being closed, and while a wait on the old Transport's `open` may still be
pending. Each of those cases leaves the Socket holding a Transport, a wait, or a
caller that never returns.

## Decision

The Socket bounds the close, and answers it itself when the Transport does not.

- `close` joins `probe` on the 2000ms bound ADR-0003 keeps out of reach of any
  option, from the module constant the two share. Unlike `probe` it does not take
  that bound as an argument: no caller reaches `close` through a signature that
  accepts one, and `close` settles either way, so there is no answer for a caller
  to vary its patience on.
- The close is bounded on the liveness question rather than the patience one for a
  reason of its own. The Transport `close` waits on may be one that never opened
  at all — a still-connecting Transport is closed and waited on the same way, and
  letting it go settles that open as an Abandoned wait rather than leaving it
  pending — and a stale ping cannot vouch for any of them, so the close may never
  be answered. Binding a logout's exit to `timeout` would make the app that
  raised it slowest to leave.
- On the Deadline the Socket becomes a Detached socket rather than one that keeps
  waiting on its Transport: a Transport the peer never releases costs less than a
  caller — a logout, a teardown, a Reopen — that never returns. This Deadline
  settles the wait rather than rejecting it, because `close` promises only that
  the Socket has let its Transport go, which is true either way.
- When the Transport neither answers nor accepts the close, the Socket answers
  itself by feeding a close event with the user-disconnect code through `onClose`,
  rather than emitting `close` directly. `onClose` therefore stays the sole owner
  of the identity guard, the emit, the Reopen decision — code 4000 skips the
  Reopen when the driver itself started the close, under ADR-0003 — and the log
  line, and an in-flight `send` learns its connection ended
  on the same event the Transport would have used.
- `close` does not unsubscribe. Closing the connection ends every stream on the
  server, so `close` forgets its DDP subscriptions locally and sends no `unsub`,
  unless a replacement Transport landed during the wait and something still
  answers for it, in which case the close is superseded under ADR-0003 and the
  entries that connection filled are left as they are.
  `logout` is the deliberate exception: it stays on the same connection, so it
  awaits its own `unsubscribeAll`.
- The reject of an open that has not landed yet is held per Transport, because a
  detach can run on an old Transport while the open of the one replacing it is
  still pending, and a single field on the Socket would settle the wrong wait. It
  is settled on a microtask, so a handshake rejection already in flight settles
  that wait first.

## Consequences

- A close settles whatever the Transport does, so a logout on a dead pipe leaves
  within the bound rather than waiting on a peer that never releases the
  Transport.
- The Socket may let go of a Transport the peer still holds open. It is then a
  Detached socket: that Transport's handlers are gone, so a late close event on it
  reaches nothing.
- Every close is announced once and through one path. A consumer sees the same
  `close` event, the same log line and the same Reopen decision whether the
  Transport answered or the Socket answered for it.
- A Socket the consuming app closed keeps no instruction to re-establish
  anything, and the per-entry rule ADR-0004 draws never runs on this path,
  because no DDP response can arrive to decide one.
- A send in flight on a closing connection is ended by the close event under
  ADR-0003, with the message that names a close rather than a Reopen.
