# Claude Code tooling

Project-scoped agents, commands, skills and hooks for this monorepo.
`settings.local.json` and `worktrees/` are per-machine and stay uncommitted.

## Agents (`agents/`)

- `verify` - runs the real build, typecheck, lint and tests the way CI does, rebuilding stale dists first. Use before calling work done. Read-only.
- `bench-runner` - runs one reactor benchmark and appends it to `BENCHMARKS.jsonl`. Body of `/bench-record`.
- `bench-analyst` - reads unprocessed records and files DEFECT/GAP/HARNESS tasks at UNVERIFIED in `TASKS.jsonl`. Phase 1 of `/bench-loop`.
- `bench-verifier` - reruns a task's repro and sets it VERIFIED, REFUTED or back to UNVERIFIED. Phase 2 of `/bench-loop`.
- `bench-fixer` - fixes one VERIFIED task and shows the cited benchmark moved. Body of `/bench-fix`. Never commits.

## Commands (`commands/`)

- `/bench-record [name]` - record one benchmark (`auth`, `events`, `queue`, `queue-only`, `cache`, `sync`), or all six with no argument. Slow.
- `/bench-loop` - analyst then verifier over every record no task cites yet. Cheap; no argument.
- `/bench-fix [T-nnn]` - fix one VERIFIED task (or the next one the gate picks), commit, record, mark FIXED at the fix sha. The only bench command that commits.
- `/doc-review <section>` - check an academy section for drift against source; writes a gap report.
- `/doc-fix <section>` - apply the minimum edits from that section's gap report.
- `/doc-voice <section> [--apply]` - bring prose in line with `apps/academy/STYLE.md`.
- `/doc-clarity <section>` - review prose clarity and scope. Suggestions only.
- `/doc-capture <section|path> [url]` - refresh a UI walkthrough from a live Playwright capture.
- `/doc-status` - which academy sections have gap reports and open findings.

Doc sections are the ids in `test/ph-lora/ph-lora-mapping.json`. Run order per
section: review, fix, voice, clarity. Background: `test/ph-lora/initial-strategy.md`.

## Skills (`skills/`)

- `adr` - write or revise an ADR in `docs/adr/` in the repo's format and style.
- `release-notes` - prepend a production release entry to `RELEASE-NOTES.md` and draft the Discord announcement. See `RELEASE.md`.

## Workflows (`workflows/`)

- `bench-fix-loop` - runs `/bench-fix` task by task until no VERIFIED task is left. Sequential, never pushes.

## Hooks (`hooks/`)

- `records-guard.sh <role>` - PreToolUse guard that keeps every agent off the record files except through `pnpm bench:records`. Wired project-wide as role `none` in `settings.json`, and per bench agent as `runner`, `analyst`, `verifier` or `fixer`, each allowed only its own verbs.

## Bench pipeline

Records live in `packages/reactor/bench/BENCHMARKS.jsonl` (runs, `B-nnn`) and
`TASKS.jsonl` (findings, `T-nnn`); only the `bench:records` CLI in
`packages/reactor` writes them, under a lock with no retry, so never run two
phases at once.

1. `/bench-record` - measure and append a run.
2. `/bench-loop` - analyst files findings from new runs, verifier reproduces them.
3. `/bench-fix T-nnn` - fix one verified finding; `bench-fix-loop` repeats it until none are left.
