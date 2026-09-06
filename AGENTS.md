# Rocket.Chat.js.SDK

Node/TypeScript SDK for Rocket.Chat. Ships as TypeScript source (`main` is `index.ts`) — there is no build step; consumers compile it. Rocket.Chat.ReactNative is this `-mobile` fork's only official consumer. The app is offline-first.

## Mobile lifecycle

Mobile operating systems suspend the app in the background and may terminate it after some time without allowing a clean SDK shutdown. When the app returns to the foreground or restarts, its SDK connection state may be stale. Treat recovery from stale connection state as normal operation.

## Architecture

`IDriver` in `lib/drivers/definitions.ts` defines the public Driver contract — read it before touching the driver.

Config spreads into the REST base, `Driver` and `Socket`. Only `Socket` re-picks the keys it knows; `Driver` keeps the whole spread on its public `config`, so an unrecognized option silently reaches the driver — check that when adding one.

`lib/settings.ts` only exports `customHeaders`, a mutable module global read by the socket and REST layers.

## Tests

The DDP driver suite (`lib/drivers/__tests__/`) is a pinning suite — it locks current behavior, quirks included.

The websocket seam is `universal-websocket-client`. Never assign a socket onto the driver; mock the module, let the driver construct the fake on its normal path, and reach it through `fakeSockets`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `RocketChat/Rocket.Chat.js.SDK`, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels, used verbatim. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Coding standards

`CODING_STANDARDS.md` at the repo root. Read it before writing code.
