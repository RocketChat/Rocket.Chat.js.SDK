# ADR-0005: The shared modules export only what is read

**Status:** Accepted

## Context

`lib/settings.ts`, `lib/util.ts` and `lib/message.ts` are the SDK's three
shared modules. Each advertised more surface than anything consumes, and all of
the excess dates from before this fork removed Livechat and Bot.

`lib/settings.ts` exported eleven mutable bindings, ten of them derived from
`process.env` at import time. Only Custom headers had a reader: the API client
spreads it into its request headers, and the Socket passes it to the transport at
construction. The Login credentials, the Integration id, the Room and DM cache
bounds and the `host`/`useSsl`/`timeout` trio had no reader in this repo and none
in the consuming app. They were not merely unused but contradicted: the Socket
defaults `host`, `useSsl` and `ping` from its own constructor options, the API
client defaults `host` inline, and `settings.timeout` held 20000 against two live
defaults of 10000. A reader asking what configures this SDK got eleven answers,
ten of them wrong.

Reading `process.env` at import time is also the wrong shape for the one consumer
this fork has. A consuming app compiles this SDK from source into a React Native
bundle, where `process.env` is a build-time shim rather than an environment.

`lib/util.ts` exported `debounce` and its `Procedure` type, which nothing calls.
`lib/message.ts` typed its second constructor argument as `any`, so nothing
described the fields a Message accepts, and the compiler treated the result as a
verified `IMessage`.

## Decision

Each of the three modules declares exactly the surface that is read.

- `lib/settings.ts` exports Custom headers and nothing else. The module reads no
  environment variable. Every removed binding was published, so this narrows the
  package's public surface; each one had no reader in the SDK and no reader in the
  consuming app, which is what makes the removal safe rather than merely tidy.
- Custom headers stays an `export let` typed as `{}`. Both halves are
  load-bearing and neither is an oversight. The binding is mutable because the
  consuming app assigns it and the SDK reads it back through the module namespace
  at call time, which is also the seam the specs replace. The type is wide because
  the app assigns an interface-typed object; an index signature such as
  `Record<string, string>` would reject it, since TypeScript infers an implicit
  index signature for object literal types but not for interfaces.
- `lib/util.ts` exports `hostToWS`.
- `lib/message.ts` types its fields as `IMessageFields`, naming the room a
  Message is addressed to and the Integration that traces an automated send.
  The `bot` field and `integrationId` stay. Removing them was considered when
  this fork dropped Bot and declined, on the grounds that they are how the
  server traces an automated send rather than Bot client code, and that decision
  is not reopened here — the change is only that the accepted fields are now
  stated in types instead of hidden behind `any`.

## Consequences

- A future architecture review should not re-add environment-derived settings to
  `lib/settings.ts`. Configuration reaches the Driver and the API client as
  constructor options, which is where their defaults already live.
- `Object.keys` over the settings module is pinned by a spec, so a new export
  fails the suite rather than passing unnoticed.
- Custom headers remains a single binding shared by every Client in the process,
  so two Clients cannot carry different headers. Moving it behind the Client
  would be the deeper fix and would break the consuming app, which assigns the
  binding directly in several places. It is left for a coordinated change.
- `Message` is still a class carrying no behaviour beyond assigning its fields,
  and still relies on declaration merging with an empty interface to borrow
  `IMessage`'s fields. The API client both constructs it and annotates a return
  type with it, so replacing it with a function returning `IMessage` is a change
  to that module rather than to this one.
- The lint ledger in `.oxlintrc.json` still carries a `no-this-alias` entry for
  the deleted `debounce` helper, and its warning total is one higher than the
  code now produces. Lint gates on errors, so nothing fails; the entry is stale
  and clears with a separate change.
