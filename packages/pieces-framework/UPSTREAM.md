# Upstream

`upstream/` and `test/upstream/` are generated from
[activepieces/activepieces](https://github.com/activepieces/activepieces).
Never edit them by hand; re-run the sync instead.

|           |                                            |
| --------- | ------------------------------------------ |
| Tag       | `0.91.0`                                   |
| Commit    | `da4410d1bf6212054e55805a98d566ff1b9310b2` |
| Committed | 2026-09-14                                 |

The same facts, plus the per-file upstream path and the SHA-256 of every
original file, live in `upstream/MANIFEST.json`; the package versions are in
`package.json` under `"upstream"`.

## What is vendored

| Upstream package                        | Upstream path                   | Here                         |
| --------------------------------------- | ------------------------------- | ---------------------------- |
| `@activepieces/pieces-framework` 0.39.0 | `packages/pieces/framework/src` | `upstream/framework/`        |
| `@activepieces/pieces-common` 0.14.0    | `packages/pieces/common/src`    | `upstream/common/`           |
| `@activepieces/core-piece-types` 0.11.1 | `packages/core/piece-types/src` | `upstream/core-piece-types/` |
| `@activepieces/core-utils` 0.6.2        | `packages/core/utils/src`       | `upstream/core-utils/`       |
| `@activepieces/engine` 0.7.0            | `packages/server/engine/src`    | `upstream/engine/`           |

The first four are vendored whole. The engine is not: `PACKAGES` gives it an
explicit `files` list, and the sync fails if any listed path disappears
upstream. Only the prop-coercion corner is taken — `lib/variables/processors/*`,
`lib/variables/props-processor.ts` and `lib/helper/dynamic-prop-keys.ts` — which
is what `./host` re-exports. Everything else in that package reaches for the
flow executor, the isolated-vm sandbox or the platform API: the trigger helper,
the piece executor and loader, and `lib/helper/error-handling.ts`, whose
retry/continue-on-failure logic takes `EngineConstants` and
`FlowExecutorContext` and so would drag the whole handler tree in.
`lib/variables/property-path.ts` is left out too: `props-processor.ts` does not
import it, and it would add a `jsep` dependency.

Each package's own vitest suites (`*.spec.ts`, `*.test.ts` under `src/`, and
`test/`) go to `test/upstream/<package>/` and run with `pnpm test`.

Left out: `mime-db-min.cjs` (upstream's bundler alias that keeps `mime-db`,
pulled in through `form-data`, out of piece bundles; aliasing is the piece
build's job, so `ph build` may adopt it later) and upstream's unused `ai` and
`semver` dependencies.
Of the engine's own tests only `test/variables/props-validator.test.ts` and
`test/variables/file-processor.test.ts` come along: the rest need
`@activepieces/shared`, `props-resolver` or `FlowExecutorContext`.

`@activepieces/shared` (8k lines of platform entities) is not vendored. The four
piece packages never import it; the engine files do, so the codemod re-homes
each symbol they use — `AUTHENTICATION_PROPERTY_NAME` and `AppConnectionValue`
to `upstream/core-piece-types/`, which really defines them, and `PropertySettings`
to `src/host/shared-shim.ts`, a Powerhouse-owned declaration of the minimal
shape `props-processor.ts` reads. An unmapped symbol fails the sync.

`deepmerge-ts` is a devDependency only: `core-utils` imports it in
`deepMergeAndCast`, which the framework barrel never re-exports, so the source
typechecks against it and the build tree-shakes it away. `test/dist.test.ts`
fails if a sync makes it reachable; that is the moment to move it to
`dependencies`. `ipaddr.js` and `dayjs` are runtime dependencies because `./host`
does reach them, through `ssrfIpClassifier` and the DATE_TIME processor.

## How to sync

```sh
pnpm --filter @powerhousedao/pieces-framework sync-upstream -- --tag <tag>
# or, from a checkout you already have at that tag:
pnpm --filter @powerhousedao/pieces-framework sync-upstream -- --tag <tag> --from ../activepieces
```

Without `--from` the script sparse-clones the tag into a temp dir. Then run the
gates (`tsc`, `lint`, `test`, `build`) and commit the result together with the
`UPSTREAM.md` table above. The script is idempotent: running it twice yields no
diff.

## What the codemod changes

Upstream is CommonJS with extensionless imports; this package is ESM under
`NodeNext` with `verbatimModuleSyntax`. For every copied `.ts` file the script:

1. Rewrites bare `@activepieces/{pieces-framework,pieces-common,core-piece-types,core-utils}`
   imports to relative paths into `upstream/`.
2. Adds `.js` (or `/index.js`) to relative specifiers, resolved against the
   real files.
3. Prefixes node builtins with `node:`, and adds the extension Node's ESM
   resolver will not infer for a subpath of a dependency with no `"exports"`
   map (`dayjs/plugin/utc` becomes `dayjs/plugin/utc.js`).
4. Prepends a two-line header naming the upstream path and the tag.
5. Runs `eslint --fix` with `scripts/sync-upstream.eslint.config.mjs`
   (`consistent-type-imports`, `consistent-type-exports`, prettier) so
   type-only imports and re-exports satisfy `verbatimModuleSyntax` and
   `isolatedModules`. Unused-directive reporting is off there, so upstream's
   `eslint-disable` comments survive even though their rules do not run.
6. Splits an `@activepieces/shared` import across the modules that really own
   each symbol, per `SHARED_SYMBOL_HOMES`.
7. Applies the literal patches listed in `PATCHES` in
   `scripts/sync-upstream.mts`. Each must match exactly the expected number of
   times or the sync fails, so a change upstream cannot go unnoticed.

Current patches:

- `upstream/common/lib/http/core/fetch-http-client.ts`: cast a buffered
  form-data body to `BodyInit` (`@types/node` 25 no longer accepts
  `Buffer<ArrayBufferLike>` there), and replace a `@ts-expect-error` whose
  target line prettier moves with an explicit cast on `Readable.fromWeb`.
- `upstream/common/lib/http/core/fetch-http-client.ts`: drop the unconditional
  `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` at the top of `sendRequest`.
  That flag is process-wide, so it disabled certificate verification for every
  HTTPS request in the host for as long as the process ran, not just the
  current one. Upstream's own bug (activepieces/activepieces@main still has
  it); no design here relies on it.
