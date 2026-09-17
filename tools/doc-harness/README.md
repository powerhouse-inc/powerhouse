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
installs, so the whole pipeline runs offline in seconds.

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
