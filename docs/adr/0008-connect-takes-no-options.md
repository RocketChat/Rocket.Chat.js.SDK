# ADR-0008: Connection config is constructor-only; `connect()` takes no options

**Status:** Accepted

## Context

`Driver.connect` accepted an `options` argument. Nothing read it: the Socket's
config comes from the Driver's constructor, and the argument's only appearance
in the body was spread into the `[driver] Connecting` log line. A caller could
pass `connect({ timeout: 1000 })` and get the constructor's timeout, with the
log line claiming otherwise.

It was not always inert. Before the Socket took ownership of the Deadline on
its own open, the merged `config.timeout` drove the Deadline connect rejected
on, so the argument did something and the signature made sense. Once the
Socket owned that wait, the parameter kept its shape and lost its effect — the
worst state for an API surface, because the type checker endorses a call that
does nothing.

`Client.connect(options)` had the same shape one layer up, with the same
absence of effect: its options stopped at the Client.

## Decision

Connection configuration is constructor-only. `Driver.connect()` takes no
arguments, `IDriver.connect()` in `lib/drivers/definitions.ts` declares none,
and `Client.connect()` drops its parameter too. If a caller wants different
connection settings, it constructs a Driver — or a Client — with them.

## Consequences

- The realtime layer's connect contract is one line: ask the Driver to connect
  and it connects with the config it was built with. There is no per-call
  override to document, test, or misleadingly log.
- Passing options to `Client.connect` is a type error rather than a silent
  no-op. The consuming app already calls it with no arguments everywhere, so
  the narrowed signature breaks nothing.
- The constructor's timeout readback in `Driver.config` remains the only path
  by which a timeout reaches the Socket.
