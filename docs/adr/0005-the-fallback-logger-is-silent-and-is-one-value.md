# ADR-0005: The fallback logger is silent, and it is one value

**Status:** Accepted

## Context

`lib/log.ts` holds the logger an SDK object uses when its caller supplied none.
Every Socket and every Driver takes a `logger` option and falls back to this
module when the option is absent.

The module held two separate implementations of a logger that writes nothing. One
was the `InternalLog` class, instantiated once to be the initial value. The other
was an object literal that `silence()` built fresh on each call. The two had
already drifted. `InternalLog` returned `undefined` from each level and routed the
legacy `warn` through `warning`; the literal returned `null` and gave `warn` its
own empty body.

Neither implementation wrote anything, so `silence()` moved the module from one
silent logger to a different silent logger. The behaviour was correct and the
duplication was invisible, which is the reason it drifted.

The module had no spec. Nothing pinned that the fallback is silent, and nothing
pinned that `silence()` is the way back from `replaceLog`.

## Decision

One value, `silentLogger`, is the only logger in this module that writes nothing.
It is the initial value of `logger`, and `silence()` installs it. `InternalLog`
is deleted.

`silentLogger` is not exported. The module's public surface is unchanged:
`logger`, `replaceLog` and `silence`, with the signatures they already had. The
suite has its own recording logger for Sockets and Drivers, so nothing outside
this module needs the value, and a second exported `silentLogger` in the package
would be easy to import in place of that one by mistake.

The fallback stays silent. It is not a console logger.

- This SDK is a library embedded in a host app. The Driver logs at `error` in
  paths it also recovers from — a failed unsubscribe, a Reopen that will be
  retried. A console fallback puts that output in the terminal of an app that
  never asked for it, and the app cannot turn it off without importing
  `lib/log`.
- The consuming app already has the supported way to see this output: pass a
  `logger` to the Client, or call `replaceLog`. Rocket.Chat.ReactNative does.

## Consequences

- `silence()` and the initial value can no longer disagree, because they are the
  same value.
- A spec pins the fallback, the swap `replaceLog` performs, and the return trip
  through `silence()`.
- Anyone who finds this SDK silent about a failure is looking for the wrong
  thing. The fallback is silent on purpose. Supply a logger. Do not read the
  silence as a reason to make the fallback write to the console.
- `replaceLog` still mutates a module-level binding, and still offers no way to
  restore the logger that was there before. `silence()` returns to the fallback,
  not to the previous logger. This is unchanged and no caller needs more.
