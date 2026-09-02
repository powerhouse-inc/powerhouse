Record one reactor benchmark: run it, and append what it produced to
BENCHMARKS.jsonl.

Benchmark: $ARGUMENTS - any of `auth`, `events`, `queue`, `queue-only`,
`cache`, `sync`. **With none given, all six run**, which is the whole point:
one command, serial, no wiring by hand. Say how long that will take before
starting it rather than asking which one.

This command only records. Reading the record and filing what it shows is
`/bench-loop`, which needs no argument and can run long after this one.

## Before you start

```bash
git status --porcelain -- packages/reactor
pnpm --filter @powerhousedao/reactor bench:records verify --dir bench
```

A dirty tree stops this. The record is stamped with the current commit, and on
a dirty tree that sha names code that did not run - the runner refuses, and
finding out here costs a second rather than the whole run.

Exit 2 on `verify` also stops it: do not append to a file that does not parse.

## Run it

Spawn `bench-runner` with whatever was named, or with nothing for all six. Wait
for it.

**These are slow.** `cache` boots PGlite inside every measured iteration,
`queue` does 40,000 awaited enqueues per iteration, and `sync` takes about nine
minutes. `bench:record` runs them one at a time and never in parallel: they
share a machine, and two competing for it measure each other. Do not kill them,
do not shorten them, and do not start a second `bench:record` alongside the
first - `withLock` is `O_EXCL` with no retry, so the loser gets exit 68 and
loses its work.

A partial run exits 1 with a summary naming what failed, and the records that
did land still stand. Report both halves; nothing is retried.

## After

```bash
pnpm --filter @powerhousedao/reactor bench:records verify --dir bench
git diff -- packages/reactor/bench/BENCHMARKS.jsonl
```

Report the new `B-nnn`, the conclusions and caveats the runner read back from
`show`, and anything in the record it did not expect. Then say that
`/bench-loop` is what turns it into findings.

This command commits nothing. The diff is reviewable; landing it is the
human's.
