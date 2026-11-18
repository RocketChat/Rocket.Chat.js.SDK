# ADR-0016: A stream is ready when its `ready` arrived on the attached Transport

**Status:** Accepted

**Succeeds:** ADR-0006, ADR-0011, ADR-0012, for the media-subscription wait only

## Context

`Driver.waitForNotifyUserMediaSubs` is the app's gate before it answers a call
accepted from the native call UI. It went through `Socket.resubscribeWhenRecorded`,
which re-sent a `sub` for each recorded media stream under its existing id and
resolved on the server's answer to that re-send.

A `sub` whose id is already active on the connection is not answered the same
way by every Rocket.Chat server. Meteor's ddp-server ignores it: no `ready`, no
`nosub`. ddp-streamer runs the publication again and answers `ready`. In the
common case the media streams are already active, so on a monolith server the
wait always ran out its deadline and the app ended the call.

The re-send also raced the resume Login after a reopen. The app's Login runs a
REST call before the DDP `login`, so the re-sent `sub` could reach the server
first, be refused with `nosub`, and lose its entry. And a re-send in flight when
the Transport closed was abandoned, kept its entry under ADR-0006, and counted
as acknowledged under ADR-0012, so the wait could report ready on a dead
connection.

## Decision

The wait sends nothing. The Socket records, for each DDP subscription, the
Transport on which a `ready` for it arrived. `Socket.waitForStreamsReady`
replaces `resubscribeWhenRecorded` and resolves `true` once every stream asked
for has at least one entry, and every entry for it has a `ready` from the
attached Transport. It resolves `false` on its Deadline.

- Only a `ready` with a subscription id counts, and only if the Transport that
  carried the `sub` is still attached when it lands. An entry kept from an
  abandoned or expired `sub`, or written as an Offline sub, is not ready.
- Forgetting an entry forgets its readiness, and an `unsub` clears it as it goes
  out.
- A reopen does not move readiness to the new Transport. After a reopen,
  `login` runs `subscribeAll`, and the `ready`s for that resubscribe are what
  make the streams ready again.

## Consequences

- No `sub` for an id already active on the connection comes from the wait, so
  the answer no longer depends on the server type.
- On a connection whose streams were acknowledged earlier, the wait resolves at
  once, without a round trip. It trusts that the server keeps a subscription
  for the life of the connection; a server that ends one on its own with an
  unsolicited `nosub` is not noticed.
- Readiness after a reopen depends on the resume Login and its `subscribeAll`.
  A caller that waits without a Login on the new connection runs out its
  Deadline.
- The bullets of ADR-0006, ADR-0011 and ADR-0012 that describe
  `resubscribeWhenRecorded` no longer apply.
