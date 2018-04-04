[asteroid]: https://www.npmjs.com/package/asteroid
[lru]: https://www.npmjs.com/package/lru

# Rocket.Chat Node.js SDK

Application interface for server methods and message stream subscriptions.

## Overview

Using this package third party apps can control and query a Rocket.Chat server
instance, via Asteroid login and method calls as well as DDP for subscribing
to stream events.

Designed especially for chat automation, this SDK makes it easy for bot and
integration developers to provide the best solutions and experience for their
community.

For example, the Hubot Rocketchat adapter uses this package to enable chat-ops
workflows and multi-channel, multi-user, public and private interactions.
We have more bot features and adapters on the roadmap and encourage the
community to implement this SDK to provide adapters for their bot framework
or platform of choice.

## API

Full API documentation can be generated locally using `yarn docs`.
This isn't in a format we can publish yet, but can be useful for development.

Below is just a summary:

---

Currently, there are two modules exported by the SDK:
- `driver` - Handles connection, method calls, room subscriptions (via Asteroid)
- `methodCache` - Manages results cache for calls to server (via LRU cache)

Access these modules by importing them from SDK, e.g:

ES6 `import { driver, methodCache } from '@rocket.chat/sdk'`

ES5 `const { driver, methodCache } = require('@rocket.chat/sdk')`

See [Asteroid][asteroid] docs for methods that can be called from that API.

Any Rocket.Chat server method can be called via `driver.callMethod`,
`driver.cacheCall` or `driver.asyncCall`. Server methods are not fully
documented, most require searching the Rocket.Chat codebase.

### BASIC USAGE

---

The following ES6 demo uses async calls to login, join rooms, subscribe to 
message streams and respond to messages (with a callback) using provided
options to filter the types of messages to respond to.

This example can be executed with the testing instance by running `yarn start`, 
to allow manual testing, once subscription is setup try sending DMs to the bot
user and they should be logged in console.

```
import { driver } from '@rocket.chat/sdk'

async function startReceiving () {
  await driver.connect({ host: 'localhost:3000', useSsl: true })
  await driver.login({ username: 'bot', password: 'pass' })
  await driver.joinRooms(['GENERAL'])
  await driver.subscribeToMessages()
  await driver.respondToMessages((err, message, msgOpts) => {
    console.log('received message', message, msgOpts)
  }, {
    allPublic: false,
    dm: true,
    livechat: false,
    edited: true
  })
}

startReceiving()
```

#### MESSAGE OBJECTS

---

The Rocket.Chat message schema can be found here:
https://rocket.chat/docs/developer-guides/schema-definition/

The structure for messages in this package matches that schema, with a
TypeScript interface defined here: https://github.com/RocketChat/Rocket.Chat.js.SDK/blob/master/src/config/messageInterfaces.ts

The `driver.prepareMessage` method (documented below) provides a helper for
simple message creation and the `message` module can also be imported to create
new `Message` class instances directly if detailed attributes are required.

#### DRIVER METHODS

---

### `driver.connect(options, cb?)`

Connects to a Rocket.Chat server
- Options accepts `host` and `timeout` attributes
- Can return a promise, or use error-first callback pattern
- Resolves with an [Asteroid][asteroid] instance

### `driver.disconnect()`

Unsubscribe, logout, disconnect from Rocket.Chat
- Returns promise

### `driver.login(credentials)`

Login to Rocket.Chat via Asteroid
- Accepts object with `username` and/or `email` and `password`
- Returns promise
- Resolves with logged in user ID

### `driver.logout()`

Logout current user via Asteroid
- Returns promise

### `driver.subscribe(topic, roomId)`

Subscribe to Meteor subscription
- Accepts parameters for Rocket.Chat streamer
- Returns promise
- Resolves with subscription instance (with ID)

### `driver.unsubscribe(subscription)`

Cancel a subscription
- Accepts a subscription instance
- Returns promise

### `driver.unsubscribeAll()`

Cancel all current subscriptions
- Returns promise

### `driver.subscribeToMessages()`

Shortcut to subscribe to user's message stream
- Uses `.subscribe` arguments with defaults
  - topic: `stream-room-messages`
  - roomId: `__my_messages__`
- Returns a subscription instance

### `driver.reactToMessages(callback)`

