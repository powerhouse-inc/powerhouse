# `@powerhousedao/shared`

`packages/shared` · published · v6.2.3-dev.9

---

## Purpose

The root of the dependency graph. It exists so that types, constants and pure
utilities can be reached from anywhere in the monorepo without creating cycles.

Its own README states the rule plainly:

> This package should **never depend on any other package in this monorepo**.

That constraint is what makes it work. Every other package can import it; it can
import nothing back. Confirmed by the `package.json`: it has **zero `workspace:*`
dependencies**.

---

## Functionality

The package is not a single module — it is a set of independently exported
sub-paths, each owning one domain's shared vocabulary. There are ~25 entries in the
`exports` map. The significant ones:

| Export | Directory | Contents |
|---|---|---|
| `.` | `index.ts`, `types/`, `constants.ts` | Base types, monorepo-wide constants, `git.ts` |
| `./document-model` | `document-model/` | The wire-level vocabulary of documents: `actions.ts`, `operations.ts`, `header.ts`, `auth.ts` / `auth-v1.ts`, `crypto.ts`, `document-schema.ts`, `document-type.ts`, `reducer.ts`, `action-transport.ts`, `files.ts`, `errors.ts`, `mock.ts` |
| `./document-drive` | `document-drive/` | The **DocumentDrive document model itself** — `document-drive.json`, `schema.graphql`, generated `gen/`, `module.ts`, reducers under `src/` |
| `./connect` | `connect/` | Connect runtime configuration: `config-loader.ts`, `env-config.ts`, `runtime-config.ts`, `pwa-config.ts`, `pwa-manifest.ts`, `schema-fragments.ts` |
| `./clis`, `./clis/*` | `clis/` | Everything the two CLIs share: argument parsing (`args/`), `project-ports.ts`, `project-env.ts`, `command-names.ts`, `build-config.mts`, `services/telemetry.ts`, `source-config-schema.ts` |
| `./analytics` | `analytics/` | `AnalyticsPath`, `AnalyticsPeriod`, analytics constants and types |
| `./processors` | `processors/` | Processor contracts: `relational/`, `drive-analytics/`, `http.ts` |
| `./registry` | `registry/` | Registry client vocabulary: `manifest-slim.ts`, `updates.ts`, `urls.ts` |

### Two generated artefacts you must not hand-edit

`packages/shared/CLAUDE.md` is explicit about this:

- `clis/source-config.schema.json` is generated from `clis/source-config-schema.ts`,
  which in turn imports field shapes from `connect/schema-fragments.ts`.
- The sibling `packages/builder-tools/connect-utils/runtime-config.schema.json` is
  generated the same way.

After changing a Connect config field: rebuild, then run
`pnpm tsx scripts/emit-schemas.ts` from the repo root. The full workflow lives in
`apps/connect/RUNTIME-CONFIG.md`.

---

## Test infrastructure

- **Runner:** Vitest (`pnpm --filter=@powerhousedao/shared test` → `vitest --run`).
- **Environment:** `node`, `globals: true`.
- **Coverage on disk:** 60 `*.test.ts` files exist in the package.
- **Coverage in the run:** the `include` list in `vitest.config.ts` is deliberately
  **narrowed** to a named set of suites. The config's own comment explains why: the
  rest (for example `clis/tests/*`) hit the live npm registry or need other
  environments, and folding them in is tracked as separate work. So the count of
  test files is larger than the count of test files the default `test` script runs.

Suites that do run: the CLI config/port/env schema suites, the whole Connect config
group, `document-drive/**` (actions, base, document-model, drive, node,
rename-collision, utils), five `document-model/*` suites, and the two registry
suites.

### The circular-reference workaround

`vitest.config.ts` aliases the bare specifier `document-model` to this package's own
`./document-model/index.ts`:

```ts
alias: {
  "document-model": fileURLToPath(new URL("./document-model/index.ts", import.meta.url)),
}
```

`packages/document-model` is a thin re-export of this directory. Depending on it
from here would make the TypeScript project graph circular (TS6202), so the alias
gives the `document-drive` tests a runtime resolution without the dependency edge.
This is the single most important thing to understand before touching this
package's test setup.

---

## How it is used

Nearly everything depends on it. Direct dependents include `document-model`,
`config`, `@renown/sdk`, `registry`, `reactor`, `reactor-drive`,
`reactor-attachments`, `reactor-hypercore`, `reactor-mcp`, `reactor-browser`,
`reactor-group`, `reactor-api`, `design-system`, `common`, `codegen`,
`builder-tools`, `vetra`, `analytics-engine-core`, both apps, both CLIs, and most of
`test/*`.

Practical consequences:

- A change here invalidates the whole build. It is first in the TypeScript project
  reference chain and near-first in the `pnpm build` filter list.
- Because it must stay dependency-free, the natural temptation — "just import the
  type from `document-model`" — is the thing that breaks it. Derived types belong in
  the package that derives them.
- `packages/document-model` re-exports large parts of `shared/document-model`. If
  you are looking for where a document type is actually *defined*, look here first.

### Build

`pnpm build` runs `tsx ./bundle.ts` — a hand-written bundler script, not tsdown,
because of the number of independent entry points.
