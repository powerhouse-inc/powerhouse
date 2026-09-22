# @powerhousedao/pieces-framework

Powerhouse's published copy of the [Activepieces](https://www.activepieces.com)
piece framework, plus the one thing a piece running on a Powerhouse reactor
gets that no other host serves: `ctx.reactor`.

`ctx.reactor` is served to `@powerhousedao/piece-reactor` alone — the piece
whose actions are that surface. Every other piece finds the member throwing,
however it was loaded and whoever shipped it.

## Why this package exists

Activepieces pieces are written against `@activepieces/pieces-framework` and
`@activepieces/pieces-common`. Since Activepieces v0.86.0 pieces ship as
self-contained bundles with the framework inlined, and upstream stopped
publishing those two packages to npm. Anyone authoring a piece outside the
Activepieces monorepo has nothing to install.

This package vendors the framework, `pieces-common` and the two core packages
they depend on from a pinned upstream tag (see [UPSTREAM.md](./UPSTREAM.md)),
publishes them as ESM under the Powerhouse release train, and adds the
Powerhouse types on top. The authoring API is upstream's, unchanged.

```ts
import {
  createAction,
  createPiece,
  Property,
  reactorOf,
} from "@powerhousedao/pieces-framework";
import { httpClient, HttpMethod } from "@powerhousedao/pieces-framework/common";
```

## Writing a piece for a reactor package

1. **Start from a reactor package.** `ph init` gives you one; then add the
   framework:

   ```sh
   pnpm add @powerhousedao/pieces-framework
   ```

   The types need `@types/node`, which a `ph init` project already has.

2. **Write the piece** in `pieces/<name>/index.ts` with `createPiece`,
   `createAction`, `createTrigger` and `Property`, exactly as an Activepieces
   piece. The reactor the piece runs inside is on every context; read it with
   `reactorOf(ctx)`:

   ```ts
   import {
     createAction,
     createPiece,
     PieceAuth,
     Property,
     reactorOf,
   } from "@powerhousedao/pieces-framework";

   const listInvoices = createAction({
     name: "list_invoices",
     displayName: "List invoices",
     description: "Invoices on this reactor",
     props: {
       parentId: Property.ShortText({ displayName: "Drive", required: false }),
     },
     async run(ctx) {
       return reactorOf(ctx).find({
         documentType: "powerhouse/invoice",
         parentId: ctx.propsValue.parentId,
       });
     },
   });

   export const invoices = createPiece({
     displayName: "Invoices",
     logoUrl: "https://example.com/invoices.png",
     authors: ["acme"],
     auth: PieceAuth.None(),
     actions: [listInvoices],
     triggers: [],
   });
   ```

   `ReactorService` offers `models()`, `model(type)`, `get`, `find`, `create`
   and `execute`. The typed contexts are exported too:
   `PowerhouseActionContext`, `PowerhousePropertyContext`,
   `PowerhouseTriggerHookContext` and the generic `WithReactor<C>`.

3. **Register it.** List the piece in `pieces/index.ts` as a `PackagePiece`
   and in the package manifest under `"pieces"`:

   ```ts
   import type { PackagePiece } from "@powerhousedao/pieces-framework";

   export const pieces: PackagePiece[] = [
     {
       name: "@acme/pieces-invoices",
       version: "1.0.0",
       entry: "dist/node/pieces/invoices/index.mjs",
     },
   ];
   ```

   `entry` is the built module, relative to the package root: `ph build`
   emits `pieces/<name>/index.ts` to `dist/node/pieces/<name>/index.mjs`.

4. **Build.** `ph build` bundles each `pieces/<name>/index.ts` on its own
   into `dist/node/pieces/<name>/index.mjs`, with everything but node
   built-ins inlined — the framework, its dependencies and the shared set that
   document models and subgraphs leave to the host — because a host runs a
   piece in a forked worker with no `node_modules` beside it. It then loads
   each built piece once, in a child process, and writes two files next to it:
   `descriptor.json`, the piece's own `metadata()` in the Activepieces
   `PieceMetadata` shape (display name, logo, auth, every action and trigger
   with its properties), and a `package.json` that makes the directory a
   complete bundle. The `pieces` list in `dist/powerhouse.manifest.json` gets
   each piece's version, description, `bundle` and `descriptor` paths, so a
   registry can offer the piece before anyone installs the package.

   A package that ships only pieces is still an ordinary reactor package: it
   carries the same boilerplate as any other, including a root `index.ts`,
   `document-models/index.ts`, `editors/index.ts` and `style.css`, even when
   those are empty. `ph build` runs every step for it unchanged, so there is
   no piece-only mode to know about. The host that runs pieces on a reactor
   (the workflow runtime) reads the `pieces` list, imports each `entry` and
   serves `ctx.reactor`.

   Bundling with esbuild to ESM instead of `ph build`? `form-data`, which
   `./common` uses, is CommonJS, so pass
   `--banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`
   or the bundle throws `Dynamic require of "util" is not supported` on import.