Once a subscription is created, using `driver.subscribeToMessages()` this method
can be used to attach a callback to changes in the message stream.

Fires callback with every change in subscriptions.
- Uses error-first callback pattern
- Second argument is the changed item
- Third argument is additional attributes, such as `roomType`

For example usage, see the Rocket.Chat Hubot adapter's receive function, which
is bound as a callback to this method:
https://github.com/RocketChat/hubot-rocketchat/blob/convert-es6/index.js#L97-L193

### `driver.respondToMessages(callback, options)`

Proxy for `reactToMessages` with some filtering of messages based on config.
This is a more user-friendly method for bots to subscribe to a message stream.

Fires callback after filters run on subscription events.
- Uses error-first callback pattern
- Second argument is the changed item
- Third argument is additional attributes, such as `roomType`

Accepts options object, that parallels respond filter env variables:
- options.allPublic : respond to messages on all channels (or just joined)
- options.dm : respond to messages in DMs with the SDK user
- options.livechat : respond to messages in Livechat rooms
- options.edited : respond to edited messages

### `driver.asyncCall(method, params)`

Wraps server method calls to always be async
- Accepts a method name and params (array or single param)
- Returns a Promise

### `driver.cacheCall(method, key)`

Call server method with `methodCache`
- Accepts a method name and single param (used as cache key)
- Returns a promise
- Resolves with server results or cached if still valid

### `driver.callMethod(method, params)`

Implements either `asyncCall` or `cacheCall` if cache exists
- Accepts a method name and params (array or single param)
- Outcome depends on if `methodCache.create` was done for the method

### `driver.useLog(logger)`

Replace the default log, e.g. with one from a bot framework
- Accepts class or object with `debug`, `info`, `warn`, `error` methods.
- Returns nothing

### `driver.getRoomId(name)`

Get ID for a room by name
- Accepts name or ID string
- Is cached
- Returns a promise
- Resolves with room ID

### `driver.getRoomName(id)`

Get name for a room by ID
- Accepts ID string
- Is cached
- Returns a promise
- Resolves with room name

### `driver.getDirectMessageRoomId(username)`

Get ID for a DM room by its recipient's name
- Accepts string username
- Returns a promise
- Resolves with room ID

### `driver.joinRoom(room)`

Join the logged in user into a room
- Accepts room name or ID string
- Returns a promise

### `driver.joinRooms(rooms)`

As above, with array of room names/IDs

### `driver.prepareMessage(content, roomId?)`

Structure message content for sending
- Accepts a message object or message text string
- Optionally addressing to room ID with second param
- Returns a message object

### `driver.sendMessage(message)`

Send a prepared message object (with pre-defined room ID)
- Accepts a message object
- Returns a promise that resolves to sent message object

### `driver.sendToRoomId(content, roomId)`

Prepare and send string/s to specified room ID
- Accepts message text string or array of strings
- Returns a promise or array of promises that resolve to sent message object/s

### `driver.sendToRoom(content, room)`

As above, with room name instead of ID

### `driver.sendDirectToUser(content, username)`

As above, with username for DM instead of ID
- Creates DM room if it doesn't exist

---

### METHOD CACHE

[LRU][lru] is used to cache results from the server, to reduce unnecessary calls
for data that is unlikely to change, such as room IDs. Utility methods and env
vars allow configuring, creating and resetting caches for specific methods.

---

### `methodCache.use(instance)`

Set the instance to call methods on, with cached results
- Accepts an Asteroid instance (or possibly other classes)
- Returns nothing

### `methodCache.create(method, options?)`

Setup a cache for a method call
- Accepts method name and cache options object, such as:
  - `max` Maximum size of cache
  - `maxAge` Maximum age of cache

### `methodCache.call(method, key)`

Get results of a prior method call or call and cache
- Accepts method name to call and key as single param
- Only methods with a single string argument can be cached (currently) due to 
the usage of this argument as the index for the cached results.

### `methodCache.has(method)`

Checking if method has been cached
- Accepts method name
- Returns bool

### `methodCache.get(method, key)`

Get results of a prior method call
- Accepts method name and key (argument method called with)
- Returns results at key

### `methodCache.reset(method, key?)`

Reset a cached method call's results
- Accepts a method name, optional key
- If key given, clears only that result set
- Returns bool

