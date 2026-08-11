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

**DDP subscription**:
A client's active registration on one stream, which can be ended on its own. Qualified because the server's own "subscription" means a user's membership of a room — a meaning this SDK does not carry.
_Avoid_: Sub, subscription (unqualified)

**Method call**:
A named server procedure invoked over the realtime connection, as opposed to a REST request.
_Avoid_: RPC, command

**Login**:
Exchanging credentials — password, OAuth, or a token — for an authenticated identity. The same act on both the REST and realtime sides.

**Resume**:
Logging in again with the token from a previous login rather than with credentials.
_Avoid_: Reauth, refresh
