Run the bench record loop over one benchmark: record it, file what it shows,
then check whether those findings hold.

Benchmark: $ARGUMENTS (one of `auth`, `events`, `queue`, `queue-only`,
`cache`, `sync`). If none was given, ask which one rather than guessing.

## Why this is sequential

`withLock` is `O_EXCL` with no retry, so a second writer gets exit 68 and loses
its work. Never run two phases at once, and never run this command twice
concurrently.

## Step 0 — snapshot

```bash
pnpm --filter @powerhousedao/reactor bench:records verify --dir bench
jq -r .id packages/reactor/bench/BENCHMARKS.jsonl | tail -1
jq -r .id packages/reactor/bench/TASKS.jsonl | tail -1
git status --porcelain -- packages/reactor
```

Exit 2 on `verify` stops the loop before it starts. A dirty tree stops it too:
the runner refuses, and finding out here is cheaper.

## Step 1 — bench-runner

Spawn `bench-runner` with the benchmark name. Wait for it.

Gate: a new `B-nnn` above the snapshot, and `verify` still exit 0. If the
runner reports it recorded nothing, stop - do not proceed to an analyst with no
new evidence.

## Step 2 — bench-analyst

Spawn `bench-analyst`, pointing it at the B-id the runner reported. Wait.

Gate: run the three invariants below. Each must print nothing.

## Step 3 — bench-verifier

Spawn `bench-verifier`. Wait.

Gate: the three invariants again, plus read its answer to "if nothing was
refuted, what would have made you refute one?". **A run that verified every
task and cannot answer that concretely is a failed run.** Report it as such
rather than passing the statuses along.

## The invariants

Each prints nothing when it holds.

```bash
jq -r 'select(.kind != "HARNESS" and ((.evidence // []) | length) == 0) | .id' packages/reactor/bench/TASKS.jsonl
jq -r 'select([.history[] | select(.status=="FIXED" or .status=="COMMITTED") | .by // ""] | any(startswith("bench-"))) | .id' packages/reactor/bench/TASKS.jsonl
jq -r 'select([.tags[]? | select(startswith("topic:"))] | length != 1) | .id' packages/reactor/bench/TASKS.jsonl
```

In order: a finding with nothing behind it; a status an agent had no business
setting; a task with no topic or more than one. The first and third are the
analyst's; the second means the guard was bypassed and is worth stopping over.

## Exit codes, and what each one means here

| Code | Meaning | What to do |
|---|---|---|
| 1 | the entry was rejected | Hand the error back to the agent once. A second failure stops the loop. |
| 2 | a file on disk does not parse | **Stop.** Print the whole `verify` output. Do not attempt repair - a repair on a file you cannot parse is a guess. |
| 3 | the id is taken | A hand edit or a concurrent writer. Stop and tell the human. |
| 4 | no such id | Re-read the id list once, then stop. |
| 64 | bad arguments | An agent bug. Report the command verbatim. |
| 68 naming `.records.lock` | a writer died holding the lock | **Stop.** Never remove the lock; that can lose the dead writer's work. |

## This command commits nothing

Report what landed and let the human decide. Both record files are tracked, so
the diff is reviewable:

```bash
git diff -- packages/reactor/bench/BENCHMARKS.jsonl packages/reactor/bench/TASKS.jsonl
```

## Report

A table of the three phases with the ids each produced, then the invariant
results, then the verifier's falsification answer quoted in full. Close with
what a second run of this same benchmark would do differently - if the answer
is "nothing, the topics are all filed", that is the loop working.