Outside a Powerhouse reactor, `reactorOf(ctx)` throws an error that names
`ctx.reactor`, so a piece that ends up on another host fails legibly.

## `./host`, for the host and not for piece authors

A host that _runs_ pieces needs more than the authoring API: stored prop values
arrive as strings from a form and have to be coerced to what the piece's
`props` declare, outbound requests have to be checked against the private
address space, and a thrown HTTP client error has to be turned into something a
user can read. Activepieces does all three in its engine; `./host` re-exports
that code so a Powerhouse host does not reimplement it.

```ts
import {
  formatPieceError,
  processors,
  propsProcessor,
  ssrfIpClassifier,
} from "@powerhousedao/pieces-framework/host";
```

From the engine, coercion of what an editor stored into what a piece's `props`
declare:

- `processors` — `PropertyType` → coercion function, for the eleven types that
  need one, and `numberProcessor`, `checkboxProcessor`, `dateTimeProcessor`,
  `fileProcessor`, `jsonProcessor`, `objectProcessor`, `textProcessor` and
  `multiSelectProcessor` individually.
- `arrayZipperProcessor` — turns an object of parallel arrays into `ARRAY`
  items; `ARRAY` has no entry in the map.
- `propsProcessor.applyProcessorsAndValidators` — a whole props map at once,
  auth and nested `ARRAY`/`DYNAMIC` props included, returning the processed
  input and per-key validation errors.
- `dynamicPropKeys` — escapes and restores `DYNAMIC` prop keys around a form
  that treats `.` and `[` as path separators.
- `ProcessorFn`, and `PropertySettings` (ours, see
  [UPSTREAM.md](./UPSTREAM.md)) for the stored `DYNAMIC` schema.

From `core-utils`, the two host jobs that are not coercion:

- `ssrfIpClassifier.isBlockedIp({ ip, allowList })` — blocks every non-unicast
  range, with CIDR entries in the allow list.
- `formatPieceError` — lifts the API message out of an HTTP-shaped error,
  strips an HTML error page down to its text and caps serialization depth;
  with `tryParseFriendlyPieceError` and the `FriendlyPieceError` type.

Nothing here belongs in a piece: a piece is handed values that are already
coerced. `.` and `./common` are unchanged, and `test/surface.test.ts` holds them
that way.

The consumer is [`@powerhousedao/reactor-workflow`](../reactor-workflow), which
runs pieces on a reactor: its `context/normalize.ts` dispatches to `processors`,
its `worker/egress.ts` classifies with `ssrfIpClassifier`, and its worker runs a
thrown piece error through `formatPieceError` before redacting it.

The coercion half comes from `@activepieces/engine`, of which this package
vendors only the prop-coercion files, for the reasons in
[UPSTREAM.md](./UPSTREAM.md). `dayjs` (the DATE_TIME processor) and `ipaddr.js`
(the classifier) are runtime dependencies because `./host` reaches them.

## Publishing the same piece to Activepieces

A piece that does not use `ctx.reactor` is a plain Activepieces piece. To
contribute it upstream, scaffold one in the Activepieces monorepo with
`npm run cli pieces create`, copy your `src/` over its own, rewrite the import
specifiers (`@powerhousedao/pieces-framework` to
`@activepieces/pieces-framework`, `@powerhousedao/pieces-framework/common` to
`@activepieces/pieces-common`) and run `npm run build-piece <name>`.

## Syncing upstream

```sh
pnpm --filter @powerhousedao/pieces-framework sync-upstream -- --tag 0.91.0
```

`scripts/sync-upstream.mts` is the only thing that writes `upstream/` and
`test/upstream/`. It fetches the tag, copies the four piece source trees plus a
named handful of engine files, rewrites
them to ESM with `.js` specifiers and type-only imports, formats them, applies
a short list of literal patches that fail loudly when upstream changes, and
records every file's upstream path and hash in `upstream/MANIFEST.json`.
Details in [UPSTREAM.md](./UPSTREAM.md).

## License

MIT. The vendored Activepieces code keeps its original MIT license and
copyright, reproduced verbatim in [LICENSE](./LICENSE) alongside the Powerhouse
notice for everything else. The framework is inlined into every piece an
external developer builds, which is why this package is MIT rather than AGPL
like the rest of the Powerhouse monorepo.
