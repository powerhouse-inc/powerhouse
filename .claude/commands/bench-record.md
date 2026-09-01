Record one reactor benchmark: run it, and append what it produced to
BENCHMARKS.jsonl.

Benchmark: $ARGUMENTS (one of `auth`, `events`, `queue`, `queue-only`,
`cache`, `sync`). If none was given, ask which one rather than guessing.

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

Spawn `bench-runner` with the benchmark name. Wait for it.

**These are slow.** `cache` boots PGlite inside every measured iteration,
`queue` does 40,000 awaited enqueues per iteration, and `sync` took about nine
minutes. Do not kill them, do not shorten them, and do not run two at once -
`withLock` is `O_EXCL` with no retry, so the loser gets exit 68 and loses its
work.

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
