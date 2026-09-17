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
| `run --tasks a,b --arms A,B --n 3 --concurrency 2 [--dry-run]` | run the matrix |
| `resume <runId>` | continue an interrupted run |
| `report <runId>` | rewrite `REPORT.md` |
| `inspect [runId]` | list Mastra runs or dump one run's steps |
| `catalog list \| validate` | inspect the task catalog |
| `extract <transcript> --workspace <dir> --docs <dir>` | run the extractor standalone |
| `records verify \| show <key> \| summary` | the findings store |

`--dry-run` swaps the Claude driver for a fixture-backed fake and skips
installs, so the whole pipeline runs offline in seconds; its FINDINGS and RUNS
lines go into the run directory, never into the committed files.

`--runs-root`, `--state-dir` and `--recipes-root` relocate the run directory,
the Mastra DB and the recipes checkout (default: a sibling of the monorepo).
Each attempt's `workspace/node_modules` is removed once it is graded unless
`--keep-workspaces` is passed.

Because `runs/` sits inside the monorepo, the sandbox denies the monorepo's
sibling directories along the path to it rather than the root, so the builder
can read its own workspace but nothing else in the checkout.

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
