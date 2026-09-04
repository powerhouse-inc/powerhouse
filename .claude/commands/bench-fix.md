Fix one verified bench finding: apply the remedy, show the benchmark moved,
gate the tests independently, commit, and mark the task FIXED at that commit.

Task: $ARGUMENTS - one `T-nnn`, or nothing. **Never more than one.** Two fixes
in one diff cannot be reverted apart, and two tasks cannot share a FIXED sha.
With no argument the gate picks the next VERIFIED task: lowest priority number
first, then the oldest. Use the id it prints everywhere below.

Unlike `/bench-record` and `/bench-loop`, **this command commits.** FIXED
carries the sha of the fix (`set-status --commit`), and that sha does not exist
until the commit does. The agents are still barred from git; the main thread
does the two commits below and nothing else.

## Step 0 — gate

```bash
pnpm --filter @powerhousedao/reactor bench:fix gate            # next VERIFIED task
pnpm --filter @powerhousedao/reactor bench:fix gate T-007      # this one
```

One command, one read. With no id the `next:` line names the task it chose and
the queue behind it; exit 4 with no `next:` task means nothing is VERIFIED -
point at `/bench-loop` and stop. It runs `bench:records verify`, checks the tree, prints
the task with its sites, repro, ranked fixes and every history event including
the verifier's note, lists the cases of every cited benchmark, and probes
Postgres on 5433. The last line is the verdict.

Stop on any non-zero exit: 2 means a record file does not verify (print it, do
not repair); 4 means no such task; 5 means the tree is dirty (the fix diff has
to stand alone); 6 means the task is not **VERIFIED**. UNVERIFIED means nobody
has checked the finding yet - point at `/bench-loop`. REFUTED, FIXED and
COMMITTED are not work.

Read the printed history to the end before spawning anything. The verifier's
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
- the report names the criterion file `bench:fix criterion` wrote and quotes
  `bench:fix compare`'s verdict line; compare itself refuses a criterion that
  postdates the after-run
- the report's Tests row names every package in `git diff --stat`

If the criterion was **missed**, stop here. Leave the diff in the tree for the
human, report what the fixer found, and do not commit. A fix that did not move
the number is not FIXED. If it was **partially met**, that is the human's call:
report it and ask before committing.

## Step 2 — verify

Spawn `verify`. It runs `bench:fix ci` in the background and waits on the
summary file with Monitor - one process, one table, no polling. `ci` scopes
itself from the uncommitted diff, rebuilds every stale dist in the workspace
plus the owning packages, and runs what check-commit runs. Wait.

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

## Step 4 — record the fixed state

The tree is clean and the fix has a sha, so this is the first moment a record
can measure the fix and name the commit it measured. Do it here, not later:
the fixer's before and after live in a scratchpad and a gitignored results
file, so without this step FIXED is testimony and the proof is thrown away.

Which benchmark: the `command` field of the record the task cites. B-006's
`bench:queue:record` means `queue`; B-007's `bench:cache:record` means `cache`.

Spawn `bench-runner` with that one name, and tell it to pass:

- `--task <T-id>` so the record names the task it bears on
- `--supersedes <the cited B-id>` when the fix was **HARNESS**. A harness fix
  changes what the numbers mean, so the old entry is not a comparable
  baseline and has to say so - otherwise the next reader diffs the two and
  reads a speedup that is only the apparatus changing.

**This is slow, a second time.** `sync` is about nine minutes, so a T-009 pays
it twice in one command; say so before starting rather than after. Do not run
it alongside anything else - `withLock` is `O_EXCL` with no retry.

If the runner refuses because the tree is dirty, something in Step 3 was left
unstaged. Fix that rather than passing `--allow-dirty`: the whole point of this
step is a sha that names the code that ran.

## Step 5 — mark it FIXED at that sha

```bash
pnpm --filter @powerhousedao/reactor bench:records set-status T-007 FIXED --dir bench --by claude --commit <sha> --evidence B-007 --evidence B-014 --note "<the fixer's 'For the FIXED note' paragraph, plus verify's coverage gap if any>"
```

`--evidence` is repeatable, one flag per B-id: every id the task already cited
**plus the record from Step 4**. `set-status` enforces that: FIXED needs `--commit`, and it needs one
cited record whose `environment.reactorSha` matches it, or it exits 5 and
writes nothing. `--by claude` matches the FIXED events on record. The note
carries the criterion, before and after, and the test result, so the next
reader does not need the transcript.

Then the second commit, carrying both record files:

```bash
git add packages/reactor/bench/BENCHMARKS.jsonl packages/reactor/bench/TASKS.jsonl
git commit -m "chore(reactor): mark T-007 fixed at <sha>"
```

Never set COMMITTED. That is for whoever lands the branch.

## Exit codes, and what each one means here

| Code | Meaning | What to do |
|---|---|---|
| 2 | a record file does not parse | **Stop.** Print the whole `gate` output. Do not repair. |
| 4 | no such task | Re-read the id list once, then stop. |
| 5 | `gate`: the working tree is dirty | **Stop.** The fix diff has to stand alone; say what is dirty. |
| 5 | `set-status`: FIXED with no run measured at that sha | Step 4 did not happen, or its record was not cited. Record the bench on the clean tree and cite it; do not reach for a different sha. |
| 6 | `gate`: the task is not VERIFIED | **Stop.** Say which status it has and point at `/bench-loop`. |
| 8 | `ci`: a check went red | Follow the verify table above. |
| 64 | bad arguments to `set-status` or `bench:fix` | Report the command verbatim. |
| 68 naming the lock file | a writer died holding it | **Stop.** Never remove it. |

## Report

The fixer's table; `verify`'s table with its coverage statement quoted; the new
`B-nnn` with the cases it recorded; the two shas. Then the fixer's "For the
analyst" section verbatim, so a new finding is not lost between commands.

The fixer's numbers are evidence that the fix worked; the record from Step 4 is
the measurement, and it is now part of this command rather than a handoff.
Close by pointing at `/bench-loop`, which reads that record and files what it
shows - including anything in the fixer's "For the analyst" section.
