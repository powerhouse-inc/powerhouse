# registry-audit

A phased pipeline of small, explicit tools that audit every package published to a
Verdaccio/npm registry. Each phase is independently runnable and idempotent, and
threads state through a single `manifest.json`.

The tools are **generic** — what to look for is supplied as data (rules / patterns /
override targets), not baked in. The first use case is checking which published
document models reference the legacy attachment system removed in `163a5f6f1`, but the
same pipeline works for any future change.

All state lives under the repo-root `.cache/registry-audit/` (gitignored):

```
.cache/registry-audit/
  manifest.json     # threads the phases together
  report.json       # analyze.ts output
  tarballs/         # download.ts output
  extracted/        # extract.ts output
  typecheck/        # typecheck.ts scaffolds
```

## Phases

### 1. download — `pnpm audit:download`

Enumerates every package (`/-/verdaccio/data/packages`), resolves each to its
`dist-tags.latest`, and downloads the tarball.

```
pnpm audit:download [--registry <url>] [--filter <substr>] [--concurrency <n>] [--force]
```

### 2. extract — `pnpm audit:extract`

Unpacks each tarball into `extracted/<name>/` (strips the leading `package/`).

```
pnpm audit:extract [--filter <substr>] [--force]
```

### 3a. analyze — `pnpm audit:analyze`

Configurable pattern scan over the extracted files. Rules come from a JSON file
and/or ad-hoc `--pattern` flags. Writes `report.json` and prints a per-package summary.

```
pnpm audit:analyze --rules tools/registry-audit/rules/legacy-attachments.json
pnpm audit:analyze --pattern "\\bsomeRemovedSymbol\\b" --rule removed-scalar-attachment
```

Rule shape (see `rules/legacy-attachments.json`):

```jsonc
{
  "id": "removed-scalar-attachment",
  "severity": "high",
  "pattern": "\\bAttachment:\\s*\\{",   // JS RegExp source
  "include": ["gen/schema/"],            // optional path substring filters
  "exclude": []
}
```

Options: `--rules <file>` (repeatable), `--pattern <regex>` (repeatable),
`--rule <id>` (filter), `--filter <substr>`, `--ext d.ts,js,mjs`, `--json`.

### 3b. typecheck — `pnpm audit:typecheck` (optional, best-effort)

For each target package, scaffolds a standalone consumer project that installs the
published tarball (`pnpm install --ignore-workspace --ignore-scripts`), then runs
`tsc --noEmit` over an entry that imports it — with local workspace packages
redirected via TypeScript `compilerOptions.paths`. tsc honours `paths` for every
import in the program, including those inside the published package's own `.d.ts`,
so the package is effectively type-checked against the **current local build**.
Answers "do these published packages still typecheck against the current local code?".

```
pnpm audit:typecheck [--from-report] [--package <name>] [--override <pkg>=<dir>] [--limit <n>] [--skip-install]
```

- **Defaults to all extracted packages.** Use `--from-report` to limit to the
  packages flagged by `analyze.ts`, or `--package <name>` for specific ones.
- Local workspace packages under `packages/*` and `clis/*` that have built types are
  redirected by default (the local builds must already be built). Add or change
  redirects with `--override <pkg>=<dir>`.
- Reported errors are **scoped to the target package's own files**; unrelated
  transitive-dependency `.d.ts` noise is written to each scaffold's `tsc-errors.txt`
  but not counted.
- Installs a full dependency tree per package (the pnpm store is shared, so repeat
  installs are faster), so it is slow.

> Why `paths` and not pnpm `overrides`? pnpm does not apply `overrides` in an
> `--ignore-workspace` standalone project, so the redirect would be silently ignored.

**Important — limited signal for this audit.** Published models *bundle/inline* the
removed types (e.g. their own copy of `AttachmentInput`), and import only surviving
symbols (`Action`, …) from `document-model`. The inlined copies don't reference the
local package, so tsc sees nothing wrong and these packages report `ok`. This phase
only catches a package that *imports a now-removed named export*. For the
attachment removal, **`analyze.ts` is the authoritative detector**, and the harness
has been verified to flag removed exports (importing `AttachmentInput` from the local
`document-model` correctly errors `TS2305`).

