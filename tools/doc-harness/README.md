# doc-harness

Validates the Academy's reactor documentation by treating a docs-only Claude
agent as a stand-in for a new developer. For each task in the catalog, a
builder agent whose only reference is a snapshot of `apps/academy/docs/academy`
is asked to build a recipe against the published `@powerhousedao/*` packages.
The recipe's own tests grade the build, the transcript is mined
deterministically, and a judge agent with access to the docs and the installed
`.d.ts` files reports where the documentation was wrong, stale, missing or
unclear. A verifier reproduces or downgrades each finding before it is recorded.

Orchestration is a Mastra workflow (`harnessRun` fanning out to `taskRun`);
every LLM call is a `claude -p` child process, never a Mastra agent.

```sh
pnpm doc-harness catalog list
pnpm doc-harness run --tasks custom-read-model --arms A,B --n 1
pnpm doc-harness report <runId>
pnpm doc-harness records summary
```

## Design

Two arms per task control for confounds: **A** sees the docs only; **B** also
sees the reference recipe. If B fails too, the docs are not the bottleneck.
Findings are only recorded from attempts whose transcript shows no
contamination (reads outside the docs and workspace, network use).

The builder runs under `--permission-mode dontAsk` with deny rules for the
monorepo, the recipes checkout and `~/.claude`, plus the Claude Code sandbox
block that closes the Bash interpreter hole (a plain deny rule stops `cat` but
not `python3 -c "open(...)"`). The user's plugins, hooks, MCP servers and
CLAUDE.md are excluded with `--setting-sources ""`, `--strict-mcp-config` and an
empty MCP config. `--bare` is not used because it requires an API key and the
harness runs on the claude.ai login.

Reads of `node_modules/**/*.d.ts` are allowed and counted as `dts-read`
escapes: the headline metric for "the docs did not answer the question".

## Layout on disk

```
runs/<runId>/
  run.json  docs/  docs/INDEX.md  REPORT.md
  <taskId>/<A|B>/<n>/
    workspace/                the builder's cwd, installed at the pin
    transcript.stream.jsonl   claude -p stdout
    session.jsonl             the on-disk session file, copied
    prepare.json build.json tests.json metrics.json transcript.compact.md
    judge.json verify.json attempt.json
FINDINGS.jsonl  RUNS.jsonl    committed, append-only
state/harness.db              Mastra snapshots (gitignored)
```

Every step is idempotent on its output file, so `resume <runId>` re-drives the
workflow and skips finished work.

## Commands

| command | purpose |
|---|---|
| `run --tasks a,b --arms A,B --n 3 --concurrency 2 [--dry-run] [--throttle-at 0.9]` | run the matrix |
| `resume <runId> [--redo-failed [reasons]] [--throttle-at <ratio>]` | continue an interrupted run; optionally redo failed attempts first |
| `report <runId>` | rewrite `REPORT.md` |
| `inspect [runId]` | list Mastra runs or dump one run's steps |
| `catalog list \| validate` | inspect the task catalog |
| `extract <transcript> --workspace <dir> --docs <dir>` | run the extractor standalone |
| `records verify \| show <key> \| summary` | the findings store |

`--dry-run` swaps the Claude driver for a fixture-backed fake and skips
installs, so the whole pipeline runs offline in seconds; its FINDINGS and RUNS
lines go into the run directory, never into the committed files.

`--redo-failed [reasons]` (default `rate-limited,wall-clock`) resets every
attempt whose build, judge or verifier failed for one of the listed reasons
before the run is re-driven: the failed step's outputs and everything
downstream move to `<attempt>/previous/<n>/` (a build redo also sets the
workspace aside, minus `node_modules`), the attempt's lines leave
`FINDINGS.jsonl`, the run's line leaves `RUNS.jsonl` and `run.json` is
reopened so the summary re-appends it. A judge or verifier redo keeps the build
and its grading. A reason may be scoped to one step (`judge:budget-exhausted`);
`record:budget-exhausted` only re-records matching attempts (attempt.json and
their findings lines) so a new status taxonomy applies without redoing work.
`acceptance:tsc` (tests.json has `tscOk: false`), `acceptance:vitest`
(`vitestOk: false` or suite errors) and `acceptance:any` (every graded
attempt) re-grade without re-judging: `tests.json`, `vitest.json`, `tsc.log`,
`vitest.log` and `attempt.json` move aside, the findings lines leave, and
`judge.json` and `verify.json` stay. Every rule that matches an attempt
applies to it: an attempt with a failed judge and a stale grade has both
redone in one pass, the files moved aside being the union of each step's, and
the `redo …` line names every rule. The final `run …:` line counts what was
redone by rule. The acceptance step rewrites the workspace's `tsconfig.json`
(and `vitest.config.ts` unless the task pins one) from the current scaffold
before grading. The acceptance step and the verifier (which compiles probes in
the workspace) reinstall `node_modules` from the run's cached lockfile
(`.install-cache/<taskId>/pnpm-lock.yaml`, about a second offline) when a
recorded attempt has already had it removed.

