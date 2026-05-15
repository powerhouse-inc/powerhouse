# `scripts/release/` — interactive release helper

TypeScript port of the (now legacy) `scripts/release.sh`. Walks a developer through dev / staging / production releases — branch prep, optional baseline / merge / release-notes work, the GitHub Action trigger, and (for production) the Discord announcement. Same UX as the bash version; same procedural contract documented in [`RELEASE.md`](../../RELEASE.md).

## Run

```bash
pnpm release-wizard                    # interactive, real run
pnpm release-wizard --dry-run          # interactive; never pushes, never triggers
pnpm release-wizard --check-deps       # only run the dependency preflight, exit
pnpm release-wizard --resume-from=5    # skip past every step below 5 in whichever flow you re-enter
pnpm release-wizard --help
```

Critical actions (`git push`, workflow trigger) always present a three-way prompt — _script does it / I'll do it manually / abort_ — so you can fall back to running things yourself when desired. Other state-changing actions (`checkout`, `pull`, `merge`, `commit`, `nx release version`) prompt with `[Y/n]` and announce the command before running.

## Architecture

Six files, each grouping the helpers it owns. Imports flow strictly downward (`index → flows → actions → ui/exec → lib`).

```
index.ts        cmd-ts entry, signal handlers, top-level error mapping,
                preflight (dep checks + fetch + working-tree-clean) and
                the "dev / staging / prod / quit" channel picker
lib.ts          ReleaseContext type, AbortError (130) + FatalError (1),
                shared constants (workflow file, marker strings, …)
exec.ts         subprocess primitives (runLocal / runCapture / runQuiet /
                echoSkipped, child tracking) and all git helpers (tag
                listing, branch listing, verifyPush, repo-path resolve)
ui.ts           output helpers (info / ok / warn / err / section /
                targetBox / renderScreen), enquirer-based prompts
                (confirm / selectOption / threeWay / confirmAction /
                pauseForManual / waitForEnter), and the `step()` wrapper
                that drives --resume-from
actions.ts      cross-flow actions: doPush (three-way push + retry),
                doTriggerWorkflow (three-way trigger + tail),
                askDryRunInput, generateNotesWithClaude (claude spawn,
                stdout tee, marker extraction), printManualNotesInstructions
flows.ts        flowDev (4 steps), flowStaging dispatcher + 3 sub-flows
                (continue-line 8 / new-adjacent 7 / non-adjacent 9),
                flowProduction (10 steps; chained dry-run-then-real,
                Discord output)
```

## Adding a step to a flow

```ts
import { step, confirmAction } from "./ui.js";

await step(ctx, 4, TOTAL_STEPS, "Do the thing", async () => {
  await confirmAction(ctx, "Description of the thing", "git", [
    "checkout",
    branch,
  ]);
});
```

Bump `TOTAL_STEPS` when adding a step, and review whether the change is resume-safe (see below).

## `--resume-from` contract

`--resume-from=N` means **steps 1..N-1 are already done externally**. The user is responsible for the working state matching what those steps would have produced. Flows that resume past a choice-capturing step either derive the value from the current git state (e.g. `branch = currentBranch()`) or fail with a clear "re-run from step M" message.

| Flow                  | Resume-safe                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| dev                   | always                                                                                                                    |
| staging continue-line | yes, past step 2 (`branch` derived from `currentBranch()`)                                                                |
| staging new-adjacent  | partial — `mode` not recoverable past the choice step                                                                     |
| staging non-adjacent  | partial — target/baseline not recoverable past their choice steps                                                         |
| production            | yes, past step 3 (`prodBranch` from `currentBranch()`); `mode` defaults to `"patch"` (re-run from step 2 for minor/major) |

## Known minor differences vs. the bash version

- **Numeric shortcut keys** in arrow-key menus behave per `enquirer`'s built-in handling rather than the bash's custom keystroke reader. Functionally equivalent; visual cues may differ slightly.
- **Color output** is gated by `chalk` (which honors `FORCE_COLOR` / `NO_COLOR`) rather than bash's `[ -t 1 ]`. With `FORCE_COLOR=1` piped output will be colored — bash would have suppressed it.
- **Pager** in production step 5 uses `$PAGER` (or `less`) with a graceful fallback to printing the diff inline if the pager isn't on PATH.

## Reverting to the bash version

If something breaks:

```bash
mv scripts/release.sh.legacy scripts/release.sh
chmod +x scripts/release.sh
bash scripts/release.sh
```

## Related

- [`RELEASE.md`](../../RELEASE.md) — the procedural guide this script automates.
- [`.github/workflows/release-branch.yml`](../../.github/workflows/release-branch.yml) — the workflow this script triggers.
- [`releases/release.ts`](../../releases/release.ts) — the Nx release driver invoked _by_ that workflow (different tool).
- [`.claude/skills/release-notes/SKILL.md`](../../.claude/skills/release-notes/SKILL.md) — the Claude skill used by the production flow to draft release notes + the Discord message.
