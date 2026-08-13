# ADR-0006: `index.ts` is the only public surface

**Status:** Accepted

## Context

The package ships TypeScript source. `package.json` sets `main` to `index.ts`,
declares no `exports` map and no `files` list, so every path in the repository is
resolvable by a consumer. `index.ts` itself exports two symbols, `settings` and
`Rocketchat`. Nothing else is named there, and nothing stops a consumer reaching
past it.

Consumers do reach past it. Rocket.Chat.ReactNative takes `Socket` and
`DDPDriver` from `@rocket.chat/sdk/lib/drivers/ddp` in two files,
`app/lib/services/ddpSocket.test.ts` and
`app/lib/services/__tests__/socketHealth.integration.test.ts`. Both are tests;
no application code deep-imports. `interfaces/` and `clients/` are equally
reachable and are not currently reached.

Because no line was drawn, no change to a module under `lib/` could be judged.
Deleting the unused `debounce` helper from `lib/util.ts` was answerable only by
grepping the consumer, and the same grep would be needed for every internal
symbol a refactor touches. ADRs 0001 through 0005 all revise driver internals —
the rejection rules, the emitter, the deadlines, the subscription queue — which
is exactly the code a consumer can reach today. Treating what is reachable as
what is supported would make each of those a breaking change.

## Decision

`index.ts` is the only public surface. Anything not exported from it is
internal, and changing or removing it is not a breaking change.

- Making something public means adding it to `index.ts`. A deep path is never
  the way, whatever it resolves to.
- Rocket.Chat.ReactNative's use of `@rocket.chat/sdk/lib/drivers/ddp` in the two
  files above is a named exception, recorded so it is not mistaken for support.
  It is the only one.
- The rule is unenforced convention until an `exports` map exists. Stating it
  changes what a reviewer may rely on, not what the resolver permits.

## Consequences

- A driver refactor no longer needs a survey of the consumer. Whether a symbol
  is public is read off `index.ts`.

- Retiring the exception takes three steps in order, and only the last makes the
  rule real:

  1. Widen `index.ts`. `ISocket` and `IDriver` in `lib/drivers/index.ts` are
     already the contracts for the realtime layer, and re-exporting them with
     `Protocols` and the DDP driver gives the two test files a public path.
  2. Move Rocket.Chat.ReactNative onto that path.
  3. Add an `exports` map to `package.json`. This is the step that turns the
     convention into resolution, and it breaks any consumer still on a deep
     path when it lands.

  Step 3 needs its own verification: an `exports` map over raw `.ts` with `main`
  at `index.ts` has to be checked against both Metro and `tsc`, which resolve it
  differently from Node.

- Until then a deep import still resolves and still compiles. Nothing reports
  one, so the exception list is kept by hand.
