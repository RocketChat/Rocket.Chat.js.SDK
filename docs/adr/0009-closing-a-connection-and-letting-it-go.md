# ADR-0009: Closing a connection, and letting it go

**Status:** Accepted

**Succeeds:** ADR-0003

## Context

ADR-0003 governs the rejections the SDK makes and the Deadlines that cause them.
Ending a connection raises its own questions, and they are not questions about
what a caller receives: `close` promises only that the driver has let the
connection go.

A close is a request to the transport, and the transport may neither answer it
nor accept it. The socket being closed may be one the transport never called
open at all. A close also runs while another connection may already have taken
the place of the one being closed, and while a wait on the old socket's `open`
may still be pending. Each of those cases leaves the driver holding a socket, a
wait, or a caller that never returns.

## Decision

The driver bounds the close, and answers it itself when the transport does not.

- `close` joins `probe` on the 2000ms bound ADR-0003 keeps out of reach of any
  option, from the module constant the two share. Unlike `probe` it does not take
  that bound as an argument: no caller reaches `close` through a signature that
  accepts one, and `close` settles either way, so there is no answer for a caller
  to vary its patience on.
- The close is bounded on the liveness question rather than the patience one for a
  reason of its own. The socket `close` waits on may be one the transport never
  called open at all — a still-connecting socket is closed and waited on the same
  way, and letting it go settles that open as an Abandoned wait rather than
  leaving it pending — and a stale ping cannot vouch for any of them, so the close
  may never be answered. Binding a logout's exit to `timeout` would make the app
  that raised it slowest to leave.
- On the Deadline the Socket becomes a Detached socket rather than one the driver
  keeps waiting on: a socket the peer never releases costs less than a caller — a
  logout, a teardown, a Reopen — that never returns. This Deadline settles the
  wait rather than rejecting it, because `close` promises only that the driver has
  let the connection go, which is true either way.
- When the transport neither answers nor accepts the close, the driver answers
  itself by feeding a close event with the user-disconnect code through `onClose`,
  rather than emitting `close` directly. `onClose` therefore stays the sole owner
  of the identity guard, the emit, the Reopen decision — code 4000 skips the
  Reopen — and the log line, and an in-flight `send` learns its connection ended
  on the same event the transport would have used.
- `close` does not unsubscribe. Closing the connection ends every stream on the
  server, so `close` forgets its DDP subscriptions locally and sends no `unsub`.
  `logout` is the deliberate exception: it stays on the same connection, so it
  awaits its own `unsubscribeAll`.
- The reject of a not-yet-open Socket is held per Socket, because a detach can run
  on an old Socket while a newer open is still pending, and a single field would
  settle the wrong wait. It is settled on a microtask, so a handshake rejection
  already in flight settles that wait first.

## Consequences

- A close settles whatever the transport does, so a logout on a dead pipe leaves
  within the bound rather than waiting on a peer that never releases the socket.
- The driver may let go of a socket the peer still holds open. That socket is
  Detached: its handlers are gone, so a late close event on it reaches nothing.
- Every close is announced once and through one path. A consumer sees the same
  `close` event, the same log line and the same Reopen decision whether the
  transport answered or the driver answered for it.
- A Socket the consuming app closed keeps no instruction to re-establish
  anything, and the per-entry rule ADR-0004 draws never runs on this path,
  because no DDP response can arrive to decide one.
- A send in flight on a closing connection is ended by the close event under
  ADR-0003, with the message that names a close rather than a Reopen.
