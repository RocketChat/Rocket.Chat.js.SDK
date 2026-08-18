# ADR-0001: A failed DDP response rejects with an Error

**Status:** Accepted

## Context

`Socket.send` in `lib/drivers/socket.ts` rejected with the DDP error as the server
sent it — a plain object with `error`, `reason` and `errorType`, and no
`message`. Every caller up the stack (`call`, `subscribe`, `unsubscribe`) logs
`err.message`, so the reason the server gave was lost at exactly the point
someone was trying to read it. A spec asserted that behaviour, so changing it
had to be deliberate.

## Decision

A failed DDP response rejects with an `Error`.

- The message is the DDP error's `reason`, falling back to its `message`, then
  to the DDP error itself when it is a bare string.
- The DDP error's own fields are copied onto the Error, so callers branching on
  `err.error` or `err.errorType` keep working.
- `message`, `name` and `stack` are **not** copied. The Error's own identity
  fields stay authoritative, so a DDP error carrying both `reason` and `message`
  cannot overwrite the message we chose. This is a rule, not an ordering trick —
  reordering the statements cannot silently break it.
- A non-object DDP error (a bare string, or `null`) is normalised to
  `new Error(String(...))`. A server may legally send a bare string, and this
  helper is the boundary where wire data becomes an Error, so it normalises
  rather than assuming a shape.
- The DDP error's shape is named by a type at this seam, even though DDP
  messages elsewhere in the driver are untyped.

## Consequences

- Callers receive an `Error`, not a plain object, and
  `lib/drivers/__tests__/ddp.send.spec.ts` asserts it.
- Specs that assert this contract assert both halves — the message *and* the
  preserved fields — so a future refactor cannot drop the copied fields
  silently.
- `unsubscribe`'s own `Promise.reject(id)` is **out of scope**. It is the
  driver's own rejection value, not a DDP error, and it needs a real reason
  rather than a wrapped id. It remains a known bug, tracked separately.
