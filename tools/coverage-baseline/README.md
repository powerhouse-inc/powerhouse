# Coverage baseline

Measures line coverage of the repository's JavaScript and TypeScript, split by test level: unit, integration, E2E and combined. Keep one run as the baseline; after you change tests, run again and compare to see whether coverage went up or down.

Everything it needs comes with `pnpm install`, apart from Git and Python 3, which macOS and most Linux systems already have.

## Run

```sh
pnpm build                                           # tests import other packages' dist
pnpm test:coverage:baseline --out ~/coverage/main    # unit + integration, about 25 minutes
```

The output folder must be new or empty.

| To measure | Add |
| --- | --- |
| One package or app | `--owner packages/reactor` |
| One level | `--tier unit`, `--tier integration` or `--tier e2e` |
| One suite (ids are in `run.json`) | `--suite vitest:packages/portle:unit` |
| Every level, including E2E | `--all` |
| More parallel test commands | `--jobs 6` (default: one per 12 GiB of memory) |

Integration tests need PostgreSQL. With the usual Docker services running, nothing else is needed. To use your own clusters, set:

- `PH_COVERAGE_REACTOR_PG_URL`: one URL, or several comma-separated URLs for separate clusters, which lets reactor packages run in parallel.
- `PH_COVERAGE_HUB_PG_URL` and `PH_COVERAGE_ANALYTICS_PG_URL`.

E2E (`--all` or `--tier e2e`) also needs Playwright's Chromium (`pnpm exec playwright install chromium`), Docker, Bun 1.4.4+ (`--bun /path/to/bun`) for `test/codegen`, a [recipes](https://github.com/powerhouse-inc/recipes) checkout in `RECIPES_DIR`, and 15 GiB of free disk.

## Compare

```sh
pnpm test:coverage:compare ~/coverage/my-branch                       # totals per level and package
pnpm test:coverage:compare ~/coverage/my-branch ~/coverage/main       # change per level; packages that changed
pnpm test:coverage:compare ~/coverage/my-branch ~/coverage/main --owner packages/reactor
```

Compare runs made with the same tool version, test selection, and services (for example the same PostgreSQL version). A suite that fails in one run lowers that run's numbers. A run filtered with `--owner` still reports against the whole repository, so read its package row, not the repository total.

## Results

| File | Contents |
| --- | --- |
| `report/index.html` | HTML per level: repository, then directories, then annotated source |
| `summary.json`, `<level>-summary.txt` | Line totals per level and per package |
| `lcov/<level>.info` | The baseline data that `compare` reads |
| `run.json` | Every suite's command, outcome, gaps and timings |
| `suites/<job>/` | Each suite's logs, native reports and raw V8 data |

The run exits nonzero and the report says PARTIAL when any suite failed, was skipped, or lost coverage. Failures are recorded as gaps, never as zero coverage. To rebuild the reports from collected data, run again with the same `--out` and `--render-only`.

## How it works

1. **Discover.** pnpm lists the workspace packages. Each package's test scripts and Git-visible test files become jobs, one per package, script and level. Custom test commands must be registered in `suites.mjs`.
2. **Classify.** A test file's level comes from its name (`*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`), then from reviewed exceptions and path rules in `suites.mjs`; anything else is unit. Name new tests with their level.
3. **Run.** Each job runs the package's own script with a generated config that adds coverage and excludes the other levels' files. Package coverage thresholds are switched off.
   - Vitest and `node --test` jobs run in place in your checkout.
   - Playwright, Bun, Docker and consumer scenarios each run in a fresh copy of the checkout that skips nested Git worktrees.
   - A package runs one job at a time. Jobs that share a PostgreSQL cluster, port or Docker builder wait for each other.
   - The longest packages start first, using CI's timings in `scripts/test-weights.json`.
4. **Collect.**
   - Vitest reports its own V8 coverage.
   - Node processes that tests start write raw V8 data (`NODE_V8_COVERAGE`).
   - Chromium coverage comes from the Playwright fixture.
   - Monocart maps the raw data, including built `dist` files, back to source through source maps.
5. **Report.** One Vitest pass converts every source file without running it, which fixes each file's set of lines. Every level counts hits on that same set, so levels and runs share one denominator. Combined is the union of the levels. istanbul renders the HTML.

### Safety in place

- **Restore point.** Before the first in-place job, the run stores `git stash create` as `restorePoint` in `run.json`, so tracked files a test rewrites can be restored.
- **Changed source.** A job that changes measured source loses its coverage, and no later in-place job starts. Other lasting changes mark the run incomplete.
- **Process cleanup.** Each command runs in its own process group with a unique `PH_COVERAGE_OWNER` environment marker. When it ends, its group and any detached process carrying the marker are stopped, and nothing else is.

### Limits

- **Some lines go uncounted.** Lines that the converter reports only when they run, such as a class declaration whose constructor ran, are outside the fixed set. In a full unit run that is about 2% of hits.
- **E2E numbers are approximate.** Monocart counts lines differently, so about 17% of E2E hits fall outside the fixed set. Compare E2E only with E2E.
- **Browser workers are partial.** A script that ran before the profiler attached is left out and recorded as a gap. Worker coverage is always marked partial.
- **Some processes go unobserved.** Docker builds, remote processes and nested Bun processes are not measured.
- **System binaries escape cleanup.** On macOS, `ps` cannot read the environment of system binaries, so a detached `sh` or `sleep` escapes the marker.

## Playwright fixture

Specs that should report Chromium coverage import Playwright through this package:

```ts
import { expect, test } from "@powerhousedao/coverage-baseline/playwright";
```

Outside a coverage run this is plain `@playwright/test`. During one, it attaches to each page and worker before it loads. Use `closeContext` and `closePage` for explicit closes so their coverage is exported. A project config must not set `use.launchOptions`.

## Not measured here

Run these checks with their own commands; they add nothing to the line totals:

- Benchmarks.
- Compiler and consumer type checks.
- Chromatic visual tests.
- Documentation and agent evaluations.
- Windows and package-manager CI matrices.
- Lua unit tests and OpenResty integration (`apps/switchboard-lb`).
- Load-balancer verification.

## Test this tool

```sh
pnpm test:coverage:proof
```

It runs small pnpm, Vitest, Node, Bun and Playwright fixtures through the real command and needs Playwright's Chromium and Bun.

This README is copied into each report.
