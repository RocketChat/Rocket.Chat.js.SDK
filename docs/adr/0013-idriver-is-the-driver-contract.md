# ADR-0013: IDriver is the Driver contract

**Status:** Accepted

**Succeeds:** ADR-0007

## Context

ADR-0007 established four realtime layers — Client, Driver, Socket and
Transport — but kept `ISocket` as the name of the Driver contract. That name
describes the wrong layer and makes the public types contradict the domain
language. `IDriver` now describes the complete contract, while `ISocket` adds no
behaviour of its own.

## Decision

The realtime layers and their fields remain as ADR-0007 established:

- A Client owns a Driver in `driver`.
- A Driver owns a private Socket in `socket`.
- A Socket owns a Transport in `connection`.
- DDP remains a qualifier on wire vocabulary rather than the name of an object.

`IDriver` is the sole public Driver contract. `ISocket` is removed rather than
retained as an alias. The SDK does not preserve deep imports of the old type.

## Consequences

- The public contract names the layer it describes, leaving callers and tests
  one interface to learn.
- A consumer importing `ISocket` must replace it with `IDriver`. The known
  consuming app has no such import.
- Removing the type changes no runtime behaviour because it existed only at
  compile time.
