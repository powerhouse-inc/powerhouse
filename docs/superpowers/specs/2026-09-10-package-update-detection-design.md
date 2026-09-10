# Package Update Detection — Design

**Issue:** powerhouse-inc/powerhouse#2357 (second of three workstreams; version selection on install and registry version support are already implemented)
**Date:** 2026-09-10
**Scope:** Connect's Package Manager → Installed tab

## Background

#2357 asks for three things. Current state on main (verified 2026-09-10):

1. **Version selection on install** — done. The Available tab rows carry a `VersionPicker` (dist-tags + searchable version list, newest first, `latest` default); the search input accepts `pkg@version`/`pkg@tag`; the chosen spec is persisted so reloads re-install exactly what was picked.
2. **Registry version support** — done. The registry (`@powerhousedao/registry`, npm-protocol) hosts all published versions and serves them: `GET /packages` (full `PackageInfo`), paginated `GET /packages?limit=&offset=&search=` (trimmed), single-package `GET /packages/<name>`. **Verified against `registry.dev.vetra.io` on 2026-09-10:** every response carries the package's newest version (`version`); the full `distTags`/`versions` map is *not* returned by the deployed registry (nor by the current repo middleware) — treat it as an optional, registry-dependent capability.
3. **Update detection** — **the gap this design fills.** Installed rows show a `v{version}` badge and an *Uninstall* action, but nothing compares the installed version with the registry, and there is no update action.

## What already exists (build on this, don't rebuild it)

- `PackageManager.addPackage("name@spec")` already does an **in-place version bump** when the package is installed with a different version: it refetches the new version, unmounts the old stylesheet, re-registers, and updates the persisted spec (`apps/connect/src/package-manager.ts` — "version bump X → Y; refetching"). One-click update is therefore a UI feature, not a new install mechanism.
- The `VersionPicker` component (`design-system .../settings-modal-v2/package-manager/version-picker.tsx`) is already built and used for Available rows; it just needs to be enabled for installed rows.
- `useRegistryPackages` keeps the single source of truth for every row (name, installed `version`, `distTags`, `versions`, status) in a localStorage-backed map, refreshed from the registry listing and from package-manager state changes.
- The registry single-package endpoint returns full metadata; the browser just lacks a fetcher that calls it.

## Design

### 1. Spec tracking (shared + connect)

`PackageInfo` (shared/registry/types) gains an optional `spec?: string` — the spec the user requested at install time (`name`, `name@dev`, `name@6.2.1`). The Connect package manager exposes `getPackageSpec(name)` (mirrors the existing `getPackageVersion`, reads the stored spec), and the hook writes it into map entries for installed packages.

Why: an installed `6.2.2-dev.19` means two different things depending on how it was installed — "I follow the `dev` stream" or "I pinned this build". Only the spec distinguishes them, and it decides which stream an update follows. Legacy map entries simply lack `spec` and are treated as `latest`-installed.

### 2. Update-target logic (shared, pure, tested)

New `shared/registry/updates.ts`:

- `parseInstallSpec(spec?): { kind: "tag"; value: string } | { kind: "version" }` — bare/absent → `tag: "latest"`; `name@x` → tag when `x` is not a valid semver, version otherwise.
- `getUpdateTarget(installed: { version?, spec? }, info: { distTags?, latestVersion? }): string | undefined`
  - Stream = the dist-tag named by the install spec (`dev` if installed via `@dev`), else `latest`.
  - Target = current value of that stream: `distTags[stream]`; for the `latest` stream only, falling back to `latestVersion` — the newest version every registry reports (list-item / single-endpoint `version`) — when the dist-tag map is absent.
  - Return the target iff it is valid semver, the installed version is valid semver, and `semver.gt(target, installed)`.
  - Otherwise (equal, older, invalid, missing data, unknown stream) → `undefined`: **never suggest a downgrade**, and never guess with partial data (a `@dev` install on a registry without dist-tags has no computable target).
  - `latestVersion` lives on `PackageInfo` as its own field because `version` is overloaded: it holds the *installed* version on installed rows and the registry's newest on available rows.

