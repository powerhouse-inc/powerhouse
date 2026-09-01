Process the benchmark records that have not been processed yet: file what they
show, then check whether those findings hold.

**Takes no argument.** Recording a benchmark is `/bench-record <name>`, which is
slow and explicit and belongs to whoever wants a fresh number. This command
reads what is already on disk, so it is cheap and can be run any time.

## Why this is sequential

`withLock` is `O_EXCL` with no retry, so a second writer gets exit 68 and loses
its work. Never run two phases at once, and never run this command twice
concurrently.

## Step 0 — gate

```bash
pnpm --filter @powerhousedao/reactor bench:records verify --dir bench
```

Exit 2 stops the loop before it starts. Print the output and do not repair.

## Step 1 — find the work

```bash
jq -r .id packages/reactor/bench/BENCHMARKS.jsonl | sort > /tmp/bench-all.txt
jq -r '[.evidence[]?] + [.history[].evidence[]?] | .[]' packages/reactor/bench/TASKS.jsonl | sort -u > /tmp/bench-cited.txt
comm -23 /tmp/bench-all.txt /tmp/bench-cited.txt
jq -r 'select(.status == "UNVERIFIED") | [.id, .kind, .priority, .title] | @tsv' packages/reactor/bench/TASKS.jsonl
```

The first list is records no task cites: candidates for the analyst. The second
is findings nobody has checked: work for the verifier.

**If both are empty, stop and say so.** That is the loop working, not the loop
failing. Point at `/bench-record <name>` if they want new numbers.

## Step 2 — bench-analyst

For each uncited record, spawn `bench-analyst` pointed at that B-id. One at a
time. Wait for each.

A record it reads and files nothing for stays uncited, so the next run offers it
again. That is deliberate: re-reading a record is a file read, not a benchmark
run, and the analyst's one-topic-per-mechanism rule stops it filing the same
thing twice. If a record keeps coming back with nothing filed, say so - that is
worth knowing about the record.

Gate: run the three invariants below. Each must print nothing.

## Step 3 — bench-verifier

Spawn `bench-verifier` over the UNVERIFIED tasks, including any the analyst just
filed. Wait.

Gate: the invariants again, plus read its answer to "if nothing was refuted,
what would have made you refute one?". **A run that verified every task and
cannot answer that concretely is a failed run.** Report it as such rather than
passing the statuses along.

## The invariants

Each prints nothing when it holds.

```bash
jq -r 'select(.kind != "HARNESS" and ((.evidence // []) | length) == 0) | .id' packages/reactor/bench/TASKS.jsonl
jq -r 'select([.history[] | select(.status=="FIXED" or .status=="COMMITTED") | .by // ""] | any(startswith("bench-"))) | .id' packages/reactor/bench/TASKS.jsonl
jq -r 'select([.tags[]? | select(startswith("topic:"))] | length != 1) | .id' packages/reactor/bench/TASKS.jsonl
```

In order: a finding with nothing behind it; a status an agent had no business
setting; a task with no topic or more than one. The first and third are the
analyst's to fix. The second means the guard was bypassed and is worth stopping
over.

## Exit codes, and what each one means here

| Code | Meaning | What to do |
|---|---|---|
| 1 | the entry was rejected | Hand the error back to the agent once. A second failure stops the loop. |
| 2 | a file on disk does not parse | **Stop.** Print the whole `verify` output. Do not attempt repair - a repair on a file you cannot parse is a guess. |
| 3 | the id is taken | A hand edit or a concurrent writer. Stop and tell the human. |
| 4 | no such id | Re-read the id list once, then stop. |
| 64 | bad arguments | An agent bug. Report the command verbatim. |
| 68 naming the lock file | a writer died holding it | **Stop.** Never remove it; that can lose the dead writer's work. |

## This command commits nothing

Report what landed and let the human decide. Both record files are tracked, so
the diff is reviewable:

```bash
git diff -- packages/reactor/bench/TASKS.jsonl
```

## Report

Which records were uncited going in and which were analysed; a table of tasks
filed with kind, priority and topic; the verdicts; the invariant results; and
the verifier's falsification answer quoted in full.

Close with what a second run would do. If the answer is "nothing, every record
is cited and every finding is judged", that is the loop working.
