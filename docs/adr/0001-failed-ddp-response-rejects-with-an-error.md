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
  to a JSON serialisation of the DDP error itself.
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
- The DDP error's shape is named by a type at this boundary, even though DDP
  messages elsewhere in the driver are untyped.

## Consequences

- Callers receive an `Error`, not a plain object, and
  `lib/drivers/__tests__/socket.send.spec.ts` asserts it.
- Specs that assert this contract assert both halves — the message *and* the
  preserved fields — so a future refactor cannot drop the copied fields
  silently.
- `unsubscribe` rejecting for an id it holds no entry for is **out of scope**.
  That is the driver's own rejection value, not a DDP error, so it is an Error
  naming the id it found nothing for rather than one built by this helper.
