# Upstream

`upstream/` and `test/upstream/` are generated from
[activepieces/activepieces](https://github.com/activepieces/activepieces).
Never edit them by hand; re-run the sync instead.

| | |
| --- | --- |
| Tag | `0.91.0` |
| Commit | `da4410d1bf6212054e55805a98d566ff1b9310b2` |
| Committed | 2026-09-14 |

The same facts, plus the per-file upstream path and the SHA-256 of every
original file, live in `upstream/MANIFEST.json`; the package versions are in
`package.json` under `"upstream"`.

## What is vendored

| Upstream package | Upstream path | Here |
| --- | --- | --- |
| `@activepieces/pieces-framework` 0.39.0 | `packages/pieces/framework/src` | `upstream/framework/` |
| `@activepieces/pieces-common` 0.14.0 | `packages/pieces/common/src` | `upstream/common/` |
| `@activepieces/core-piece-types` 0.11.1 | `packages/core/piece-types/src` | `upstream/core-piece-types/` |
| `@activepieces/core-utils` 0.6.2 | `packages/core/utils/src` | `upstream/core-utils/` |

Each package's own vitest suites (`*.spec.ts`, `*.test.ts` under `src/`, and
`test/`) go to `test/upstream/<package>/` and run with `pnpm test`.

Left out: `mime-db-min.cjs` (a bundler-only shim; the code carries its own
content-type table) and upstream's unused `ai` and `semver` dependencies.
`@activepieces/shared` is not needed: none of the four packages import it.

`deepmerge-ts` and `ipaddr.js` are devDependencies only. `core-utils` imports
them in `deepMergeAndCast` and `ssrfIpClassifier`, which the framework barrel
never re-exports, so the source typechecks against them and the build
tree-shakes them away. `test/dist.test.ts` fails if a sync makes either
reachable; that is the moment to move it to `dependencies`.

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
3. Prefixes node builtins with `node:`.
4. Prepends a two-line header naming the upstream path and the tag.
5. Runs `eslint --fix` with `scripts/sync-upstream.eslint.config.mjs`
   (`consistent-type-imports`, `consistent-type-exports`, prettier) so
   type-only imports and re-exports satisfy `verbatimModuleSyntax` and
   `isolatedModules`. Unused-directive reporting is off there, so upstream's
   `eslint-disable` comments survive even though their rules do not run.
6. Applies the literal patches listed in `PATCHES` in
   `scripts/sync-upstream.mts`. Each must match exactly the expected number of
   times or the sync fails, so a change upstream cannot go unnoticed.

Current patches:

- `upstream/common/lib/http/core/fetch-http-client.ts`: cast a buffered
  form-data body to `BodyInit` (`@types/node` 25 no longer accepts
  `Buffer<ArrayBufferLike>` there), and replace a `@ts-expect-error` whose
  target line prettier moves with an explicit cast on `Readable.fromWeb`.
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

The vendored trees are excluded from the root ESLint run: their lint stance is
upstream's, and the codemod already applies this repo's formatting.
