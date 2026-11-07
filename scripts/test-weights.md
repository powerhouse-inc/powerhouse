# Test shard weights

`test-weights.json` and `test-weights.windows.json` contain package durations in
seconds for `test-shard.ts`. Weights affect assignment to shards. The root
`test:ci` and `test:ci:platform` scripts determine which packages run.

CI builds the dependencies before running a shard. Test commands use `--no-sort`
and `--workspace-concurrency=1`: packages run one at a time, with each package's
own Vitest worker settings. The earlier two-package schedule caused CLI and
Switchboard timeouts even with two Vitest workers per package. `--no-bail` keeps
remaining suites running after a failure; any failed suite still fails the job.
Builds keep their dependency ordering.

Switchboard runs two isolated test forks on Linux CI and keeps one worker on
Windows and locally. The stored weights below predate that Linux change; refresh
them from successful GitHub runs after rollout.

Run `node --test scripts/test-shard.test.mjs` to check package coverage, build
selectors, execution without overlap, and failure propagation with the installed
pnpm.

`update-test-weights.py` reads the CI baseline collector's `suites_raw.json`.
It takes the median successful Vitest duration for each package and platform,
rounded to one decimal place. Existing weights without samples stay unchanged.
Packages removed from the checkout are reported and skipped. Invalid input or
a period without measurements for both platforms fails before either file changes.

The current refresh uses successful PRs [3381], [3382], and [3383] from
November 5–6, 2026, period `Nov 5-6 recent PRs`: 101 samples for 34 Linux packages
and 39 samples for 13 Windows packages. Packages without samples retain their
existing weights. These historical durations are scheduling estimates. Package
contents and resource contention differ between runs, so they do not predict a
speedup from the new schedule.

[3381]: https://github.com/powerhouse-inc/powerhouse/pull/3381
[3382]: https://github.com/powerhouse-inc/powerhouse/pull/3382
[3383]: https://github.com/powerhouse-inc/powerhouse/pull/3383

Run from the repository root with Python 3.9 or later:

```sh
python3 scripts/update-test-weights.py \
  .agent-local/ci-optimization/suites_raw.json \
  --period 'Nov 5-6 recent PRs'
```

The snapshot is a local analysis artifact and is not checked into Git. Pass its
absolute path when running from another worktree. Add `--check` to verify that
the files match the input without writing them.

The collector records one JSON object per package run. The refresh reads these
fields:

```json
{
  "period": "Nov 5-6 recent PRs",
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
