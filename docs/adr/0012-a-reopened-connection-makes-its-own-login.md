# ADR-0012: A reopened connection makes its own Login

**Status:** Accepted

## Context

A Reopen builds a new connection, and the DDP session the previous one carried
is gone with it. The Login has to be made again on the new connection, and the
Resume token the Socket holds is the only thing that makes that possible.

The Socket stopped doing so years ago, and nothing else inside the SDK does it
either, so a reopened connection stayed anonymous until the consuming app logged
in again. `loggedIn` did not report that: it read the token, which survives every
connection, so an anonymous reopened session claimed to be logged in. A `sub`
sent in that window is refused, and under ADR-0004 a refused resubscribe forgets
the entry it was meant to restore.

## Decision

The Socket makes the Login itself when a connection opens holding a token, and
`loggedIn` reports the Login rather than the token.

- The Resume is made from `onOpen`, after the handshake, so it runs on a
  connection the server has answered.
- `open` does not wait on it. A websocket callback has nowhere to put a throw, and
  a Login the server never answers would otherwise stall every caller of `open` —
  a Reopen among them — behind a wait no Deadline in ADR-0003 covers. A Resume
  that fails is logged and nothing else; the connection stands.
- `loggedIn` is `connected && loginConfirmed`, where the flag is set when a Login
  resolves and cleared wherever the identity it stands for ends: a new connection,
  a close, a logout. It therefore reports the connection in front of it, not the
  token, and reads `false` for the window between an open and its Resume.

## Consequences

- `loggedIn` reports `false` during the Reopen window, where it previously
  reported `true`. Nothing in the SDK reads it, but ADR-0007 notes that
  Rocket.Chat.ReactNative reaches into the Socket and types it loosely, so a gate
  built there on the old meaning changes behaviour without failing to compile.
- `open` resolves and `open` is emitted before the Resume lands, so the window
  ADR-0004 penalises is narrowed rather than closed. A caller that resubscribes
  on `open` is still resubscribing anonymously; closing that gap means gating the
  subscribe on `loggedIn`, which this decision does not do.
- A consuming app that dispatches its own login from a connected handler now
  makes a second Login on the same connection. The server accepts both.
- The Login carries `subscribeAll` with it, so the SDK's own resubscribe after a
  Reopen runs behind a confirmed Login rather than in front of one.