Real `semver` (already a `shared` dependency) for the comparison — correct prerelease ordering (`6.2.2-dev.19 > 6.2.1`, `6.2.2 > 6.2.2-dev.19`), which the registry's ad-hoc `compareSemver` doesn't guarantee.

### 3. Metadata for installed rows (connect)

`useRegistryPackages` gains `ensureInstalledMetadataLoaded()`: for every `registry-install` row missing `latestVersion` or `versions`/`distTags`, fetch `GET /packages/<name>` (new `getPackageInfo` fetcher in reactor-browser's registry client) and merge into the map — the endpoint's `version` (newest release) lands in `latestVersion`, never overwriting the installed `version`, `spec`, or status; a richer existing entry is never downgraded (same merge discipline as the paginated fetch, which also records `latestVersion` from trimmed list items). Best-effort and silent on failure, same as the rest of the hook.

The design-system root `PackageManager` gains `onInstalledTabOpen?` (symmetric to the existing `onAvailableTabOpen`) so the fetch stays lazy: it fires on every activation of the Installed tab, and the caller dedupes. A second, automatic trigger covers the boot race: when runtime package registration writes fresh `registry-install` map entries (boot-time packages that resolve after the modal opened, installs that land while it is closed), the hook refreshes exactly those rows. Both paths funnel through one per-row in-flight dedupe, so a row is never fetched twice concurrently.

### 4. Installed-row UI (design-system)

`PackageManagerListItem` for `registry-install` rows:

- **VersionPicker** (when the row has version metadata), preselected to what is installed (the pinned version, or the installed tag). The picker marks the installed entry ("current") so the eye lands on the status quo.
- **Update indicator**: a small chip next to the name — `Update available → v{target}` — shown whenever `getUpdateTarget` returns a value, including on metadata-less rows (pinned/bare install vs the registry's newest version). On rows without a picker the plain `v{version}` badge renders alongside the chip so both the installed and target versions are visible; on picker rows the picker shows the installed entry instead.
- **Dropdown actions**: `Uninstall` (existing) plus `Update`, shown when an update is available **or** when the picker selection differs from the installed version (deliberate switch/downgrade — this is the rollback path from the issue's goal list). The action calls the existing `onInstall(name@selected)`; the in-place bump in `addPackage` does the rest. After success, the map refresh re-renders the row with the new version and the chip disappears.

Rows whose update target cannot be computed (metadata fetch failed, unknown stream, npm-uplink fallback packages) keep today's behavior — plain badge, no indicator.

## Edge cases

- **Prerelease streams:** user on `@dev` (6.2.2-dev.19) with `latest` = 6.2.1 → no indicator (comparing against `latest` would be wrong; the `dev` stream target decides).
- **Installed ahead of latest** (pinned a prerelease that outnumbers `latest`) → no indicator; no forced downgrade.
- **Stream moved but user pinned a version** → indicator compares against `latest` only (pinned users opt in by picking `latest` in the picker).
- **Same version re-clicked** → `addPackage` already no-ops on identical version; the Update item hides when selection equals installed.
- **Package vanished from registry** after install → metadata fetch 404s silently; row keeps showing the installed version, no false indicators.

## Non-goals

- No registry changes: the `latest`-stream target uses the `version` field every registry already reports; dist-tag support is consumed when present, not required. (Emitting the full `distTags`/`versions` map from the registry would be a separate registry-side workstream.)
- No automatic updates — the indicator and one-click action only; nothing installs itself.
- No cross-package/batch updates in v1 (one row at a time).
- CLI-side `ph list`/`ph install` UX is out of scope for this issue (Connect feature request).

## Verification

- Unit: the pure helpers (target resolution, spec parsing, semver edges) — table-driven vitest in shared.
- Live: in a worktree `ph vetra` project, install an older published version of a registry package via the Package Manager, confirm the indicator, click Update (stream move + pinned move), and the downgrade/switch path; screenshots of each state.