`report <runId>` works mid-run: attempts that `run.json` does not list yet are
read from their `attempt.json`, and while the run is open the header says
`partial: N of M attempts` when the matrix in `run.json.args` is larger. Pass
rates note how many of their passes were truncated builds
(`67% (12/18, 7 truncated)`).

`--throttle-at <ratio>` (default `0.9`, `0` disables) holds new `claude`
processes while the account's five-hour rate-limit window is at or above the
ratio, polling every minute for up to 15 minutes. The CLI only reports
utilisation in `rate_limit_event` records, which the driver surfaces when a
process ends, so the reading is always one process stale: a wait ends early
only when a concurrent process finishes with a lower reading. Judge and
verifier budgets scale with their input (one dollar per 40 KB of compact
transcript, $0.75 per kept finding), capped at three times the catalog value;
their wall clocks grow five minutes per 100 KB, capped at 45 minutes. The
effective limits are recorded in `judge.json` and `verify.json`.

`--runs-root`, `--state-dir` and `--recipes-root` relocate the run directory,
the Mastra DB and the recipes checkout (default: a sibling of the monorepo).
Each attempt's `workspace/node_modules` is removed once it is graded unless
`--keep-workspaces` is passed.

Because `runs/` sits inside the monorepo, the sandbox denies the monorepo's
sibling directories along the path to it rather than the root, so the builder
can read its own workspace but nothing else in the checkout.

## Failure classes

Every attempt ends in one `status` (attempt.json, RUNS.jsonl, the report).
Rate-limited and contaminated attempts are excluded from pass rates.

| status | meaning | graded | judged | findings | redo |
|---|---|---|---|---|---|
| `infra-fail` | `pnpm install` failed | no | no | no | rerun the install by deleting `prepare.json` |
| `rate-limited` | the builder was killed by the wall clock (or exited without a result) while the CLI was retrying the API: `system/api_retry` was the last word, or three retries fell in the final two minutes | no | no | no | `resume --redo-failed` |
| `build-fail` | the builder failed for any other reason: a genuine `wall-clock` hang, `api-error`, `no-result-record`, `nonzero-exit`, `spawn-error`, `cli-version-drift` | only for `nonzero-exit` | only for `nonzero-exit` | only for `nonzero-exit` | `resume --redo-failed wall-clock,...` |
| `contaminated` | the builder read outside the docs and its workspace, or used the network | yes | yes | dropped | no |
| `complete` | the builder finished and the workspace was graded | yes | yes | yes | no |
| `complete` + `truncated: true` | the builder hit `--max-budget-usd` (`budget-exhausted`) but the workspace was graded and the transcript judged anyway; the report marks it and counts a passing one as a pass | yes | yes | yes | no |

A judge or verifier that fails does not change the attempt's status: the
failure reason lands in `judgeFailed` and the report's `judge` column, and
`resume --redo-failed` redoes that step alone. Killed builders report no cost;
`buildTokens` (summed from the streamed assistant records) stands in for it,
and the report counts such attempts as "unmetered".

## Mastra Studio

`pnpm studio` starts Mastra Studio at http://localhost:4111 on the default
state DB. Workflows > harnessRun shows the step graph, and Runs lists every
run the CLI has made with per-step status, input and output (`inspect` prints
the same from the terminal).

A run can also be started from Studio's form. The input mirrors the CLI:
`runId`, `tasks`, `arms`, `n`, `docsSha` (`HEAD` works), `pin`, and `args`
(`concurrency`, `dryRun`, `sandbox`, `auth`, models, `skipVerify`,
`keepWorkspaces`). With no CLI to register drivers, the steps build a default
context from `args`, so `args.dryRun: true` runs offline on fixtures and
`false` spends real money exactly like `doc-harness run`. The `studio` script
pins `DOC_HARNESS_ROOT` because Studio serves a bundle from `.mastra/` and the
harness resolves its paths from its own location.

### Report in the browser

While Studio is running, the dev server also serves each run's files as HTML
at http://localhost:4111/doc-harness. The index lists every `runs/*/run.json`;
a run page links its rendered `REPORT.md` (`/doc-harness/runs/<runId>/report`,
or `report.md` for the raw markdown) and each attempt's compact transcript and
JSON files. `doc-harness run` prints the report URL when it finishes;
`DOC_HARNESS_STUDIO_URL` changes the host it prints. The pages only read
inside `runs/` and escape any HTML the report contains.

## Catalog

`catalog/tasks.json` describes each task: a behaviour-level prompt, the
contract (files and exports the hidden tests import), pinned inputs copied into
the workspace (document-model specs and generated code), the acceptance tests,
the packages to install at the pin, and budgets. `scripts/import-pinned.ts`
regenerates `catalog/pinned/` from the recipes checkout when the pin bumps.

## Verified against

- `claude` 2.1.258. The driver refuses to run on another version unless
  `--allow-cli-drift` is passed, because the transcript format is internal.
- `@mastra/core` 1.67.0, `@mastra/libsql` 1.23.0.
- Published Powerhouse packages `6.2.2-dev.62`.

## Development

```sh
cd tools/doc-harness
pnpm test          # fast, offline, no real claude
pnpm tsc && pnpm lint
DOC_HARNESS_INTEGRATION=1 pnpm vitest run test/workspace.test.ts   # real pnpm install
```
