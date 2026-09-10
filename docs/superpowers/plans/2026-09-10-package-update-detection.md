# Package Update Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect's Package Manager Installed tab shows, per installed registry package, whether a newer version exists on the user's stream (installed tag or `latest`) and offers one-click update/switch via the existing in-place version-bump install path. Completes powerhouse-inc/powerhouse#2357.

**Design:** `docs/superpowers/specs/2026-09-10-package-update-detection-design.md` (read first).

**Worktree:** `~/.worktrees/powerhouse/2357-package-updates` (branch `feat/2357-package-updates` from main).

**Files touched:**
- `packages/shared/registry/updates.ts` (new), `packages/shared/registry/updates.test.ts` (new), `packages/shared/registry/types.ts`, `packages/shared/registry/index.ts`
- `packages/reactor-browser/src/registry/fetchers.ts`, `packages/reactor-browser/src/registry/index.ts`
- `apps/connect/src/package-manager.ts`
- `apps/connect/src/hooks/useRegistryPackages.ts`
- `apps/connect/src/components/modal/modals/settings/package-manager.tsx`
- `packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/{version-picker.tsx, package-manager-list.tsx, package-manager.tsx, installed-packages-panel.tsx, package-manager.stories.tsx}`

**Conventions:** no formatter/linter runs inside tasks (run once at the end); tests via vitest where the package has a setup; keep changes additive where the types cross package boundaries (`spec?` is optional).

---

## Task 1 — Shared: update-target logic (TDD)

- [ ] Write `packages/shared/registry/updates.test.ts` **first** (red):
  - `parseInstallSpec`: `undefined`/`"name"` → `{kind:"tag", value:"latest"}`; `"name@dev"` → tag `dev`; `"name@6.2.1"` → version; scoped `"@scope/pkg@1.0.0"` → version `1.0.0` (split on the LAST `@` when scoped).
  - `getUpdateTarget`:
    - installed pinned `6.2.1` (no spec), `distTags.latest = "6.3.0"` → returns `"6.3.0"`.
    - installed `6.2.1`, latest equal → `undefined`.
    - installed `6.3.0` ahead of latest `6.2.1` → `undefined` (no downgrade).
    - installed via `@dev` (`spec "name@dev"`, version `6.2.2-dev.19`), `distTags.dev = "6.2.2-dev.20"`, latest `6.2.1` → returns `"6.2.2-dev.20"` (stream follows the tag, not latest).
    - same as above but `distTags.dev` equals installed → `undefined`.
    - installed via `@dev`, `distTags` missing `dev` (tag removed) → `undefined` (no fallback to latest for stream users).
    - invalid installed version string, or missing target → `undefined`.
    - prerelease ordering: installed `6.2.2-dev.19` pinned, latest `6.2.2` → returns `6.2.2` (release outranks its prerelease).
