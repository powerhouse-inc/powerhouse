# Test shard weights

`test-weights.json` and `test-weights.windows.json` contain package durations in
seconds for `test-shard.ts`. Weights affect assignment to shards. The root
`test:ci` and `test:ci:platform` scripts determine which packages run.

CI builds the dependencies before running a shard. Its test commands use
`--no-sort` so a package's tests do not wait for its dependencies' tests, with
`--workspace-concurrency=2` and Vitest's `--maxWorkers=2` to limit competition
for runner CPU and memory at both levels. Suites with `fileParallelism: false`
still use one worker. A package limit alone lets each suite consume the whole
runner; Windows CLI tests timed out while overlapping reactor-api without a
worker limit.
`--no-bail` keeps the remaining suites running after a failure; any failed suite
still fails the job. Builds keep their dependency ordering.

Switchboard runs two isolated test forks in CI and keeps one worker locally.
The stored weights below predate that change; refresh them from GitHub runs
after rollout rather than extrapolating Windows durations from local runs.

Run `node --test scripts/test-shard.test.mjs` to check package coverage, build
selectors, concurrent execution, and failure propagation with the installed pnpm.

`update-test-weights.py` reads the CI baseline collector's `suites_raw.json`.
It takes the median successful Vitest duration for each package and platform,
rounded to one decimal place. Existing weights without samples stay unchanged.
Packages removed from the checkout are reported and skipped. Invalid input or
a period without measurements for both platforms fails before either file changes.

The current refresh uses the `2026-11-05` snapshot, period `early Nov`, from PRs
3365, 3369, and 3377. Each refreshed package has three samples: 33 Linux packages
and 13 Windows packages. Packages without samples retain their existing weights.
These historical durations are scheduling estimates; they do not measure the
speedup from a new schedule or account for contention between concurrent suites.

Run from the repository root with Python 3.9 or later:

```sh
python3 scripts/update-test-weights.py \
  .agent-local/ci-baseline/snapshots/2026-11-05/suites_raw.json \
  --period 'early Nov'
```

The snapshot is a local analysis artifact and is not checked into Git. Pass its
absolute path when running from another worktree. Add `--check` to verify that
the files match the input without writing them.

The collector records one JSON object per package run. The refresh reads these
fields:

```json
{
  "period": "early Nov",
  "workflow": "Check Commit",
  "job": "Test (shard 1/3)",
  "package": "packages/reactor-api",
  "runner": "vitest",
  "passed": 2399,
  "failed": 0,
  "duration_s": 428.0
}
```

Windows samples use workflow `Check Windows` and job `check-windows (shard N/2)`.
Package paths resolve through the current checkout's `package.json` names.
Use a fresh snapshot after changing suite concurrency or the runner environment.
