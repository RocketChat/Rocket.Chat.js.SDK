# ADR-0008: The websocket reference directive stays

**Status:** Accepted

## Context

Line 1 of `lib/drivers/socket.ts` is a triple-slash directive:

```ts
/// <reference path="../../types/websocket.d.ts" />
```

`types/websocket.d.ts` is a hand-written `declare module 'universal-websocket-client'`
block. It is an ambient module declaration, and an ambient module declaration is
not a value or a type that any file can import. There is no ESM import that
replaces this directive, because there is nothing in that file to import. The
directive is the only form the reference can take.

The directive also does work that this repo cannot see. This SDK ships as
TypeScript source — `main` is `index.ts`, there is no build step, and the
consuming app compiles `lib/drivers/socket.ts` itself. This repo's own
`tsconfig.json` declares no `include`, so it globs the whole repo and picks
`types/websocket.d.ts` up whether the directive is there or not. The consuming
app's `tsconfig.json` globs the app's own sources; it will never glob a
declaration directory inside one of its dependencies. The directive is what
carries the declaration across that boundary: the compiler follows it out of
`socket.ts` and loads the declaration into the app's program.

So deleting the directive is invisible here and fatal there. `npm run typecheck`
in this repo passes either way. Rocket.Chat.ReactNative fails, with
`universal-websocket-client` resolving to an implicit `any` under `strict`. CI
for this repo cannot observe the regression it just shipped.

The oxlint rule `triple-slash-reference` flags exactly this line. It also flags
the same shape in `lib/emitter.ts`, which references `types/events.d.ts` for the
same reason.

## Decision

The directive stays, and the rule that flags it stays at `warn`.

- `lib/drivers/socket.ts` keeps its reference directive. It is not replaced with
  an import, and it is not deleted.
- `triple-slash-reference` is pinned at `warn` in `.oxlintrc.json`. At `error` it
  would fail the lint on a line that must not change, and the only ways to make
  the lint pass would be to break the consuming app or to add a suppression
  comment for a permanent condition.
- The single warning is expected to stay for as long as the declaration is
  hand-written and the SDK ships as source. It is not a backlog item.

## Consequences

- Lint output for this repo is never empty. Three warnings are the clean state:
  `triple-slash-reference` on `lib/drivers/socket.ts` and `lib/emitter.ts`, and
  `no-unsafe-declaration-merging` on `lib/message.ts`. A fourth is not, and is
  worth reading, because no other file has a reason to reference a declaration
  this way or to merge an interface into a class.
- Anything that mechanically modernises directives into imports — a codemod, a
  lint autofix, an agent tidying line 1 — breaks the consuming app and passes
  every check in this repo. Read this ADR before accepting such a change.
- The directive stops being load-bearing on either of two changes: the SDK
  starting to ship built output with its own declarations, or
  `universal-websocket-client` shipping types good enough to drop
  `types/websocket.d.ts`. Until one of those happens, the coupling to the
  consuming app's compile is real and undetectable from here.

## The other standing warning: `no-unsafe-declaration-merging`

`lib/message.ts` declares `export interface Message extends IMessage {}` next to
`export class Message implements IMessage`, so the interface merges into the
class and the class inherits `IMessage`'s members without restating them. That is
the documented workaround for
[TypeScript issue 340](https://github.com/Microsoft/TypeScript/issues/340), and
`no-unsafe-declaration-merging` flags exactly it.

The rule stays at `warn` for the same reason `triple-slash-reference` does: at
`error` it would fail the lint on a line that is correct as written, and the only
way to pass would be an inline suppression for a permanent condition. This repo
has no inline suppressions and no test-file overrides — specs lint under the same
rules — so the two standing warnings are the whole warning budget.
