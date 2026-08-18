# Rocket.Chat JS SDK

The client-side vocabulary for talking to a Rocket.Chat server: chat content, and the realtime connection that carries it. This SDK is a consumer of that server, so the language follows the server's, not an invented one.

## Language

### Chat

**Room**:
A container for messages on a server. Every room has a Room type; nothing in the SDK is a "room" without one.
_Avoid_: Chat, conversation, group (when you mean any room)

**Room type**:
Which kind of room this is, carried as a single letter: Channel (`c`), Private group (`p`), Direct message (`d`), Livechat room (`l`).

**Channel**:
A public room, joinable by any user.
_Avoid_: Public group, public channel

**Private group**:
A room only invited members can see or join.
_Avoid_: Private channel, group

**Direct message**:
A room between a fixed set of users, created on demand from a username rather than named. Abbreviate as DM.
_Avoid_: IM, PM, one-to-one

**Message**:
One posted piece of content in a room, with an author.
_Avoid_: Msg, post, chat

**Reaction**:
An emoji attached to an existing message by a user.

### REST

**Api**:
The REST half of a Client — every request to the server's HTTP API, plus the
identity those requests are made under. A Client is an Api; it extends one and
adds the realtime side.
_Avoid_: API (unqualified — that is the server's), REST driver, service

**Endpoint**:
The name of one REST operation, passed to Api without a host or an api version —
`chat.sendMessage`, `users.info`. Not a URL.
_Avoid_: Route, path, URL, method (that is GET, POST, PUT or DELETE)

**Api version**:
The version segment of the request URL, `v1` unless a call overrides it.
Per-request, not per-Client.
_Avoid_: API version of the server, release

**REST client**:
The thing that actually performs an Endpoint request over HTTP — builds the URL
from a host, an Api version and the Endpoint, carries the auth headers, and
returns a status and a body. Behind `IClient`, and swappable: a Client builds the
SDK's own if it is handed none. Say REST client, never Client — an unqualified
Client is the SDK entry point below. The class implementing the SDK's own is
named `Client` in `lib/api/api.ts`, which is the one place the two names touch;
it is not exported, and nothing outside that file should name it.
_Avoid_: Client (unqualified), http client, transport, fetcher

**IClient**:
The interface a REST client satisfies — the four verb methods and the headers a
Login sets. What Api depends on, so a consuming app or a spec can supply its own.
_Avoid_: Client interface (ambiguous with the entry point)

**Current login**:
The authenticated identity Api holds after a Login — username, user id and auth
token, with no username when the login was resumed from a token. Set on login and
cleared on logout; `loggedIn()` reports on it.
_Avoid_: Session, credentials (those are what a Login is given, not what it
yields), user

### Realtime

**Client**:
The object a consuming app holds to reach a server — the SDK's entry point, covering both REST requests and realtime. Owns a Driver; is not one.
_Avoid_: SDK instance, connection

**Driver**:
The realtime layer behind a Client, speaking one wire protocol to the server. Not something a consuming app talks to directly.
_Avoid_: Socket (that is the DDP layer inside a Driver), Transport (that is the layer two below), adapter

**Socket**:
The DDP layer inside a Driver — it performs the DDP handshake, runs the Liveness chain, holds the DDP subscriptions, and owns one Transport. A Driver owns a Socket and mirrors part of its surface, but is a layer above it.
_Avoid_: Websocket (a Socket is not one; the Transport it owns is), Transport (that is the layer below), ddp

**Transport**:
The raw websocket a Socket owns and writes its DDP messages to. The layer below a Socket, and the only one with no DDP vocabulary of its own.
_Avoid_: Socket (that is the layer above), wire

**Stream**:
A named server-side feed a client asks to receive events from, such as room messages or user notifications.
_Avoid_: Channel (that is a Room type), feed, topic

**DDP message**:
One message on the wire, in either direction, named by its `msg` field. Qualified because an unqualified "message" in this SDK is chat content.
_Avoid_: Message (unqualified), frame, packet, event

**DDP response**:
The DDP message that answers a Method call or a DDP subscription — `result`, `ready` or `nosub`. A response carrying an error rather than a result is a failed response.
_Avoid_: Reply, ack, result (that is one response type of three)

**DDP error**:
The error field of a failed DDP response, as the server sent it. What the SDK raises to its callers from one is an ordinary Error, not this. A rejection the SDK originates itself — a write that failed, a Deadline that expired, a connection that went away and abandoned the wait — carries no DDP error and no server reason; only the server-sent kind is a DDP error.
_Avoid_: Error (unqualified — that is the JavaScript one), payload, fault

**DDP subscription**:
A client's active registration on one stream, which can be ended on its own. Qualified because the server's own "subscription" means a user's membership of a room — a meaning this SDK does not carry. A recorded DDP subscription does not prove the server confirmed it — see Abandoned sub and ADR-0006.
_Avoid_: Sub, subscription (unqualified), the map, the collection (that is a field on an incoming DDP message)

**Abandoned sub**:
A DDP subscription whose `sub` reached the wire but whose DDP response the connection ended before delivering. The server may have acted on it, so its entry is kept and re-established rather than forgotten.
_Avoid_: Lost subscription, orphaned stream, phantom

**Method call**:
A named server procedure invoked over the realtime connection, as opposed to a REST request.
_Avoid_: RPC, command

**Login**:
Exchanging credentials — password, OAuth, or a token — for an authenticated identity. The same act on both the REST and realtime sides.

**Resume**:
Logging in again with the token from a previous login rather than with credentials.
_Avoid_: Reauth, refresh

**Reopen**:
A retry scheduled after a connection drops, waited out before a new Socket is built. Distinct from the immediate reconnect a caller forces, which skips the wait — the two are separate paths in the code, and the difference is how long an in-flight send waits before it is abandoned, not whether it is.
_Avoid_: Reconnect (unqualified — say which of the two), retry

**Connected echo**:
The Driver re-emitting its Socket's open as a single `connected` event. One open means one `connected`, however many times a caller asked the Driver to connect.
_Avoid_: Connect event, ready

**Transport open**:
What the websocket itself says about a Socket, before the Liveness chain is consulted. A Socket is Transport open when it exists and its Transport reports it open — not merely un-closed: one still connecting is not Transport open, and one that is Transport open may have nobody answering on it. Being connected is Transport open and alive.
_Avoid_: Open (unqualified), ready, readyState

**Liveness chain**:
The repeating ping and its pong, the only thing that decides whether an apparently-open Socket is actually alive. A Socket that is Transport open can still be dead.
_Avoid_: Heartbeat, keepalive

**Probe**:
A single bounded liveness check on a Socket that looks open, asked for on demand rather than on the chain's schedule.
_Avoid_: Health check, ping (that is one message of the chain)

**Detached socket**:
A Socket the Driver has dropped its reference to and unhooked every handler from, without the Transport having confirmed the close. It may still be open to the peer, and may still revive; nothing it does afterwards reaches the Driver.
_Avoid_: Orphan, zombie, abandoned socket — abandoning belongs to waits, leaked socket

**Deadline**:
A bound after which the SDK settles a wait itself instead of waiting on the server any longer. Where a connection ends the wait instead, that is stated at the call.
_Avoid_: Timeout — that is a config option, and several Deadlines are derived from it

**Abandoned wait**:
A wait the SDK ends because the connection it depended on went away, so what it waited for can never arrive. Not a Deadline — no clock decides it, the connection does. A DDP message waiting to be written is abandoned on the same rule: it belongs to the connection it was issued on and is never written to the one that replaces it.
_Avoid_: Cancelled, timed out
