[asteroid]: https://www.npmjs.com/package/asteroid

# Rocket.Chat Bot Driver

An agnostic interface for bot adaptors to interact with Rocket.Chat

## Overview

Rocket.Chat makes it easy for bot makers to provide the best solutions and
experience for their community. The internal Hubot and adapter enables chat-ops
workflows and multi-channel, multi-user, public and private interactions.

This package provides the core interface to subscribe to message streams, send
messages and query user details.

We have more bot features and adapters on the roadmap and encourage the
community to implement this driver to provide adapters for their bot framework
or platform of choice.

## API

See full API documentation links in the generated docs. Below is just a summary:

---

### `driver.connect(options, cb?)`

- Options accepts `host` and `timeout`
- Returns an [asteroid][asteroid] instance
- Can return a promise, or use error-first callback pattern

See [Asteroid][asteroid] docs for methods that can be called from that API.

---

## Getting Started

A local instance of Rocket.Chat is required for unit tests to confirm connection
and subscription methods are functional. And it helps to manually run your bot
interactions locally while in development.

## Use as Dependency

`yarn add rocketchat-bot-driver` or `npm install --save rocketchat-bot-driver`

ES6 Module, using async
```
import { driver } from 'rocketchat-bot-driver'

const asteroid = await driver.connect({ host: 'localhost:3000' })
```

More to come...

## Develop & Test

### Settings

| Env var | Description |
| --------------------- | ---------------------------------------------------- |
| `ROCKETCHAT_URL` | URL of the Rocket.Chat to connect to |
| `ROCKETCHAT_AUTH` | Set to 'ldap' to enable LDAP login |
| `ADMIN_USERNAME` | Admin user password for API |
| `ADMIN_PASS` | Admin user password for API |
| `ROCKETCHAT_USER` | Bot password for tests |
| `ROCKETCHAT_PASS` | Bot username for tests |
| `ROOM_CACHE_SIZE` | Size of cache (LRU) for room (ID or name) lookups |
| `ROOM_CACHE_MAX_AGE` | Max age of cache for room lookups |
| `DM_ROOM_CACHE_SIZE` | Size of cache for Direct Message room lookups |
| `DM_ROOM_CACHE_MAX_AGE` | Max age of cache for DM lookups |

These are only required in test and development, assuming in production they
will be passed from the adapter implementing this package.

If a `.env` file exists in the project folder, it will be used by `dotenv`.

### Installing Rocket.Chat

Clone and run a new instance of Rocket.Chat locally, using either the internal
mongo or a dedicated local mongo for testing, so the bot can't affect any other
Rocket.Chat development you might do locally.

The following will provision a default admin user on build, so it can be used to
access the API, allowing bot driver utils to prepare for and clean up tests.

- `git clone https://github.com/RocketChat/Rocket.Chat.git rc-bot-test`
- `cd rc-bot-test`
- `meteor npm install`
- `export ADMIN_PASS=pass; export ADMIN_USERNAME=admin; export MONGO_URL='mongodb://localhost:27017/rc-bot-test'; meteor`

Using `yarn` to run local tests and build scripts is recommended.

Do `npm install -g yarn` if you don't have it. Then setup the project:

- `git clone https://github.com/RocketChat/rocketchat-bot-driver`
- `cd rocketchat-bot-driver`
- `yarn`

### Test Scripts

- `yarn test` runs tests and coverage locally
- `yarn test:debug` runs tests without coverage, breaking for debug attach
- `yarn docs` generates docs
- `yarn build` runs tests, coverage, compiles and generates docs

`yarn:hook` is run on git push hooks to prevent publishing with failing tests.

### Integration Tests

The node scripts in `utils` are used to prepare for and clean up after test
interactions. They use the Rocket.Chat API to create a bot user and a mock human
user (benny) for the bot to interact with. They *should* restore the pre-test
state but it is always advised to only run tests with a connection to a clean
local instance of Rocket.Chat.

### Debugging

Configs are included in source for VS Code using Wallaby or Mocha Sidebar.
