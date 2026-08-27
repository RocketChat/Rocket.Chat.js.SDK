# ADR-0013: Acknowledgement is carried separately from the handle

**Status:** Accepted

**Succeeds:** ADR-0012

## Context

ADR-0012 hands a caller a subscription exactly when an entry was written, which
under ADR-0006 includes a `sub` the connection abandoned and one whose Deadline
expired. Its own consequences record what that costs internally:
`Socket.resubscribeWhenRecorded` decided acknowledgement from what `resubscribe`
resolved, so those two paths — where no server answer ever came — were counted
as acknowledged.

The gate exists to answer one question, whether the server established every
stream asked for. Registry presence and server acknowledgement are different
facts, and reading one truthy value for both makes the gate report readiness for
a stream that may never have reached the server.

## Decision

A subscription attempt carries both facts.

- `sendSubscription` resolves a `DDPSubscriptionAttempt`: the subscription
  `rememberSubscription` wrote, if any, and whether a `ready` response
  acknowledged the request.
- Only the `ready` path that writes an entry is acknowledged. An abandoned or
  expired wait still resolves its remembered subscription, with
  acknowledgement false. A refusal, a request that never reached the Transport,
  and a `ready` naming no `subs` resolve neither.
- `resubscribeWhenRecorded` reads acknowledgement, never handle truthiness. The
  poll on `subscriptions` is unchanged: an entry still ends the wait and decides
  when to re-send, as ADR-0006 has it.
- `subscribe` is unchanged for callers. It resolves the attempt's subscription,
  so ADR-0012's rule — a handle exists if and only if an entry does — still
  holds.

## Consequences

- `Driver.waitForNotifyUserMediaSubs` resolves false where a resubscribe's wait
  was abandoned by a forced reconnect or expired when its Deadline rang, and
  the entry is kept, so the next Login re-establishes the stream.
- The ADR-0012 consequence describing the gate reading an abandoned resubscribe
  as acknowledged no longer holds.
