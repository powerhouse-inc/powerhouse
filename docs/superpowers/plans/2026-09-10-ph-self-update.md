# ph self-update & Outdated Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ph` (the ph-cmd package) notices when its installed version is
outdated on its release stream (one-line stderr notice proposing
`ph self-update`) and `ph self-update` upgrades the global install through
the owning package manager.

**Architecture:** All new code lives in `clis/ph-cmd` (no shared-package
changes). Two pure-leaning service modules (`utils/version-check.ts`,
`utils/self-update.ts`) take injected `fetch`/spawner/clock/fs so every
decision is unit-testable; thin cmd-ts command and `cli.ts` hook wrap them.
Cache is `~/.ph/ph-cmd-self-update.json` (24 h TTL). Stream: stable →
`latest`, prerelease → `dev`; outdated ⇔ `semver.gt(target, current)`.

**Conventions:** vitest tests under `src/**/__tests__/*.test.ts` (the package
include pattern); `chalk` for colors; `debugArgs` from
`@powerhousedao/shared/clis/args` on the command; TDD — failing test first,
then implementation, per task. Work in
`~/.worktrees/powerhouse/1958-self-update` (branch `feat/1958-self-update`).
Skip formatters/linters/full-suite runs until the final task.

---

## Task 1 — Stream selection & outdated decision (`utils/version-check.ts`, part 1)

**Files:**
- Create: `clis/ph-cmd/src/utils/version-check.ts`
- Test: `clis/ph-cmd/src/utils/__tests__/version-check.test.ts`

- [ ] **Step 1: failing tests** for the pure functions:
  - `getStream(version: string): "latest" | "dev"` —
    `6.2.2` → `latest`; `6.2.3-dev.0` → `dev`; `6.2.2-staging.0` → `dev`;
    `6.2.0-rc.8` → `dev`; `unknown`/invalid → `latest` (safe default: never
    nag with a dev target for an unparseable current).
  - `isOutdated(current, target): boolean` — `semver.gt(target, current)`;
    `6.2.2` vs `6.2.3` → true; equal → false; `6.2.2` vs `6.2.1` → false;
    `6.2.2-dev.87` vs `6.2.2` → **true** (dev build is below its release);
    `6.2.3-dev.5` vs `6.2.3-dev.2` → true; invalid current → false (never
    nag on a broken version string).