### `methodCache.resetAll()`

 Reset cached results for all methods
 - Returns nothing

---

## Getting Started

A local instance of Rocket.Chat is required for unit tests to confirm connection
and subscription methods are functional. And it helps to manually run your SDK
interactions (i.e. bots) locally while in development.

## Use as Dependency

`yarn add @rocket.chat/sdk` or `npm install --save @rocket.chat/sdk`

ES6 module, using async

```
import * as rocketchat from '@rocket.chat/sdk'

const asteroid = await rocketchat.driver.connect({ host: 'localhost:3000' })
console.log('connected', asteroid)
```

ES5 module, using callback

```
const rocketchat = require('@rocket.chat/sdk')

rocketchat.driver.connect({ host: 'localhost:3000' }, function (err, asteroid) {
  if (err) console.error(err)
  else console.log('connected', asteroid)
})
```

## Develop & Test

### Settings

| Env var                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `ROCKETCHAT_URL`       | URL of the Rocket.Chat to connect to                  |
| `ROCKETCHAT_AUTH`      | Set to 'ldap' to enable LDAP login                    |
| `ADMIN_USERNAME`       | Admin user password for API                           |
| `ADMIN_PASS`           | Admin user password for API                           |
| `ROCKETCHAT_USER`      | User password for SDK tests                           |
| `ROCKETCHAT_PASS`      | Pass username for SDK tests                           |
| `INTEGRATION_ID`       | ID applied to message object to integration source    |
| `ROOM_CACHE_SIZE`      | Size of cache (LRU) for room (ID or name) lookups     |
| `ROOM_CACHE_MAX_AGE`   | Max age of cache for room lookups                     |
| `DM_ROOM_CACHE_SIZE`   | Size of cache for Direct Message room lookups         |
| `DM_ROOM_CACHE_MAX_AGE`| Max age of cache for DM lookups                       |
| `LISTEN_ON_ALL_PUBLIC` | true/false, respond listens in all public channels    |
| `RESPOND_TO_LIVECHAT`  | true/false, respond listens in livechat               |
| `RESPOND_TO_DM`        | true/false, respond listens to DMs with bot           |
| `RESPOND_TO_EDITED`    | true/false, respond listens to edited messages        |

These are only required in test and development, assuming in production they
will be passed from the adapter implementing this package.

### Installing Rocket.Chat

Clone and run a new instance of Rocket.Chat locally, using either the internal
mongo or a dedicated local mongo for testing, so you won't affect any other
Rocket.Chat development you might do locally.

The following will provision a default admin user on build, so it can be used to
access the API, allowing SDK utils to prepare for and clean up tests.

- `git clone https://github.com/RocketChat/Rocket.Chat.git rc-sdk-test`
- `cd rc-sdk-test`
- `meteor npm install`
- `export ADMIN_PASS=pass; export ADMIN_USERNAME=sdk; export MONGO_URL='mongodb://localhost:27017/rc-sdk-test'; meteor`

Using `yarn` to run local tests and build scripts is recommended.

Do `npm install -g yarn` if you don't have it. Then setup the project:

- `git clone https://github.com/RocketChat/Rocket.Chat.js.SDK.git`
- `cd Rocket.Chat.js.SDK`
- `yarn`

### Test and Build Scripts

- `yarn test` runs tests and coverage locally (pretest does lint)
- `yarn test:debug` runs tests without coverage, breaking for debug attach
- `yarn start` run locally from source, to allow manual testing of streams
- `yarn docs` generates API docs locally, then `open docs/index.html`
- `yarn build` runs tests, coverage, compiles, and tests package for publishing
- `yarn test:package` uses package-preview to make sure the published node
package can be required and run only with defined dependencies, to avoid errors
that might pass locally due to existing global dependencies or symlinks.

`yarn:hook` is run on git push hooks to prevent publishing with failing tests,
but won't change coverage to avoid making any working copy changes after commit.

### Integration Tests

The node scripts in `utils` are used to prepare for and clean up after test
interactions. They use the Rocket.Chat API to create a bot user and a mock human
user (benny) for the bot to interact with. They *should* restore the pre-test
state but it is always advised to only run tests with a connection to a clean
local or fresh re-usable container instance of Rocket.Chat.

### Debugging

Configs are included in source for VS Code using Wallaby or Mocha Sidebar.
