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

`Client.connect(options)` has the same shape one layer up and keeps it: the
Client is a public convenience wrapper, and removing its parameter was
considered and declined as out of scope here. Its options stop at the Client.

## Decision

Connection configuration is constructor-only. `Driver.connect()` takes no
arguments, and `ISocket.connect()` in `lib/drivers/definitions.ts` declares
none. If a caller wants different connection settings, it constructs a Driver
with them.

`Client.connect(options)` keeps its parameter, now optional and ignored, forwarding as
`this.ddp.connect()`.

## Consequences

- The realtime layer's connect contract is one line: ask the Driver to connect
  and it connects with the config it was built with. There is no per-call
  override to document, test, or misleadingly log.
- `Client.connect(options)` now accepts options that observably do nothing.
  That surprise is the cost of keeping the Client's surface stable, and this
  record is where it is explained; removing the Client's parameter is open
  follow-up work.
- The constructor's timeout readback in `Driver.config` remains the only path
  by which a timeout reaches the Socket.
