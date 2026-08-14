# Does a raw `.ts` entry behind an `exports` map resolve under Metro and tsc?

Throwaway prototype for RocketChat/Rocket.Chat.js.SDK#303.

## Setup

Two venues, both with the SDK installed from the git branch exactly as the app does
(`npm install RocketChat/Rocket.Chat.js.SDK#mobile`), so the install layout is the real one —
a real directory, not a symlink.

- **Synthetic consumer** (`consumer/`): Metro 0.83.3, TypeScript 7.0.2, Jest 30.4.2 — the same
  versions the app resolves.
- **The real app** (`Rocket.Chat.ReactNative` on `develop`): its own Metro config, tsconfig and
  Jest, with the SDK's `package.json` patched in place and reverted afterwards.

Shapes tried, applied by `consumer/shape.js`:

| shape | `exports` |
| --- | --- |
| `0-none` | absent — what `mobile` ships today (control) |
| `1-bare` | `{".": "./index.ts"}` |
| `2-types` | `{".": {"types": "./index.ts", "default": "./index.ts"}}` plus top-level `types` |
| `3-driver-subpath` | as above plus `"./lib/drivers/ddp"` |

## Result: the root entry

**A raw `.ts` entry behind an `exports` map resolves under all four resolvers.** Every shape,
every leg, no exceptions:

- **Node** — `require.resolve('@rocket.chat/sdk')` returns `index.ts`.
- **tsc** (`moduleResolution: bundler`) — resolves, and carries **real types**, not `any`. Verified
  with a probe that assigns the import to `number` and expects the error.
- **Metro** — bundles.
- **Jest** — loads.

`types` bought nothing. Shape `2-types` was identical to `1-bare` in every leg, so neither the
`types` condition nor the top-level `types` field is needed for a raw-`.ts` package.

## Result: the deep path, and the catch

`@rocket.chat/sdk/lib/drivers/ddp`:

| shape | Node | tsc | Metro | Jest |
| --- | --- | --- | --- | --- |
| `0-none` (today) | fails `MODULE_NOT_FOUND` | resolves | bundles | loads |
| `1-bare` | fails `ERR_PACKAGE_PATH_NOT_EXPORTED` | fails `TS2307` | **bundles** | fails |
| `2-types` | same as `1-bare` | same | **bundles** | fails |
| `3-driver-subpath` | resolves | resolves | bundles | loads |

**Metro does not enforce the map.** It reads it — the warning proves that:

```
Attempted to import the module ".../lib/drivers/ddp" which is not listed in the "exports" of
".../@rocket.chat/sdk" under the requested subpath "./lib/drivers/ddp". Falling back to
file-based resolution. Consider updating the call site or asking the package maintainer(s) to
expose this API.
```

`metro-resolver/src/resolve.js` `resolvePackage()` catches `PackagePathNotExportedError`, logs that
warning, and falls through to `resolveModulePath` **unconditionally**. There is no strict option.
The app's resolved config has `unstable_enablePackageExports: true` and
`unstable_conditionNames: ["react-native"]`, so exports are live there — they just cannot block.

So an `exports` map makes the surface enforceable for **Node, tsc and Jest**, and **advisory** for
the app's bundle.

Node also cannot resolve an extensionless deep `.ts` path even with no map at all
(`0-none` fails `MODULE_NOT_FOUND`) — that path only ever worked because Metro and Jest add `.ts`
to their extension lists.

## In the real app

A bare map breaks exactly **two files**, both test-only:

- `app/lib/services/ddpSocket.test.ts`
- `app/lib/services/__tests__/socketHealth.integration.test.ts`

Both fail with `Cannot find module '@rocket.chat/sdk/lib/drivers/ddp'`. Nothing in the app's
shipped code deep-imports, so the bundle is unaffected either way.

The app's **typecheck stays silent**, for two reasons: both files use `require(...)`, which tsc
does not resolve, and `app/externalModules.d.ts` has `declare module '@rocket.chat/sdk';` which
shims the whole package to `any`. A probe using `import` instead does report `TS2307`, so the shim
does not cover subpaths — only the `require` form hides it.

## Separate finding: consumers cannot typecheck SDK source today

Whenever a consumer really typechecks against the SDK's raw source, it inherits **27 errors**.

The SDK's two untyped dependencies are described by hand-written ambient `declare module` blocks in
`types/events.d.ts` (`tiny-events`) and `types/websocket.d.ts` (`universal-websocket-client`). Those
files are only picked up because the SDK's own `tsconfig.json` has no `include` and sweeps its whole
directory. A consumer that resolves `index.ts` never loads them, so `EventEmitter` and the
websocket class are untyped there — hence errors like
`Property 'on' does not exist on type 'Socket'`.

Adding two `/// <reference path=...>` lines pointing at those two files takes **27 errors to 0**.

This is independent of `exports`. It is currently invisible only because the app's
`declare module` shim means no consumer typechecks the SDK at all.

## Reproducing

```sh
cd consumer
npm install             # pulls the SDK straight from the mobile branch
node run.js 1-bare      # or 0-none, 2-types, 3-driver-subpath
```

`run.js` rewrites the installed SDK's `package.json` in place, so re-run `npm install` (or
`node shape.js 0-none`) to get back to the shipped shape.

`run.js` runs all nine legs and writes `result-<shape>.json`. It attributes tsc
errors to the probe file so the SDK's own internal errors cannot be mistaken for a resolution
failure, and every Metro build runs `--reset-cache`.
