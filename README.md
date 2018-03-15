[asteroid]: https://www.npmjs.com/package/asteroid

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

See full API documentation links in the generated docs. Below is just a summary:

---

### `.connect(options, cb?)`

- Options accepts `host` and `timeout` attributes
- Can return a promise, or use error-first callback pattern
- Resolves with an [asteroid][asteroid] instance

See [Asteroid][asteroid] docs for methods that can be called from that API.

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

const asteroid = await rocketchat.connect({ host: 'localhost:3000' })
console.log('connected', asteroid)
```

ES5 module, using callback

```
const rocketchat = require('@rocket.chat/sdk')

rocketchat.connect({ host: 'localhost:3000' }, function (err, asteroid) {
  if (err) console.error(err)
  else console.log('connected', asteroid)
})
```

## Develop & Test

### Settings

| Env var | Description |
| --------------------- | ---------------------------------------------------- |
| `ROCKETCHAT_URL` | URL of the Rocket.Chat to connect to |
| `ROCKETCHAT_AUTH` | Set to 'ldap' to enable LDAP login |
| `ADMIN_USERNAME` | Admin user password for API |
| `ADMIN_PASS` | Admin user password for API |
| `ROCKETCHAT_USER` | User password for SDK tests |
| `ROCKETCHAT_PASS` | Pass username for SDK tests |
| `ROOM_CACHE_SIZE` | Size of cache (LRU) for room (ID or name) lookups |
| `ROOM_CACHE_MAX_AGE` | Max age of cache for room lookups |
| `DM_ROOM_CACHE_SIZE` | Size of cache for Direct Message room lookups |
| `DM_ROOM_CACHE_MAX_AGE` | Max age of cache for DM lookups |

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
- `export ADMIN_PASS=pass; export ADMIN_USERNAME=admin; export MONGO_URL='mongodb://localhost:27017/rc-sdk-test'; meteor`

Using `yarn` to run local tests and build scripts is recommended.

Do `npm install -g yarn` if you don't have it. Then setup the project:

- `git clone https://github.com/RocketChat/Rocket.Chat.js.SDK.git`
- `cd Rocket.Chat.js.SDK`
- `yarn`

### Test and Build Scripts

- `yarn test` runs tests and coverage locally (pretest does lint)
- `yarn test:debug` runs tests without coverage, breaking for debug attach
- `yarn docs` generates docs
- `yarn build` runs tests, coverage, compiles, tests package, generates docs
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