- [ ] **Step 2:** run `pnpm --filter ph-cmd test` — confirm both fail to
  import (functions don't exist yet).
- [ ] **Step 3:** implement the two functions (export `PH_CMD_STREAMS =
  ["latest", "dev"] as const` for the command's `--tag` validation).
- [ ] **Step 4:** tests pass.

**Acceptance:** `getStream`/`isOutdated` pass all cases above; `pnpm tsc`
clean in the worktree.

---

## Task 2 — Cache & registry check (`utils/version-check.ts`, part 2)

**Files:**
- Modify: `clis/ph-cmd/src/utils/version-check.ts`
- Test: `clis/ph-cmd/src/utils/__tests__/version-check-cache.test.ts`

- [ ] **Step 1: failing tests:**
  - `checkForNewerVersion(deps)` with injected deps
    `{ fetch, now, readFile, writeFile, cachePath }`:
    - fresh cache (checkedAt within TTL, target `6.3.0` ≠ current) → returns
      `{ target, stream }` and does **not** call `fetch`.
    - stale/missing cache → calls injected `fetch` once with
      `https://registry.npmjs.org/ph-cmd/<stream>` and an
      `AbortSignal.timeout(2000)`; on `200` + `{ version }` body → writes
      cache `{checkedAt, stream, target}` and returns it.
    - fetch rejects (timeout/offline) or non-200 → returns the stale value
      when present (no throw); returns `{ outdated: false }`-ish result when
      there is no cache at all (silent).
    - corrupt cache file (non-JSON) → treated as missing → fetches.
  - `formatOutdatedNotice(current, target, stream)` → exact string
    `A new version of ph-cmd is available: ${target} (you have ${current} — ${stream} stream). Run 'ph self-update' to update.`
- [ ] **Step 2:** implement (TTL constant `CACHE_TTL_MS = 24 * 60 * 60 *
  1000`; default deps use `globalThis.fetch`, `Date.now`,
  `node:fs/promises` read/write + shared `writeFileEnsuringDir`, cache path
  `~/.ph/ph-cmd-self-update.json` via `POWERHOUSE_GLOBAL_DIR`).
- [ ] **Step 3:** tests pass.

**Acceptance:** all cache/fetch cases green; no test touches the real
network or `~/.ph` (injected paths under `os.tmpdir()`).

---

## Task 3 — `maybeNotifyOutdated()` hook (`utils/version-check.ts`, part 3)

**Files:**
- Modify: `clis/ph-cmd/src/utils/version-check.ts`
- Test: `clis/ph-cmd/src/utils/__tests__/version-check-notify.test.ts`

- [ ] **Step 1: failing tests** for
  `maybeNotifyOutdated(opts: { args, currentVersion, stream?, stderrIsTty?, env?, deps? })`:
  - no-args / `--help`/`-h` / `--version`/`-v` args → returns without fetch,
    writes nothing.
  - command `self-update` → no fetch.
  - `CI=1` or `PH_NO_UPDATE_CHECK=1` env → no fetch.
  - not outdated (cache target ≤ current) → no output.
  - outdated + stderr TTY → writes exactly one line to the injected stderr
    sink.
  - outdated + non-TTY stderr → no output (but the check/cache refresh still
    runs when the cache is stale).
  - fetch throwing anywhere → nothing printed, nothing thrown.
- [ ] **Step 2:** implement; the function is the single entry point `cli.ts`
  calls (`await maybeNotifyOutdated({...})`).
- [ ] **Step 3:** tests pass.

**Acceptance:** every branch in the spec's skip-list verified; a throwing
injected `fetch` never escapes.

---

## Task 4 — Install location & PM detection (`utils/self-update.ts`, part 1)

**Files:**
- Create: `clis/ph-cmd/src/utils/self-update.ts`
- Test: `clis/ph-cmd/src/utils/__tests__/self-update-detect.test.ts`

- [ ] **Step 1: failing tests** for `detectGlobalInstall(realPath: string)`:
  - `.../node_modules/.pnpm/ph-cmd@6.2.2/node_modules/ph-cmd/dist/cli.mjs` →
    `{ pm: "pnpm", pkgRoot: .../node_modules/.pnpm/ph-cmd@6.2.2/node_modules/ph-cmd }`
  - `.../lib/node_modules/ph-cmd/dist/cli.mjs` → `{ pm: "npm", ... }`
  - `.../.bun/install/global/node_modules/ph-cmd/dist/cli.mjs` → `{ pm: "bun", ... }`
  - `.../yarn/global/node_modules/ph-cmd/dist/cli.mjs` → `{ pm: "yarn", ... }`
  - `/repo/clis/ph-cmd/dist/cli.mjs` (source checkout) →
    `{ pm: null, reason: "source-checkout" }`
  - `.../some/unknown/layout/cli.mjs` → `{ pm: null, reason: "unknown" }`
  - Windows-style backslash paths normalized first (`C:\Users\...\node_modules\ph-cmd\dist\cli.mjs`
    → npm).
  - `updateCommand(pm, tag)` →
    `npm install -g ph-cmd@<tag>` / `pnpm add -g ph-cmd@<tag>` /
    `bun add -g ph-cmd@<tag>` / `yarn global add ph-cmd@<tag>`.
- [ ] **Step 2:** implement (pkgRoot = the `ph-cmd` directory two levels
  above `dist/cli.mjs` after signature match; use `path.posix` after
  normalizing separators).
- [ ] **Step 3:** tests pass.

**Acceptance:** all layout cases (including Windows normalization) green.

---

## Task 5 — `runSelfUpdate()` execution (`utils/self-update.ts`, part 2)

**Files:**
- Modify: `clis/ph-cmd/src/utils/self-update.ts`
- Test: `clis/ph-cmd/src/utils/__tests__/self-update-run.test.ts`

- [ ] **Step 1: failing tests** for
  `runSelfUpdate(opts: { currentVersion, tag?, realPath, spawner, readFile, stdout, stderr, refreshCache? })`:
  - pnpm detection + injected spawner records
    `["pnpm", "add", "-g", "ph-cmd@latest"]` (default tag = stream of the
    current version); spawner resolves → reads `package.json` at pkgRoot,
    prints `Updated ph-cmd from <old> to <new>. The new version takes effect on your next 'ph' run.` and calls
    `refreshCache`.
  - spawner rejects (non-zero) → returns failure; caller-visible message
    includes the manual command for that PM; nothing else is thrown.
  - source-checkout detection → refuses with the source-checkout message,
    spawner never called.
  - unknown layout → refuses with the manual commands for all four PMs.
  - `--tag dev` flows into the install spec (`ph-cmd@dev`).
- [ ] **Step 2:** implement (spawn with `cross-spawn`, stdio inherit; the
  injected spawner has the same signature for tests).
- [ ] **Step 3:** tests pass.

**Acceptance:** update/failure/refusal paths all asserted; real `cross-spawn`
only used on the default (non-injected) path.

---

## Task 6 — `ph self-update` command

**Files:**
- Create: `clis/ph-cmd/src/commands/self-update.ts`
- Modify: `clis/ph-cmd/src/commands/ph.ts`

- [ ] **Step 1:** implement the cmd-ts `command`:
  `name: "self-update"`, description
  `"Update the globally installed ph to the latest version of its release stream"`,
  args `{ tag: option({ type: string, description: "dist-tag to install (defaults to the running build's stream; e.g. latest, dev)" }), ...debugArgs }`.
  Handler: resolve `realpath(import.meta.url)`… in the bundle
  `process.argv[1]`/`import.meta.url` → call `runSelfUpdate` with default
  deps → exit code 0 on success / 1 on refusal-failure (print via
  `console.error`, no `process.exit` inside the service — the command owns
  the exit).
- [ ] **Step 2:** register in `ph.ts` `cmds` (alphabetical position after
  `setup-globals`… keep existing ordering style: add after `update`).
- [ ] **Step 3:** `pnpm --filter ph-cmd build` succeeds; `node dist/cli.mjs
  self-update --help` prints the command + `--tag` option; `ph --help` lists
  it.
- [ ] **Step 4:** regenerate docs: `pnpm --filter ph-cmd generate-docs` and
  commit `COMMANDS.md` changes.

**Acceptance:** `self-update` appears in help; `--tag` is accepted; build +
`tsc` clean.

---

## Task 7 — Wire the notice into `cli.ts`

**Files:**
- Modify: `clis/ph-cmd/src/cli.ts`

- [ ] **Step 1:** in `main()`, after the `--version` short-circuit and before
  the `connect` default / delegation logic, add:
  ```ts
  await import("./utils/version-check.js").then(
    ({ maybeNotifyOutdated }) =>
      maybeNotifyOutdated({
        args,
        currentVersion: getVersion(),
        stderrIsTty: Boolean(process.stderr.isTTY),
      }),
  ).catch(() => {});
  ```
  (dynamic import keeps the fast path lean and guarantees the notice code
  can never break dispatch; the function itself never throws, the `.catch`
  is belt-and-braces.)
- [ ] **Step 2:** `pnpm --filter ph-cmd build`; manually run
  `node dist/cli.mjs --help` and `node dist/cli.mjs list` in the worktree
  (source-checkout run → the notice must not crash; in a source checkout the
  registry check may still run — that is fine and intended).
- [ ] **Step 3:** confirm `ph --version` output is unchanged (short-circuit
  before the hook).

**Acceptance:** help/version output byte-identical to before; a normal
command runs the hook without changing its exit code.

---

## Task 8 — Live verification (sandboxed global install)

- [ ] **Step 1:** build the worktree (`pnpm --filter ph-cmd build`).
- [ ] **Step 2:** create a throwaway npm global prefix
  (`export P=$(mktemp -d)/global; mkdir -p $P`),
  `npm install --prefix $P -g ph-cmd@latest` (installs the real published
  CLI into the fake prefix; its `dist/cli.mjs` lands at
  `$P/lib/node_modules/ph-cmd`).
- [ ] **Step 3:** copy the freshly built `dist/cli.mjs` over the installed
  one (simulates a user on an outdated build) and run
  `node $P/lib/node_modules/ph-cmd/dist/cli.mjs --help` with a TTY (use
  `script -qc` or the headless-browser rig is overkill — a pty) → expect the
  one-line notice (published `latest` `6.2.2` vs the dev build in the file).
  Verify the cache file `~/.ph/ph-cmd-self-update.json` was written (use a
  temp `HOME` to avoid touching the real `~/.ph`).
- [ ] **Step 4:** run `node .../cli.mjs self-update` inside the same fake
  prefix with a pty → the detected npm install runs
  (`npm install -g ph-cmd@latest --prefix $P` is what the PM does when the
  prefix is the global root — the spawner must use the detected PM with
  default config; in the sandbox prove the **detection + command
  construction** by a dry-run flag is NOT part of the product — instead
  verify by: running with `npm` prefix env pointing at `$P` so the real
  update executes inside the sandbox; assert the new `package.json`
  version after). If the sandbox cannot run a real global install cleanly,
  fallback: assert the exact argv the spawner received (via a `PH_SELF_UPDATE_DRY_RUN=1` env **only for the test rig**… no — keep the product clean: use a wrapper `npm` shim on `PATH` inside the pty that logs argv and exits 0, then a second shim that writes a bumped `package.json`).
- [ ] **Step 5:** record output as evidence under
  `docs/superpowers/evidence/1958-self-update/` (terminal captures).

**Acceptance:** notice renders in a real TTY run against the real npm
registry; self-update detects npm in the sandbox and executes
`npm install -g ph-cmd@latest`; failure path (killed shim) exits 1 with the
manual hint.

---

## Task 9 — Final checks & PR

- [ ] `pnpm --filter ph-cmd test` (whole package suite), `pnpm tsc` in the
  worktree, `pnpm --filter ph-cmd lint` (eslint).
- [ ] `git status` clean; small incremental commits per task (T1–T3 one
  commit: "feat(ph-cmd): version-check service (stream, cache, notice hook)";
  T4–T5 second: "feat(ph-cmd): self-update service (install detection +
  execution)"; T6+T7 third: "feat(ph-cmd): ph self-update command and
  outdated notice"; docs fourth: "docs(superpowers): design and plan for ph
  self-update (#1958)" — or amend as natural).
- [ ] Push `feat/1958-self-update`, open PR against `main` referencing
  #1958 with: summary, stream semantics, evidence (screenshots/captures
  from Task 8), and the non-goals from the spec.