### 5. load — `pnpm audit:load` (runtime integration test)

Boots a **real Switchboard** server in-process (in-memory PGlite — no Postgres, no
external services) and imports each extracted model package into it, building its
GraphQL subgraph schema. This answers what the static phases can't: *does the
published model actually load and build against the current core code?*

```
pnpm audit:load [--package <name>] [--from-report] [--filter <substr>] [--limit <n>] [--timeout <ms>]
```

- Each package is loaded in its **own subprocess** (`load-worker.ts`), so a
  hang or hard crash is isolated; a per-package `--timeout` (default 120s) guards hangs.
- Only packages that export `./document-models` are loaded; others are skipped.
- The loaded package's runtime `import "document-model"` resolves (via node's
  module walk-up to the repo's `node_modules`) to the **local** build — so this tests
  the published model against the *current* core, not the version it was built with.
- A baseline boot (no package) establishes the core model ids; each package's
  contribution is the delta. Status per package: `loaded` (registered models +
  schema built), `no-models` (booted but registered nothing), `boot-failed`
  (threw — captured), `timeout`.
- Writes `load-report.json` + a console summary. **Requires the local Switchboard to
  be built**: `pnpm --filter=@powerhousedao/switchboard build`.

> This is the phase that actually proves the attachment removal's runtime impact:
> models whose SDL still declares `scalar Attachment` boot fine — the undeclared
> scalar degrades to a passthrough rather than throwing.

### 6. create-query — `pnpm audit:create-query` (runtime API test)

The deepest check in the suite. Where `load` only proves a model **boots and
registers**, this proves its generated GraphQL API actually **works** against the
current core: for every document model a package contributes, it hits that model's
own generated subgraph endpoint (`/graphql/<kebab-name>`), creates an empty document
of that type, then queries it back by id.

```
pnpm audit:create-query [--package <name>] [--from-report] [--filter <substr>] [--limit <n>] [--timeout <ms>] [--reinstall]
```

- Boots the same in-process Switchboard as `load` (in-memory PGlite) with the single
  package loaded, then for each **own** model (core/baseline models excluded) runs,
  over HTTP against the per-model subgraph:
  - `mutation { <Name> { createEmptyDocument { id … } } }`, then
  - `query { <Name> { document(identifier: <id>) { document { id documentType } } } }`.

  `<Name>` is the model's GraphQL namespace (`pascalCase(name)`) and the endpoint
  segment is `kebabCase(name)` — mirroring how `reactor-api` names subgraphs.
- `createEmptyDocument` needs no drive and no input, so the check is uniform across
  models. The query verifies the round-tripped `id` and `documentType` match.
- **Reuses the `load` scaffolds** under `.cache/registry-audit/load/<pkg>/` — if a
  package is already installed there (e.g. after `audit:load`), no reinstall happens.
  Use `--reinstall` to force a fresh install.
- Each package runs in its **own subprocess** (`create-query-worker.ts`) with a
  per-package `--timeout` (default 120s).
- Status per package: `ok` (every model created **and** queried), `partial` (some
  models failed), `failed` (none succeeded), `no-models` (booted, contributed
  nothing), `boot-failed`, `install-failed`, `timeout`. A per-model entry that 404s
  on its subgraph is flagged `endpointMissing` (usually a name-derivation drift).
- Writes `create-query-report.json` + a console summary. **Requires the local
  Switchboard to be built**: `pnpm --filter=@powerhousedao/switchboard build`.

## Typical run

```
pnpm audit:download
pnpm audit:extract
pnpm audit:analyze --rules tools/registry-audit/rules/legacy-attachments.json
# optional static cross-reference check, on just the flagged packages:
pnpm audit:typecheck --from-report --limit 5
# runtime proof: boot a switchboard and import each model:
pnpm audit:load
# deepest proof: create + query a document per model via its generated endpoint:
pnpm audit:create-query
```
