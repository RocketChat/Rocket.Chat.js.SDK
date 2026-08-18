# ADR-0007: Four realtime layers, and the names their fields carry

**Status:** Accepted

## Context

Three words were in play for the realtime side — Driver, Socket and DDP — and
none of them predicted the type of the field it named.

`Driver.ddp` holds a `Socket`. `RocketChatClient.ddp` holds a `Driver`. The same
field name, one level apart, holds two different types, so `client.ddp.ddp` is
the Socket and reading a call site does not tell you which layer you are on.
`RocketChatClient` also declared `implements ISocket`, claiming to be the very
thing CONTEXT.md says a Client is not.

DDP is the odd word of the three. In CONTEXT.md it is only ever a qualifier on
wire vocabulary — DDP message, DDP response, DDP error, DDP subscription — and
never a name for an object. In the code it names two objects, neither of which
is the protocol: CONTEXT.md reserves `ddp` as a qualifier while `Driver.ddp`
still exists.

Underneath that, the glossary was one layer short. It defined Socket as "the raw
websocket inside a driver", which the class is not: `Socket` performs the DDP
handshake, answers pings, holds `subscriptions` and `lastPing`, and *owns* a raw
websocket as `connection`. The rest of CONTEXT.md already read the other way —
*Transport open*, *Liveness chain*, *Probe*, *Detached socket*, *Connected echo*
and *Reopen* all treat a Socket as the DDP layer that owns a transport. One
parenthetical disagreed with five entries and with the code.

The layers behave very differently. A Driver reconnects, tracks DDP
subscriptions and speaks method calls; a Socket opens, closes and carries
frames. Code that reaches the wrong one compiles and misbehaves at runtime.
Rocket.Chat.ReactNative already reaches across the boundary, so the naming is
load-bearing outside this repo.

## Decision

The realtime side is four layers deep — Client, Driver, Socket, Transport — and
each one is a defined term with a field named after it.

- **DDP stays a qualifier on wire vocabulary.** No object is named `ddp`. The
  protocol qualifies messages, responses, errors and subscriptions; it does not
  name a layer.
- **`Driver.ddp` becomes `private readonly socket: Socket`.** It holds a
  `Socket`, which is a defined domain term. Private because nothing in the
  consuming app's production code needs it: the Driver already forwards every
  member that app reaches for — `connected`, `checkAndReopen`, `reopenNow`,
  `probe`, `lastPing`, `pingInterval`, `config` and `waitForNotifyUserMediaSubs`.
  The only readers below the Driver are tests, in this repo and in the app, and
  they keep both access and types through `driver['socket']`, which TypeScript
  permits on a private member. `private` is compile-time only, so runtime
  behaviour and the loosely-typed consumer are unaffected.
- **`RocketChatClient.ddp` becomes `driver`.** A Client owns a Driver.
- **`RocketChatClient` drops `implements ISocket`.** A Client is not a Socket.
  No `IClient` until something needs to type against one.
- **`ISocket` keeps its name.** A Driver presenting the same realtime surface by
  delegation is ordinary delegation, not a reason to rename the interface.
- **No deprecation alias.**
- **Transport is named.** The raw websocket a Socket owns gets a term of its own,
  so the layer below the Socket can be discussed without borrowing the word
  above it.

Rejected: `#socket` for the Driver's field, which breaks bracket access and
would force test rewrites in both repos for no gain against accidental reach;
and an `/** @internal */` tag alone, which enforces nothing.

## Consequences

- CONTEXT.md's Realtime section names all four layers, and no entry contradicts
  another about which layer owns the websocket.
- The renames are a breaking change for Rocket.Chat.ReactNative, which reads
  both fields by name — `sdk.current?.ddp` for socket health and call recovery,
  and `driver.ddp.open()` / `.subscriptions` / `.lastPing` / `.send()` in its
  integration tests. That app types this SDK through a loose module declaration,
  so a rename does not fail at compile time; it fails at runtime as `undefined`.
- The app's integration tests move to bracket access for the Socket, so the
  rename touches one more file there than the field count suggests.
- `connection` stays the Socket's field name for the Transport it owns. The
  glossary term and the field name differ, which is the one place the four-layer
  vocabulary is not carried into the code; renaming it is not part of this
  decision.
- Deleting the `clients/Rocketchat.ts` re-export removes the deep-import path
  `@rocket.chat/sdk/clients/Rocketchat`. Nothing in this repo or in
  Rocket.Chat.ReactNative uses it, and it carried no default export, so the
  root import is unaffected.
- The three renames land together in a single SDK PR so the vocabulary arrives in
  one piece, and the app's pin moves in its own PR.
