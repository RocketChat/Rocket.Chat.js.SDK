# ADR-0006: `index.ts` is the only public surface

**Status:** Accepted

## Context

The package ships TypeScript source. `package.json` sets `main` to `index.ts`,
declares no `exports` map and no `files` list, so every path in the repository is
resolvable by a consuming app. `index.ts` itself exports two symbols, `settings`
and `Rocketchat`. Nothing else is named there, and nothing stops a consuming app
reaching past it.

Rocket.Chat.ReactNative does reach past it, importing `DDPDriver` and `Socket`
from `@rocket.chat/sdk/lib/drivers/ddp`. That is a fact about the other
repository, and nothing here can observe it or keep it true.

The repository has also built for the practice. `clients/Rocketchat.ts` is a
one-line re-export over a module whose only export is a default, so it forwards
nothing, and no file in this repository imports it. It exists only to give a
consuming app the deep path `@rocket.chat/sdk/clients/Rocketchat`.

Because no line was drawn, no change to a module under `lib/` could be judged.
Deleting the unused `debounce` helper from `lib/util.ts` was answerable only by
grepping the consuming app, and the same grep would be needed for every internal
symbol a refactor touches. ADRs 0001 through 0005 all revise internals a
consuming app can reach today — the rejection rules, the emitter, the deadlines,
the subscription queue. Treating what is reachable as what is supported would
make each of those a breaking change.

## Decision

`index.ts` is the only public surface. Anything not exported from it is
internal, and changing or removing it is not a breaking change.

- Making something public means adding it to `index.ts`. A deep path is never
  the way, whatever it resolves to.
- `clients/Rocketchat.ts` is deleted. A file whose only purpose is to serve a
  deep path is the practice this ADR bans, and it forwards nothing.
- Rocket.Chat.ReactNative is expected to import `index.ts` and nothing else.
  Its remaining deep imports of `lib/drivers/ddp` are what the retirement below
  clears, and the `exports` map is what makes the expectation true. No exception
  is written here, because this repository could not tell whether one still held.
- The rule is unenforced convention until an `exports` map exists. Stating it
  changes what a reviewer may rely on, not what the resolver permits.

## Consequences

- A driver refactor no longer needs a survey of the consuming app. Whether a
  symbol is public is read off `index.ts`.

- Retiring the remaining deep imports takes three steps in order, and only the
  last makes the rule real:

  1. Widen `index.ts`. `ISocket` and `IDriver` in `lib/drivers/index.ts` are
     already the contracts for the realtime layer, and re-exporting them with
     `Protocols` and the DDP driver gives those imports a public path.
  2. Move Rocket.Chat.ReactNative onto that path.
  3. Add an `exports` map to `package.json`. This is the step that turns the
     convention into resolution, and it breaks any consuming app still on a
     deep path when it lands.

  Step 3 needs its own verification: an `exports` map over raw `.ts` with `main`
  at `index.ts` has to be checked against both Metro and `tsc`, which resolve it
  differently from Node.

- Until then a deep import still resolves and still compiles. Nothing reports
  one, so the rule holds only as long as review keeps it.