- `upstream/common/lib/http/core/fetch-http-client.ts`: stop `console.error`-ing
  the `HttpError` built for a failed request. `HttpError`'s message embeds the
  raw outgoing request body, so this was writing piece secrets (API keys,
  tokens, form fields) to host-level logs on every failed call. Upstream's own
  bug too; callers already get the same detail back via `toFailsafeOutput`.
- `upstream/common/lib/stream/index.ts`: guard `readChunks` against a
  non-positive `chunkSize`. `pendingLength >= chunkSize` is permanently true
  for `chunkSize <= 0`, so the drain loop never yields control back to the
  outer `for await`, hanging the generator forever. Unreachable today (nothing
  calls it yet) but it is public framework API.
- `upstream/common/lib/helpers/index.ts`: in `createCustomApiCallAction`, stop
  injecting `authValue` into headers whenever `authLocation` is merely
  non-nil. `authLocation` defaults to `"headers"` and is never actually nil at
  that point, so `authLocation === "headers" || !isNil(authLocation)` always
  held — query-param credentials were duplicated into the request headers.
- `upstream/framework/lib/property/input/array-property.ts`: add
  `JsonProperty` and `ColorProperty` to the runtime `ArraySubProps` union (and
  import them as values). The exported `ArraySubProps<R>` type and
  `Property.Array` both already allow Json/Color sub-properties; the runtime
  schema rejected them.
- `upstream/framework/lib/property/input/array-property.ts`: make
  `ArrayProperty`'s `properties` field `z.optional(...)`. The exported
  `ArrayProperty<R>` type already marks it optional, and
  `piecePropertiesUtils.buildSchema` already handles an absent value; the
  runtime schema required it.
- `upstream/framework/lib/property/input/index.ts`: add `CustomProperty` to
  the runtime `InputProperty` union (and import it as a value).
  `Property.Custom` builds exactly that shape, and it's part of the exported
  `InputProperty` type, but the runtime schema rejected it.
- `upstream/framework/lib/property/authentication/custom-auth-prop.ts`: add
  `SecretTextProperty`, `MarkDownProperty` and `StaticMultiSelectDropdownProperty`
  to the runtime `CustomAuthProps` union (and import them as values). All
  three are part of the exported `CustomAuthProps` type; the runtime schema
  was narrower.
- `upstream/framework/lib/property/input/markdown-property.ts`: add an
  optional `variant` field to the runtime `MarkDownProperty` schema.
  `Property.MarkDown` always writes one and the exported type declares it,
  but the schema had no such key, so zod silently stripped
  `WARNING`/`TIP`/`BORDERLESS` variants on parse.
- `upstream/framework/lib/trigger/trigger.ts`: give `createTrigger`'s switch a
  `default` that throws, naming the trigger and its `type`. The switch had none,
  so a missing or misspelt strategy returned `undefined`, and the piece failed
  later wherever that trigger was first read. TypeScript already rejects it;
  this covers code that bypasses the types.
- `upstream/framework/index.ts` and `upstream/framework/lib/property/index.ts`:
  re-export `SeekPage`, `McpAuthConfig` and `InputProperty` as values instead
  of `export type`. Each is a zod schema merged with a type; rolldown-plugin-dts
  drops the `type` modifier when it bundles `dist/index.d.ts`, so upstream's
  type-only re-export let `import { SeekPage }` typecheck and then fail at link
  time. The runtime gains three exports upstream's lacks; `test/dist.test.ts`
  holds the d.ts to the runtime.
- `test/upstream/framework/test/connection-identifier-flag.test.ts`: pass
  `authors: []` to `createPiece` (upstream does not typecheck its tests).
- `test/upstream/core-utils/test/ai-provider-health.test.ts`: make the outcome
  reporter return `void` instead of `Array.prototype.push`'s number (three
  sites).
- `test/upstream/engine/test/variables/file-processor.test.ts`: cast the
  processor's `unknown` result to `ApStreamingFile` instead of annotating the
  binding (five sites).
- `test/upstream/engine/test/variables/props-validator.test.ts`: pass
  `auth: undefined` to `Property.Dropdown` and `Property.MultiSelectDropdown`,
  which require it.

The vendored trees are excluded from the root ESLint run: their lint stance is
upstream's, and the codemod already applies this repo's formatting.
