# Plan: Make the reactor suite pass on Windows

Date: 2026-10-02 (against `main` at 141abde841, 6.2.3-dev.38)
Status: Tracks A and B done on `windows-fixes` (acf2bb02b8, 9cc40d56bf,
50ce21313f). Track C empty against this baseline. Track D not started.
Paths are relative to the repo root unless they start with `packages/reactor`.

## Motivation

`packages/reactor` is in neither `test:ci` nor `test:ci:platform`
(`package.json:8-9`). It runs only in `check-pr-reactor.yml`, on
`ubuntu-24.04`. So no gate anywhere observes the reactor suite on Windows,
even though `release-branch.yml` ships a `ph-windows-x64.exe` and
`@powerhousedao/pglite-fs` — the storage layer underneath the reactor — is
already in the Windows matrix (`scripts/test-weights.windows.json`, weight
29).

Run on Windows 11 / Node 24.19.0 / pnpm 12.8.1, with Postgres 16 on
`localhost:5433` from `packages/reactor/docker-compose.yml`, the suite fails
35 tests in 4 files. Every failure is in test or bench tooling that launches
a child process or compares a path. None is in the reactor runtime.

Two of the four are defects in shipped bench code, not in the tests. They
are latent on Linux and only observable on Windows.

## Evidence

Command: `pnpm --filter @powerhousedao/reactor test` (that is
`vitest run --coverage --printConsoleTrace=true --silent=false`).

```
Test Files  4 failed | 298 passed (302)
     Tests  35 failed | 3992 passed | 19 expected fail (4046)
  Duration  795.41s (import 124.02s, tests 2548.49s)
```

The 19 expected-fail are `test.fails` cases that pass as designed, not
Windows damage. All 35 failures are in these 4 files:

| File | Failed | Cause |
|---|---|---|
| `packages/reactor/test/bench/records-guard.test.ts` | 32 of 32 | `execFileSync` on a `.sh` file |
| `packages/reactor/test/admin/catchup.test.ts` | 1 of 19 | `spawnSync("pnpm", …)` |
| `packages/reactor/test/bench/records-adapter.test.ts` | 1 of 60 | `path.relative` separator |
| `packages/reactor/test/bench/fix-dist.test.ts` | 1 of 4 | `path.relative` separator |

Each cause was confirmed by running the failing call in isolation under
Node 24 on this machine, not inferred from the test name:

| Call | Result |
|---|---|
| `spawnSync("pnpm", ["--version"])` | `status=null`, `error.code=ENOENT` |
| `spawnSync("pnpm.cmd", ["--version"])` | `status=null`, `error.code=EINVAL` |
| `spawnSync("pnpm", […], {shell:true})` | `status=0`, but Node emits `DEP0190` |
| `spawnSync(process.execPath, ["--import","tsx", …])` | works |
| `execFileSync(".../records-guard.sh", ["none"])` | `error.code=EFTYPE` |
| `execFileSync("bash", [".../records-guard.sh", "none"])` | works |
| `relative("/repo/packages/reactor", "/repo/packages/reactor/bench/auth-scope.bench.ts")` | `"bench\\auth-scope.bench.ts"` |

`pnpm.cmd` without a shell fails `EINVAL` because of Node's fix for
CVE-2024-27980: a `.cmd` target now requires `shell: true`. `shell: true`
works but concatenates rather than escapes its arguments, which is what
`DEP0190` warns about. `node --import tsx` avoids both and is already the
idiom in `packages/reactor/package.json` (`bench:sync`).

Not a factor, checked and ruled out:

- Line endings. `core.autocrlf=false` locally and globally, and there is no
  `.gitattributes`.
- The `#` alias at `packages/reactor/vitest.config.ts:31` builds a path with
  `URL.pathname`, which yields a leading-slash `/D:/…` on Windows. No file
  in `src` or `test` imports from `#`, so it is dead config. Note it, do not
  depend on it, and do not start using it before fixing it.
- Worker entry resolution. `packages/reactor/src/executor/worker/index.ts:43-56`
  already strips the leading slash from a `file:` URL's pathname when a
  drive letter follows. It is the model the rest of the repo should copy.
- PGlite and Postgres. The 48 test files whose suites are named `[Postgres]`
  and the `AtomicNodeFs` permutation of `testFsBackends`
  (`packages/reactor/test/factories.ts:158-178`) produced no failures.

## What the run rules out

The full run finished: 298 of 302 files pass. There is no timing or flake
category, which was the open risk — the repo has absorbed Windows-timing
fixes before (c3922e3fdc, 33ef9b1d87, 6ccb722dd5), so it was a real
possibility rather than a hypothetical. It did not materialize here, at
`maxWorkers: 4` under coverage on a loaded desktop.

That makes this a closed, fully-diagnosed piece of work: 35 deterministic
failures, 4 files, 3 root causes, no reactor runtime changes. It does not
make the suite flake-free on a CI runner, which has different core counts
and I/O; Track C stays as the procedure for triaging anything the first
green CI run turns up.