- [ ] Implement `packages/shared/registry/updates.ts` (green): `parseInstallSpec`, `getUpdateTarget` using `semver` (`semver.valid` / `semver.gt`). Export both from `packages/shared/registry/index.ts`.
- [x] Add `spec?: string` and `latestVersion?: string` to `PackageInfo` in `packages/shared/registry/types.ts` with doc comments. `latestVersion` = the newest version the registry reports for the name (the `version` of list/single responses); kept separate from `version` because that field holds the *installed* version on installed rows.
- [ ] Run: `pnpm --filter @powerhousedao/shared test` (or the package's vitest entry) — all new tests pass; existing shared tests still pass.

## Task 2 — Browser client: single-package fetcher

- [ ] `packages/reactor-browser/src/registry/fetchers.ts`: add `getPackageInfo(registryUrl, name)` → `GET ${trimTrailingSlash(url)}/packages/<name>` (URL-encode the name; scoped names encode the whole string), returning `PackageInfo | null` — `null` on 404, throw on other non-ok (callers catch).
- [ ] Export it from `packages/reactor-browser/src/registry/index.ts`.
- [ ] `pnpm tsc --build` in the worktree (type-checks reactor-browser + dependents).

## Task 3 — Connect: spec exposure + installed metadata refresh

- [ ] `apps/connect/src/package-manager.ts`: add `getPackageSpec(name): string | undefined` reading `#storage.get(name)?.spec` (mirror of `getPackageVersion`).
- [ ] `apps/connect/src/hooks/useRegistryPackages.ts`:
  - In both places map entries are created/refreshed for installed packages (the `packageManagerPackages` effect and any merge that touches installed rows), write `spec: packageManager.getPackageSpec(name)` (keep existing value when the call returns undefined — never clobber a known spec with absence).
  - Add `ensureInstalledMetadataLoaded()` (useCallback): if `registryUrl` is null or no `registry-install` row is missing `latestVersion` or `versions`/`distTags`, return. For each missing row, `Promise.all` of `getPackageInfo` (swallow per-item errors — one bad package must not blank the others); merge the endpoint's `version` into `latestVersion` plus any returned `distTags`/`versions`, preserving `version`, `spec`, `status`, `manifest`, `documentTypes`. The paginated-fetch and document-type merges also record `latestVersion` from their items' `version`.
  - Return it from the hook.
- [ ] `pnpm tsc --build` + `pnpm --filter <connect pkg> typecheck` equivalent.

## Task 4 — Design system: installed-row UI

- [ ] `version-picker.tsx`: add optional `installedVersion?: string` prop; in the versions list mark the entry equal to `installedVersion` with a small "current" suffix (muted), and in the tag list mark a tag whose resolved value equals `installedVersion` (only when the tag list is present). Trigger label: when an update target is visible (prop `updateTarget?`), show `v{installed} → v{target}` style hint is NOT in the picker — keep trigger = selected value; the indicator chip (next task) carries the arrow.
- [ ] `package-manager-list.tsx` (`PackageManagerListItem`):
  - Compute `updateTarget = getUpdateTarget({version, spec}, {distTags, latestVersion})` for `registry-install` rows — the `latest` stream resolves from `distTags.latest` when present, else from `latestVersion` (every registry reports it); other streams require dist-tags and never guess.
  - Picker: enable for installed rows that have `versions` or `distTags` metadata (`canPickVersion` becomes true for `registry-install` with metadata); preselect: tag if the parsed spec is a tag and present in `distTags`, else the installed version if present in `versions`, else `resolveDefaultVersionSelection` fallback.
  - Indicator chip next to the name: when `updateTarget` — `Update available → v{target}` (small muted chip). Rendered independently of the picker: metadata-less rows (the live registry's shape) show the plain `v{version}` badge alongside the chip so both installed and target versions are visible.
  - Dropdown: add `Update` item (icon: refresh) shown when `updateTarget` exists OR picker selection differs from installed version; fires `onInstall(buildPackageSpec(name, selected.value))` then closes. Keep `Uninstall` for `registry-install`.
  - Pass `installedVersion={registryPackage.version}` and `updateTarget` into `VersionPicker`.
- [ ] `package-manager.tsx` (root): add `onInstalledTabOpen?: () => void` prop, fired on every activation of the Installed tab (mirror `onAvailableTabOpen`, including `initialTab="installed"` mount).
- [ ] `installed-packages-panel.tsx`: no structural change required (rows get the new behavior from the list item). If the panel needs to forward anything for stories, keep it prop-free.
- [ ] `package-manager.stories.tsx`: add a story "installed, update available" (registry-install row, version 6.2.1, distTags latest 6.3.0 + dev, versions list) and "installed, current" (no target). Render both via the existing story harness.

## Task 5 — Connect modal wiring

- [ ] `apps/connect/src/components/modal/modals/settings/package-manager.tsx`: pass `onInstalledTabOpen={() => void ensureInstalledMetadataLoaded()}` into `<PackageManager>`; the Update path needs nothing new (`handleInstall` already takes the full spec and the in-place bump in `addPackage` handles the rest).
- [ ] After a successful update the existing `packageManagerPackages` effect refreshes the map entry's `version`/`spec` — verify the indicator clears and the picker preselects the new version (check the effect covers spec writes; if `getPackageSpec` changes don't flow into the map, extend the effect's merge).

## Task 6 — Verify

- [ ] Worktree: `pnpm tsc --build`; run vitest for touched packages that have suites (shared registry tests; design-system/reactor-browser/connect test scripts if present for these files) — all green.
- [ ] Lint touched files per repo config (single pass).
- [ ] Live (worktree rig): `cd test/vetra-e2e && pnpm run vetra` (hub-managed). With Connect on :3001:
  1. Settings → Packages → Installed.
  2. Search+install an older published version of a registry package, e.g. `@powerhousedao/clint@<older>` (registry.dev.vetra.io has the history; pick any multi-version @powerhousedao package — check `GET /packages/<name>` first for a good candidate).
  3. Open Installed tab → row shows picker (current marked) + `Update available → v<latest>` chip.
  4. Click Update → version bump completes, chip gone, picker preselects new version; `powerhouse.config.json` spec reflects the new spec.
  5. Switch to an older version via the picker (downgrade path) → works.
  6. Screenshot each state (browser tool) for the PR description.
  7. Stop the rig; revert any project-file changes made for the demo (`.ph`, config) and leave the worktree clean of non-branch changes.
- [ ] Update this plan's checkboxes as steps land; final state all checked.

## Task 7 — Deliver

- [ ] Small incremental commits per task (TDD commit for task 1, one per subsequent task, docs commit last or first — repo convention: docs in the PR).
- [ ] Push `feat/2357-package-updates`; open PR with: summary (completes #2357 — the remaining update-detection half), the design spec link, before/after screenshots from Task 6, and the edge-case table from the design doc. `gh pr create` with `--label` if the repo uses one for this area.

**Risks / notes:**
- (a) Map entries are localStorage JSON across sessions — new fields must be optional and merges must tolerate missing ones (handled in Task 3 by design).
- (b) `semver` must stay a `shared`-level dependency only — design-system consumes it indirectly via `@powerhousedao/shared` (no new design-system dep).
- (c) The single-package endpoint 503s when upstream is unavailable — metadata refresh must treat that as "no change this time", not an error state (same silent-failure policy as the paginated fetch).

## Live verification findings (2026-09-10, `registry.dev.vetra.io`)

Verified against the live registry from a worktree `ph vetra` rig (Connect on :3001, studio config pointed at the live registry for the duration of the check):

- The deployed registry returns **no** `distTags`/`versions` on any endpoint — only the newest `version` per package (list items and single-package). Consequence: the version picker stays dormant against the live registry (it needs the metadata), but the **update chip + one-click Update work via the `latestVersion` fallback** (added during this work, see design doc §2). This is why the chip is decoupled from the picker in the list item.
- The registry's server-side search matches package *name* only (`name.includes(query)`), so typing `pkg@version` in the Available search returns no rows — a spec-suffixed query is never matched. Installing a specific older version live therefore happens by (a) a pinned config entry (`powerhouse.config.json` `packages: [{packageName, version, provider: "registry"}]` — the same shape `ph install pkg@1.0.50` writes) or (b) the picker once the registry ships version metadata.
- E2E rig config (`test/vetra-e2e/powerhouse.config.json`) carried a dead local-registry URL (`http://localhost:8080`, no Verdaccio is started by the rig anymore) — every Available-tab fetch failed with `ERR_CONNECTION_REFUSED`. Temporarily repointed at the live registry for this verification; **revert before committing** (fixing the rig's registry URL is a separate concern).
- Flow verified end to end: boot with a pinned `@powerhousedao/knowledge-note@1.0.50` (loaded from the live CDN at startup) → Installed row shows `v1.0.50` badge + `Update available → v1.0.52` chip → row menu **Update** → in-place bump to 1.0.52, chip gone, persisted spec re-pinned to `@powerhousedao/knowledge-note@1.0.52` in the `REGISTRY_PACKAGES:<registryUrl>` localStorage map. Fresh bare install of a second package (`notes` @ 1.0.3 = newest) → badge, no chip. No page errors throughout.
- Storybook evidence (design-system, port 6006): `InstalledUpdateAvailable` (chip states incl. dev stream and the metadata-less shape), `InstalledUpToDate`, `WithTaggedPackages`, and the open picker with the installed entry marked `CURRENT`.
