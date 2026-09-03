Fix one verified bench finding: apply the remedy, show the benchmark moved,
gate the tests independently, commit, and mark the task FIXED at that commit.

Task: $ARGUMENTS - one `T-nnn`. **Exactly one.** Two fixes in one diff cannot
be reverted apart, and two tasks cannot share a FIXED sha.

Unlike `/bench-record` and `/bench-loop`, **this command commits.** FIXED
carries the sha of the fix (`set-status --commit`), and that sha does not exist
until the commit does. The agents are still barred from git; the main thread
does the two commits below and nothing else.

## Step 0 — gate

```bash
pnpm --filter @powerhousedao/reactor bench:records verify --dir bench
git status --porcelain
pnpm --filter @powerhousedao/reactor bench:records show T-007 --dir bench
```

Stop if: `verify` exits 2 (print it, do not repair); the tree is dirty (the
fix diff has to stand alone); or the task is not **VERIFIED**. UNVERIFIED means
nobody has checked the finding yet - point at `/bench-loop`. REFUTED, FIXED and
COMMITTED are not work.

Read the task's `history[]` yourself before spawning anything. The verifier's
note is what the fixer should follow when it disagrees with `details`, and you
need to know what it said to judge the fixer's report.

## Step 1 — bench-fixer

Spawn `bench-fixer` pointed at the T-id. Wait. Sync tasks can take a while;
the repro alone is about nine minutes.

Gate, each must hold:

```bash
git diff --quiet -- packages/reactor/bench/BENCHMARKS.jsonl packages/reactor/bench/TASKS.jsonl && echo records untouched
git diff --stat
```

- the record files are untouched (the guard enforces this; this is the belt
  for its braces)
- the report states the criterion **before** the after-run, and says whether
  it was met
- the report's Tests row names every package in `git diff --stat`

If the criterion was **missed**, stop here. Leave the diff in the tree for the
human, report what the fixer found, and do not commit. A fix that did not move
the number is not FIXED. If it was **partially met**, that is the human's call:
report it and ask before committing.

## Step 2 — verify

Spawn `verify`. It scopes itself from the uncommitted diff, rebuilds stale
dists, and runs what CI runs, read-only. Wait.

| verify says | Do |
|---|---|
| green | continue |
| **red** | Send the failure back to `bench-fixer` once, then run `verify` again. A second red stops the command: leave the diff, report both runs, do not commit. |
| **partial** (a named gap: no PG on 5433, no browser) | continue, and carry the gap verbatim into the FIXED note. A T-007 without Postgres will land here; say so rather than pretending. |

## Step 3 — commit the fix

Stage only the code the fixer changed, never the record files:

```bash
git add <files from git diff --stat>
git commit -m "<type>(<pkg>): <what is now true>"
```

Precedent for the message, by kind:

- HARNESS: `fix(reactor): the sync bench times writes to convergence and nothing else`
- DEFECT: `fix(shared): the write-cache rebuild reuses the stored hash instead of recomputing it`
- GAP: `feat(reactor): the sync bench isolates cross-reactor contention`

The subject says what the code now does, not which task it closes. lint-staged
runs `eslint --fix` on the staged files; if it rewrites them, the commit still
lands with the rewritten content.

```bash
git rev-parse --short=9 HEAD
```

## Step 4 — mark it FIXED at that sha

```bash
pnpm --filter @powerhousedao/reactor bench:records set-status T-007 FIXED --dir bench --by claude --commit <sha> --evidence B-007 --note "<the fixer's 'For the FIXED note' paragraph, plus verify's coverage gap if any>"
```

`--evidence` is every B-id the task already cites; `--by claude` matches the
three FIXED events on record. The note carries the criterion, before and after,
and the test result, so the next reader does not need the transcript.

Then the second commit, record file only:

```bash
git add packages/reactor/bench/TASKS.jsonl
git commit -m "chore(reactor): mark T-007 fixed at <sha>"
```

Never set COMMITTED. That is for whoever lands the branch.

## Exit codes, and what each one means here

| Code | Meaning | What to do |
|---|---|---|
| 2 | a record file does not parse | **Stop.** Print the whole `verify` output. Do not repair. |
| 4 | no such task | Re-read the id list once, then stop. |
| 64 | bad arguments to `set-status` | Report the command verbatim. |
| 68 naming the lock file | a writer died holding it | **Stop.** Never remove it. |

## Report

The fixer's table; `verify`'s table with its coverage statement quoted; the
two shas. Then the fixer's "For the analyst" section verbatim, so a new finding
is not lost between commands.

Close with the next step, which is always the same: `/bench-record <name>` on
the clean tree makes the after-fix record, and `/bench-loop` then reads it. The
fixer's numbers are evidence that the fix worked; the record is the measurement.