## Decisions

1. **Fix the launcher, not the test's expectation.** All 33
   child-process failures are a test reaching for a shell-resolved name
   (`pnpm`) or an interpreter-less script (`.sh`). The fix is to name the
   interpreter. Do not add `shell: true`, and do not skip these tests on
   Windows: both lose the coverage that `check-windows.yml` exists to buy.
2. **Normalize separators where the path is data, at the producer.** A
   relative path that is written to a record, matched against git output, or
   compared as a string is POSIX data, not a native path. Convert it where
   it is produced, so the predicate and the assertion are both fixed by one
   change. Where a path is a genuine native path that is merely being
   asserted on, match either separator instead — the pattern 7b3de3b4fd
   established.
3. **Gate reactor on Windows, with Postgres.** Dropping the 48 `[Postgres]`
   files would remove exactly the disk and process behaviour the job is for.
   `windows-latest` does not support `services:` containers, so Postgres has
   to be started on the runner.

## Track A — child processes (33 tests) — done, acf2bb02b8 and 50ce21313f

**A1. `packages/reactor/test/admin/catchup.test.ts:35-39`** (1 test: "exits
64 on bad arguments and 68 when the store cannot be read").

`runCli` calls `spawnSync("pnpm", ["exec", "tsx", CLI, ...args])`. Replace
with:

```ts
return spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
  cwd: fileURLToPath(new URL("../..", import.meta.url)),
  encoding: "utf8",
});
```

Verified by hand: this returns `status: 64` with `Usage:` on stderr, which
is what the test asserts. `CLI` is already an absolute native path from
`fileURLToPath` (`:31-33`), so it needs no change.

**A2. `packages/reactor/test/bench/records-guard.test.ts`** (32 tests, the
whole file).

`GUARD` (`:5-15`) is `.claude/hooks/records-guard.sh`; the file's shebang
makes it a bash script. Both call sites — `:25` in the `guard` helper and
`:118` — pass it to `execFileSync` as the executable. Prefix the
interpreter at both:

```ts
execFileSync("bash", [GUARD, role], { input: payload, encoding: "utf8", … });
```

Use `bash` unconditionally rather than branching on platform: it is correct
on Linux and macOS too, and keeps one code path. `bash` is on `PATH` on
GitHub's `windows-latest` (Git for Windows), and this repo already requires
bash to run its hooks at all.

Keep the error shape the helper depends on. The `catch` at `:30-32` reads
`status` and `stderr` off the thrown error; going through `bash` preserves
both, because bash exits with the script's status.

**A3. Same class, no failing test.** Not exercised by the suite, so they
never turned CI red, but each is broken on Windows. Fixed in 50ce21313f via
`bench/pnpm-command.ts`: pnpm exports `npm_execpath` for every script it
runs, so that is the name to spawn — native entry directly, JS entry through
node, since corepack ships `pnpm.cjs`. Unit-tested over all three shapes in
`test/bench/pnpm-command.test.ts`, and only the spawn is translated, so
`commandLine` still reports `pnpm typecheck`. `pnpm bench:fix dist-check`
now enumerates the workspace on Windows, which is the end-to-end check that
this path works.

- `packages/reactor/bench/fix/fix-ci.ts:287` — `spawnSync(step.command[0], …)`
  where every `command` is `["pnpm", …]` (`:143-262`). Breaks `pnpm bench:fix`.
- `packages/reactor/bench/fix/fix-dist.ts:124` — `execFileSync("pnpm", ["ls", …])`.
- `packages/reactor/bench/records/run-record-all.ts:44` — `spawnSync("pnpm", ["run", …])`.

`execFileSync("git", …)` at `bench/records/machine-environment.ts:36,61`
and `bench/fix/repo.ts:8,25` is fine: `git` is a real `.exe`.

## Track B — path separators (2 tests) — done, 9cc40d56bf

**B1. `packages/reactor/bench/records/from-vitest.ts:861-866`** (1 test,
`records-adapter.test.ts:118-122`, "makes the source path relative to where
the run happened").

```ts
return report.files.map((file) => relative(cwd, file.filepath));
```

This is a production defect, not a test expectation to relax. The result is
written into `BENCHMARKS.jsonl`, which is committed and compared across
machines; a record stamped on Windows would carry
`bench\auth-scope.bench.ts` and never match one stamped on Linux. Normalize
at the producer:

```ts
return report.files.map((file) =>
  relative(cwd, file.filepath).split(sep).join("/"),
);
```

**B2. `packages/reactor/bench/fix/fix-dist.ts:66-101`** (1 test,
`fix-dist.test.ts:52-77`, "skips the excluded and dot directories and
reports the newest match").

`newestFile` builds `rel` with `relative` (`:90`), passes it to `include`,
and returns it as `Newest.file`. Two consequences on Windows, and the
second is the defect:

- The returned `file` is `src\other.ts`, so the assertion fails.
- `isSourceFile` (`:45-55`) anchors path segments with `/`:
  `/(^|\/)(package\.json|tsconfig[^/]*\.json)$/` at `:49`. Against
  `sub\package.json` that does not match, so a nested `package.json` is
  classified as a source file. Its mtime then feeds `distVerdict`
  (`:103-119`), which silently flips a dist freshness verdict.

Normalize `rel` once, inside `newestFile`, which fixes the predicate and the
assertion together:

```ts
const rel = relative(directory, path).split(sep).join("/");
```

**B3. Same class, no failing test.** Normalized alongside B1/B2 in
9cc40d56bf.

- `packages/reactor/bench/fix/fix-ci.ts:405` — `options.changed.map(… relative(root, …))`.
  These paths are compared against `collectChanged(root)`, which comes from
  git and is always `/`-separated, and are passed to `owningPackage`. A
  backslash here silently mis-attributes a changed file to no package.
- `packages/reactor/bench/fix/fix-dist.ts:194` — `rel` is collected into a
  reported file list.

`fix-ci.ts:126` needs no change: it only tests `rel.startsWith("..")`, which
is separator-agnostic.

## Track C — triage procedure, nothing to do yet

Empty against this baseline: after Tracks A and B, the local run is green.
Keep this section as the classification to apply to anything the first
Windows CI run surfaces, since a runner is not this desktop. For each
failure, classify before fixing:

- **A real Windows defect** in `src/` — fix the source. This is the only
  category that matters for shipped behaviour, and the run so far suggests
  it is empty.
- **A native path asserted as a POSIX string** — match either separator, per
  7b3de3b4fd.
- **A timeout.** `packages/reactor/vitest.config.ts:26-28` already sets
  `hookTimeout: 120_000` and `testTimeout: 30_000`. Raise a specific test's
  budget, as c3922e3fdc and 6ccb722dd5 did; do not raise the global
  `testTimeout` to hide one slow suite.
- **Contention.** `maxWorkers: 4` (`:62`) with a fresh PGlite per test is
  heavier on Windows. Lower it for the Windows job only if a failure is
  actually traced to it — do not pre-emptively slow every platform.

The baseline to compare against is in Evidence above: 4 failed / 298 passed
files, 35 failed / 3992 passed / 19 expected-fail tests, 795s. A later run
that fails anything else has found something new, not something this plan
already knew about.

## Track D — the CI gate

Do this last: a gate added before Tracks A-C land is a red main.

1. Add `--filter=@powerhousedao/reactor` to `test:ci:platform`
   (`package.json:9`). `scripts/test-shard.ts:22-31` reads the filter list
   out of that script, so the package lands in a shard automatically.
2. Add `"@powerhousedao/reactor"` to `scripts/test-weights.windows.json`.
   Weight it from the measured wall-clock, not a guess; it is the largest
   suite that would be in the job. Leave the shard count at 2 until the
   measurement says otherwise — `switchboard` is 167 and `reactor-api` 130,
   so a reactor weight above ~150 probably wants a third shard.
3. Start Postgres on the runner in `check-windows.yml`. `services:` is not
   available on `windows-latest`, so start the PostgreSQL that the runner
   image ships, create the `reactor` database, and set
   `REACTOR_TEST_PG_URL`. Confirm the image still ships PostgreSQL before
   relying on it; if it does not, install it in the job.
   `packages/reactor/test/factories.ts:981-982` defaults to
   `postgres://postgres:postgres@localhost:5433/reactor`, so either match
   that port or set `REACTOR_TEST_PG_URL` to the port actually used.
   `check-pr-reactor.yml:63` is the precedent for setting it.
4. Extend the comment at the head of `check-windows.yml` to say why reactor
   is in the job, matching how the existing comment justifies each package.

## Risks

- **Postgres on `windows-latest` is the one unproven step.** It is the only
  part of this plan not verified on this machine. If the runner image has
  dropped PostgreSQL, Track D costs an install step and runner minutes. The
  fallback — running reactor on Windows without the `[Postgres]` files — is
  worth less than it looks, because those files are the ones exercising disk
  and process behaviour, so prefer paying for the install.
- **Job time.** 795s wall clock locally at `maxWorkers: 4`, of which 124s is
  import and 2548s is test time across the workers. That is larger than any
  package currently in the Windows job, so reactor alone probably forces a
  third shard and roughly doubles the job's cost. Measure on the runner
  before choosing the shard count. Dropping `--coverage` for the Windows job
  is worth trying first: the job exists for portability, not coverage
  numbers, and the v8 provider instruments every one of those 302 files.
- **Track A3 and B3 are uncovered by construction.** They were fixed with
  their tracks, and `pnpm-command.ts` carries unit tests, but no test
  exercises `fix-ci`'s spawn loop or `run-record-all` end to end — those run
  the whole CI pipeline and a full benchmark set respectively. `pnpm bench:fix
  dist-check` is the one real command cheap enough to have been run. Treat
  `pnpm bench:fix ci` and `pnpm bench:record` on Windows as untested.
