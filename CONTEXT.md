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

### Realtime

**Client**:
The object a consuming app holds to reach a server — the SDK's entry point, covering both REST requests and realtime. Owns a Driver; is not one.
_Avoid_: SDK instance, connection

**Driver**:
The realtime transport behind a Client, speaking one wire protocol to the server. Not something a consuming app talks to directly.
_Avoid_: Socket (that is the raw websocket inside a driver), adapter

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
The error field of a failed DDP response, as the server sent it. What the SDK raises to its callers from one is an ordinary Error, not this. A rejection the SDK originates itself — a write that failed, a Deadline that expired, a Reopen that abandoned the wait — carries no DDP error and no server reason; only the server-sent kind is a DDP error.
_Avoid_: Error (unqualified — that is the JavaScript one), payload, fault

**DDP subscription**:
A client's active registration on one stream, which can be ended on its own. Qualified because the server's own "subscription" means a user's membership of a room — a meaning this SDK does not carry.
_Avoid_: Sub, subscription (unqualified), the map, the collection (that is a field on an incoming DDP message)

**Method call**:
A named server procedure invoked over the realtime connection, as opposed to a REST request.
_Avoid_: RPC, command

**Login**:
Exchanging credentials — password, OAuth, or a token — for an authenticated identity. The same act on both the REST and realtime sides.

**Resume**:
Logging in again with the token from a previous login rather than with credentials.
_Avoid_: Reauth, refresh

**Reopen**:
A retry scheduled after a connection drops, waited out before a new Socket is built. Distinct from the immediate reconnect a caller forces, which skips the wait — the two are separate paths in the code and the difference decides whether an in-flight send is abandoned now or later.
_Avoid_: Reconnect (unqualified — say which of the two), retry

**Liveness chain**:
The repeating ping and its pong, the only thing that decides whether an apparently-open Socket is actually alive. A Socket the server has stopped answering still reads as open to the transport.
_Avoid_: Heartbeat, keepalive

**Probe**:
A single bounded liveness check on a Socket that looks open, asked for on demand rather than on the chain's schedule.
_Avoid_: Health check, ping (that is one message of the chain)

**Deadline**:
A bound after which the SDK settles a wait itself instead of waiting on the server any longer. Every wait the SDK can be left holding has one.
_Avoid_: Timeout — that is a config option, and it means only the connection one

**Server options**:
Whatever is left of a Client's options once the ones the Client consumes itself are taken out. What remains describes the server to reach and how to reach it — host, SSL, and the connection's timeout, ping and reopen intervals — and is what the Client builds its Driver from. Defined by subtraction, so an option no one has heard of is a server option. The Client's own logger and protocol are not server options; the logger still reaches the Driver, passed alongside them rather than as one of them.
_Avoid_: Config (that is the shaped object a Driver or Socket holds), settings (that is the module of environment defaults), the bag
