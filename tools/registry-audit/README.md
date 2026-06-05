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
published tarball with selected dependencies **overridden to the local workspace
builds**, then runs `tsc --noEmit`. Answers "do these published packages still
typecheck against the current local build?".

```
pnpm audit:typecheck [--from-report] [--package <name>] [--override <pkg>=<dir>] [--limit <n>] [--skip-install]
```

Defaults to packages flagged in `report.json`. Local workspace packages
(`packages/*`, `clis/*`) are overridden by default; the local builds must already be
built. This installs a full dependency tree per package, so it is slow. Note that
packages which bundle/inline their dependency types won't surface breakage here — the
pattern scan is the better detector for that.

## Typical run

```
pnpm audit:download
pnpm audit:extract
pnpm audit:analyze --rules tools/registry-audit/rules/legacy-attachments.json
# then optionally, on just the flagged packages:
pnpm audit:typecheck --from-report --limit 5
```
