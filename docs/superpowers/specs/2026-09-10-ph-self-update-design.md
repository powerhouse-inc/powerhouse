# `ph self-update` and Outdated-CLI Detection — Design

Issue: [powerhouse-inc/powerhouse#1958](https://github.com/powerhouse-inc/powerhouse/issues/1958)

## Problem

The `ph` binary is the published `ph-cmd` package (npm, public). When a newer
version is published, users have no signal that their CLI is outdated, and no
one-liner to upgrade the CLI itself. The existing `ph update` / `ph use`
commands manage the *project's* Powerhouse dependencies only — not the CLI.

## Goals

1. When the running `ph-cmd` is older than the newest published version on its
   release stream, every `ph` invocation prints a one-line notice proposing
   `ph self-update`.
2. `ph self-update` upgrades the globally installed `ph-cmd` to the newest
   version of the running build's stream, using the package manager that owns
   the install.

Non-goals: updating the local `@powerhousedao/ph-cli` project package (that is
`ph update`), automatic unprompted updates, Windows-specific installers
(best-effort via the same path logic, not a separate code path).

## Streams

`ph-cmd` is published with npm dist-tags: `latest` (stable), `dev`, `staging`,
`rc`, `test`. A running build knows its own version (`getVersion()`, injected
at build time).

- **Stream selection:** stable version (no semver prerelease tag) → `latest`;
  prerelease version → `dev` (the active development stream; a dev build must
  not be nagged toward an older stable release).
- **Outdated** ⇔ `semver.gt(streamTarget, current)`. Semver ordering makes a
  dev build (`6.2.2-dev.87`) correctly compare *below* its release
  (`6.2.2`) and below newer dev builds.
- `ph self-update --tag <tag>` overrides the stream with any dist-tag (e.g. a
  dev user jumping to `latest`).

## Outdated notice

Runs in `cli.ts` `main()`, before command dispatch (subcommands call
`process.exit` inside their handlers, so an after-run hook would never fire):

- **Skipped entirely** for: the `--version`/`-v` short-circuit,
  `--help`/no-arg top-level help, `self-update` itself, `CI` environments, and
  `PH_NO_UPDATE_CHECK=1` (dedicated opt-out; the check is *not* telemetry, so
  `PH_NO_TELEMETRY`/`DO_NOT_TRACK` do not gate it).
- **Cache:** `~/.ph/ph-cmd-self-update.json` →
  `{ "checkedAt": <iso>, "stream": "latest"|"dev", "target": <version> }`
  (written with the shared `writeFileEnsuringDir`; `~/.ph` already exists via
  telemetry bootstrap).
- **Refresh policy:** cache fresh (≤ 24 h) → use as-is. Stale → one bounded
  registry fetch `GET https://registry.npmjs.org/ph-cmd/<stream>` with a
  2 s `AbortController` timeout; success rewrites the cache; any failure
  (timeout, HTTP error, offline) keeps the stale value and stays silent. A
  corrupt cache file is treated as missing. Total added latency is ≤ 2 s once
  per day; the check can never fail the wrapped command.
- **Print:** when outdated, one line to **stderr** (keeps stdout clean for
  scripts), and only when stderr is a TTY:
  `A new version of ph-cmd is available: <target> (you have <current> — <stream> stream). Run 'ph self-update' to update.`
  Non-TTY runs still refresh the cache (so the first TTY run has fresh data)
  but print nothing.
- After a successful `ph self-update`, the command refreshes the cache
  (target = new current), so the notice disappears on the next run.

## `ph self-update`

Args: `--tag <tag>` (optional; defaults to the running build's stream) + the
standard `--debug` (shared `debugArgs`).

1. **Locate the install.** Resolve the real path of the running bundle
   (`import.meta.url` → `realpath`; the bin entry may be a symlink) and match
   path signatures:
   - contains `node_modules/.pnpm/ph-cmd@` → **pnpm**
   - contains `.bun/install/global/node_modules` → **bun**
   - contains `yarn/global/node_modules` (yarn classic global folder) → **yarn**
   - otherwise `node_modules/ph-cmd` under a plain global prefix → **npm**
   - contains `/clis/ph-cmd/` (source-checkout layout) → **refuse**: "ph is
     running from a source checkout; self-update only applies to global
     installs."
   - unrecognized layout → **refuse** with the manual commands for all four
     PMs.
2. **Update.** Spawn the detected PM with stdio inherited (progress visible):
   - npm → `npm install -g ph-cmd@<tag>`
   - pnpm → `pnpm add -g ph-cmd@<tag>`
   - bun → `bun add -g ph-cmd@<tag>`
   - yarn → `yarn global add ph-cmd@<tag>`
3. **Verify + report.** Read the new `version` from the `package.json` at the
   located install root and print
   `Updated ph-cmd from <old> to <new>. The new version takes effect on your next 'ph' run.`
   (the running process's files may have been replaced under it; no restart of
   the current process). The cache is refreshed so the notice stops.
4. **Failure.** Non-zero exit; print the manual command for the detected PM
   (all four when detection failed). No sudo, no writes outside the PM's own
   global location.

## Files

| File | Change |
|---|---|
| `clis/ph-cmd/src/utils/version-check.ts` | new — stream selection, registry fetch (injected `fetch`), cache read/write (TTL), notice message, `maybeNotifyOutdated()` used by `cli.ts` |
| `clis/ph-cmd/src/utils/self-update.ts` | new — install-location resolution, PM detection, `runSelfUpdate()` (injected spawner for tests) |
| `clis/ph-cmd/src/commands/self-update.ts` | new — cmd-ts command wrapping the service |
| `clis/ph-cmd/src/commands/ph.ts` | register `self-update` |
| `clis/ph-cmd/src/cli.ts` | call the notice hook in `main()` before dispatch |
| `clis/ph-cmd/src/**/__tests__/*.test.ts` | new tests (vitest include pattern) |
| `clis/ph-cmd/COMMANDS.md` | regenerated by `generate-docs` postbuild |

No new dependencies (`semver`, `chalk` already in ph-cmd deps; `cross-spawn`
present). No changes to `packages/shared` — the branch stays self-contained in
`clis/ph-cmd`.

## Edge cases

- **Offline / flaky network:** bounded timeout, stale cache kept, silent.
- **Prerelease vs stable:** semver ordering (dev build < its release).
- **pnpm global layout drift across versions:** detect by path signature, not
  by an absolute root path.
- **Corrupt cache:** parse failure → treated as missing → refetch.
- **Update during a long command:** affects only the next run; stated in the
  success message.
- **Concurrent `ph` processes:** last cache write wins; harmless.
