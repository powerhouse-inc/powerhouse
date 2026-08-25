# Auth-scope enforcement cost matrix

Companion to `BASELINE.md`. That file measures executor throughput and its
worker pool; this one measures what the four auth feature flags cost, and it
keeps the same shape: a hypothesis, a table, and a named next probe.

## The ladder

`packages/reactor/src/core/feature-flags.ts` defines four flags, each requiring
its predecessor. `validateFeatureFlags` throws on a set that skips one, so 11 of
the 16 subsets are unconstructible and the axis is a ladder rather than a cross
product.

The bottom rung is two cells, not one. Below `authEnforcement` the executor
still runs an interim in-memory `decide()` against the document it already holds
(`simple-job-executor.ts:639`), so a policied document pays a full grant scan
with no extra reads. `L0_POLICIED` against `L2_AUTH_ENFORCEMENT` at the same
grant count therefore separates auth's read cost from the scan they both
perform.

| Level | Flags | Policy installed |
| --- | --- | --- |
| `L0_CLEAN` | none | no |
| `L0_POLICIED` | none | yes |
| `L1_DOCUMENT_DECISIONS` | `documentDecisions` | yes |
| `L2_AUTH_ENFORCEMENT` | `+authEnforcement` | yes |
| `L3_AUTH_GROUPS` | `+authGroups` | yes |
| `L4_AUTH_CONDITIONS` | `+authConditions` | yes |

## Tiers

Three tiers already existed, each with its own A/B mechanism. The matrix adds
the flag axis to each rather than introducing a new runner or report format.

| Tier | Harness | A/B mechanism | Status |
| --- | --- | --- | --- |
| micro | `bench/auth-scope.bench.ts` | `vitest bench --outputJson` / `--compare` | landed |
| meso | `scripts/profiling/reactor-direct.ts` | `pyroscope-analyse.ts --baseline` | flag axis landed, PGlite and Postgres |
| macro | `bench/docker-compose.yml` + k6 + Prometheus | `runNN.sh` appending to `BASELINE.md` | not yet wired |

Micro prices CPU with storage stubbed. It cannot price a read, a lock, or a
keyframe rebuild, and it does not try to: every number below is CPU at the
stated policy shape. The read cost belongs to the meso tier against a real
store, and capacity belongs to the macro tier.

## How to run

```sh
pnpm --filter @powerhousedao/reactor bench:auth              # print
pnpm --filter @powerhousedao/reactor bench:auth:record       # write the baseline
pnpm --filter @powerhousedao/reactor bench:auth:compare      # diff against it
```

Fixture guard, which must pass before any number here is trusted:

```sh
pnpm --filter @powerhousedao/reactor exec vitest run test/bench/auth-policies.test.ts
```

## Environment

| field | value |
| --- | --- |
| host | Benjamins-MacBook-Pro-2.local |
| OS | Darwin 25.6.0 arm64 |
| CPU | Apple M4 Max |
| cores | 14 |
| Node | v24.13.0 |
| reactor SHA | bfbe07dd6 |
| date | 2026-08-24 |
| load avg at start | 4.14 3.70 4.49 |
| storage | stubbed (micro tier) |
| signature verifier | absent (micro tier) |

Reported `rme` ran from 0.18% to 2.76%. A `--compare` re-run of the same build
landed every row between 0.94x and 1.00x of baseline, so this tier resolves
effects above roughly 5% and nothing below it.

## Run 1 - policy evaluation, pure CPU

`evaluateGrantStack` and `evaluateCondition` called directly. No reactor, no
storage.

| cell | ops/sec | mean | note |
| --- | --- | --- | --- |
| 2 grants | 23,774,752 | 0.04 us | |
| 10 grants | 5,217,057 | 0.19 us | |
| 100 grants, match last | 543,594 | 1.84 us | at MAX_AUTH_GRANTS |
| 100 grants, match first | 539,322 | 1.85 us | no early exit |
| 100 grants, denied | 535,010 | 1.87 us | |
| 10 grants, group absent | 5,923,558 | 0.17 us | fails closed, cheapest |
| 10 grants, group of 10 | 3,619,395 | 0.28 us | |
| 10 grants, group of 1000 | 106,041 | 9.43 us | at MAX_GROUP_MEMBERS |
| condition, 1 comparison | 12,515,940 | 0.08 us | |
| condition, 100 nodes depth 2 | 471,616 | 2.12 us | at MAX_CONDITION_NODES |
| condition, max depth 10 | 496,292 | 2.01 us | at MAX_CONDITION_DEPTH |
| 100 grants x 100 condition nodes | 4,844 | 206.45 us | worst legal policy |
| 100 conditional grants, no context | 7,854,391 | 0.13 us | the same policy below the flag |

### Notes on Run 1

**The grant scan has no early exit, and that is now measured rather than read
off the source.** Match-first and match-last differ by 0.5%, inside the noise
floor; an implementation that stopped at the first applicable grant would have
made match-first about 50x faster. Cost is linear in grant count: 10 to 100
grants is 9.7x. Last-applicable-grant-wins is what forbids the early exit, so
this is a property of the policy language, not an optimisation left undone.

**Group membership is the scan's most expensive principal.** A 1000-member
roster costs 9.43 us against 0.28 us for ten, which is about 9.2 ns per member
and consistent with the `toLowerCase()` allocation `principalMatches` performs
per member. A group the map does not hold is the cheapest outcome of all
(0.17 us), which is exactly why a benchmark that forgets to register the group
model reports groups as nearly free: it measures the fail-closed path.

**Conditions are the dominant CPU term in the whole feature.** Node count
matters and depth does not (2.12 us wide against 2.01 us deep). The worst legal
policy - 100 grants each carrying a 100-node `where` - costs **206 us per
decision**, against **0.13 us for the identical policy evaluated below
`authConditions`**, where every conditional grant is skipped without being
evaluated. That is a **1622x** step for turning the flag on at this shape. At
1000 actions/sec it is 21% of a core.

**Next probe:** 206 us is a worst case at both caps simultaneously. Sweep grants
and condition nodes independently to find where a realistic policy sits on that
surface, and confirm whether the cost is the node walk or `compareValues`
calling `Array.from` on both operands per string comparison.

## Run 2 - auth scope write validation

`assertAuthAdministrationRetained`, which fires on every write to the `auth`
scope of a creator-less policy.

| cell | ops/sec | mean |
| --- | --- | --- |
| 10 grants, administered from the top | 12,029,159 | 0.08 us |
| 100 grants, administered from the top | 2,032,685 | 0.49 us |
| 10 grants, administered from the bottom | 246,469 | 4.06 us |
| 100 grants, administered from the bottom | 2,245 | 445.44 us |

### Notes on Run 2

`administrationReachable` uses `.some()`, so it stops at the first candidate
grant that still resolves to allow. Where administration sits in the stack
therefore decides the cost, and it decides it by three orders of magnitude.

Administered from the top the check is linear and free: 0.49 us at the grant
cap. Administered from the bottom it is quadratic - 10 to 100 grants is 110x -
and reaches **445 us**, a **905x spread against the top-administered policy of
the same size**.

Both stacks are installable. The bottom-administered fixture keeps
administration reachable through a final address-scoped grant while a blanket
deny shadows all 98 candidates above it, and
`test/bench/auth-policies.test.ts` asserts that it passes
`assertValidInitialGrants` and that every shadowed candidate really does resolve
to deny. This is a policy a deployment can hold, not a shape the validator would
refuse.

**Next probe:** this is a validation cost on auth-scope writes only, so its
weight depends entirely on how often a deployment rewrites grants. Measure
`SET_GRANT` rate in a real workload before treating 445 us as significant. If it
matters, ordering the administration grant first is a one-line policy change
with a 908x payoff - which is worth documenting for operators regardless.

## Run 3 - the admission gate, storage stubbed

`decideAtHead` with a stream reader that answers from memory, at 100 grants.

| level | ops/sec | mean | vs L1 |
| --- | --- | --- | --- |
| `L0_CLEAN` | 1,986,444 | 0.50 us | 0.98x |
| `L0_POLICIED` | 2,052,023 | 0.49 us | 1.00x |
| `L1_DOCUMENT_DECISIONS` | 2,042,899 | 0.49 us | 1.00x |
| `L2_AUTH_ENFORCEMENT` | 359,966 | 2.78 us | 5.67x |
| `L3_AUTH_GROUPS` | 315,578 | 3.17 us | 6.47x |
| `L4_AUTH_CONDITIONS` | 317,379 | 3.15 us | 6.43x |

Group fan-out at `L3`, 10 grants, reads stubbed:

| distinct groups | ops/sec | mean |
| --- | --- | --- |
| 1 | 569,777 | 1.76 us |
| 2 | 398,803 | 2.51 us |
| 5 | 207,681 | 4.82 us |

### Notes on Run 3

**The step is L1 to L2 and nothing else.** The three bottom rows are flat within
noise, and they are a control rather than a measurement: below `authEnforcement`
the registered model is the document model, which reads no auth scope at all.
The interim in-memory check that makes `L0_POLICIED` differ from `L0_CLEAN`
lives in the executor, not in `decideAtHead`, so it is priced by Run 1 and will
be priced end to end by the meso tier. Read these rows as evidence that the gate
ignores the policy below `L2`, not as evidence that the interim gate is free.

**With reads stubbed, groups and conditions cost almost nothing.** L2 to L4 is
+13%, barely outside the noise floor. That is the intended finding: at the head
of a stream, `authGroups` and `authConditions` do not add CPU, they add reads -
one `getState` per distinct group, plus one for the executing scope under
conditions. The fan-out table shows the residue that survives instant reads,
about +0.77 us per group of model assembly, which real I/O will dominate.

**Next probe:** everything expensive about L3 and L4 is now known to be I/O, so
the meso tier against real Postgres is where the matrix continues. Two specific
costs are invisible here and must be measured there: the `pg_advisory_xact_lock`
that `store.ts:291` takes over every read-set stream, which serialises writes
across all documents sharing a group; and the append-condition retry, which
`job-result-handler.ts:104` exempts from the retry limit for up to 20 attempts,
re-running the whole gate each time against an invalidated write cache.

## Run 4 - the read gate

`scopePredicate` over four scopes. Reads are gated on the `ReactorClient` in the
host process, so none of this is absorbed by the executor's worker pool.

| cell | ops/sec | mean |
| --- | --- | --- |
| `ModelReadGate`, uninitialized policy | 5,646,378 | 0.18 us |
| `BareReadGate`, 100 grants | 428,552 | 2.33 us |
| `ModelReadGate`, 100 grants | 321,639 | 3.11 us |
| `ModelReadGate`, 100 grants, denied | 313,515 | 3.19 us |
| group roster, 1 referencer | 271,847 | 3.68 us |
| group roster, 10 referencers | 43,905 | 22.78 us |
| group roster, 100 referencers | 4,780 | 209.21 us |

### Notes on Run 4

**The uninitialized fast path is 17x cheaper than the policied one**, and it is
the single most dangerous cell in the matrix. `ownPolicyPredicate` returns
`() => true` for a document whose policy has no version, so a harness that
forgets `INITIALIZE_AUTH` measures 0.18 us and concludes the read gate is free.
Every other row on this table required a real policy to exist.

**Routing reads through the decision model costs +33% over evaluating the policy
alone** (3.11 us against `BareReadGate`'s 2.33 us). Both scan 100 grants across
four scopes; the difference is model assembly.

**Serving a shared group roster is the read path's worst case by two orders of
magnitude.** Cost is linear in referencers - 209 us at the
`MAX_EXAMINED_REFERENCERS` bound of 100, 57x the single-referencer case -
because deciding whether to serve a roster rebuilds each referencing document's
decision model in turn. The walk runs at concurrency 4 and stops at the first
referencer that serves, so this is the outsider case, which is the common one.

The gate is invoked per result, so a 50-result listing over widely-shared
rosters is roughly 10 ms of host event loop. Prior baselines (`BASELINE.md`
Run 10) already found that loop pinned at 99.3% utilisation.

**Next probe:** this walk has no cache of any kind, and the same roster is
re-walked per read and per result. Confirm the per-read cost against a real
`IDocumentView` in the meso tier, then decide whether a memo keyed on
`(groupId, subject)` for the duration of one request is worth it. That is the
first place in the feature where a cache looks clearly justified.

## Run 5 - the ladder end to end (meso tier)

`scripts/profiling/reactor-direct.ts`, now carrying the flag axis. 10 documents,
500 operations each, batched 100 per `execute`, in-memory PGlite, no worker
pool, no signature verifier. Every level above `L0_CLEAN` installs a 100-grant
policy and reads it back before measuring.

```sh
tsx scripts/profiling/reactor-direct.ts 10 -o 500 -b 100 \
  --auth-level L2 --auth-grants 100
```

Interleaved `L0_POLICIED, L1, L2` five times, wall time for 5000 operations:

| level | runs (s) | median | spread | vs prev |
| --- | --- | --- | --- | --- |
| `L0_POLICIED` | 6.07 6.01 6.10 6.04 6.03 | 6.04 | 1.5% | - |
| `L1_DOCUMENT_DECISIONS` | 7.81 7.39 7.44 7.52 7.42 | 7.44 | 5.6% | **1.232x** |
| `L2_AUTH_ENFORCEMENT` | 7.99 7.89 7.86 7.85 8.05 | 7.89 | 2.5% | **1.060x** |

Paired `L2/L1` ratios, one per interleaved pair: 1.023, 1.068, 1.056, 1.044,
1.085 (median 1.056). Every pair is positive, so the effect survives the host
drift that the raw medians cannot rule out on their own.

A separate interleaved run of `L2, L3, L4` at n=4 (spreads 6.8% to 10.8%):

| level | median | vs L2 |
| --- | --- | --- |
| `L2_AUTH_ENFORCEMENT` | 8.22 | 1.000x |
| `L3_AUTH_GROUPS` | 8.14 | 0.991x |
| `L4_AUTH_CONDITIONS` | 8.18 | 0.995x |

And `L0_POLICIED` against `L0_CLEAN`, from the first interleaved set: 0.991x.

### Notes on Run 5

**Most of what turning auth on costs is not auth.** The full ladder is +31% on
this workload, and +23 of those points are `documentDecisions` alone - the
prerequisite that replaces the meta-cache gate with an advisory lock, a guarded
insert and a document-scope `getState`. `authEnforcement` itself adds 6%. An
operator reading a single auth-on-versus-auth-off number would attribute the
whole 31% to authorization; roughly three quarters of it belongs to the
admission mechanism underneath.

**The interim in-memory gate is not resolvable end to end.** `L0_POLICIED`
against `L0_CLEAN` is 0.991x, and Run 1 explains why: 1.84 us per scan over
5000 operations is 9 ms against a 6-second run, or 0.14%. Report this as no
resolvable difference at n=5, not as free.

**`authGroups` and `authConditions` are indistinguishable from `authEnforcement`
here, and that is a statement about the harness, not the flags.** Three reasons,
all of which have to be fixed before these two rungs mean anything:

1. No group principals are in the policy, so the groups projection reads no
   streams. The driver registers no group model, so a group grant would fail
   closed and price the cheapest outcome while appearing to price the dearest;
   `--auth-groups` therefore refuses rather than measuring that. The group axis
   lives in Run 3 and Run 4 until the module is wired in.
2. Nothing is backdated, so `foldEvaluatedScope` never runs. That is the whole
   cost of `authConditions` on a positional walk and it is absent from this
   table.
3. PGlite is single-threaded WASM on the host loop, so the `pg_advisory_xact_lock`
   over the read set - the mechanism by which `authGroups` makes documents
   sharing a group serialise - does not behave as it does on Postgres.

**Two measurement traps, both hit during this run and both worth recording.**

The first: at batch size 1 the ladder was flat at 12-13 ms per operation across
every level. That is not a result. `waitForJob` polls on a 10 ms `setTimeout`,
so anything below the polling quantum is invisible, and auth's marginal cost is
three orders of magnitude below it. Batching 100 actions per `execute` amortises
one poll across the batch and is what made the signal appear at all. Any future
cell must either batch or shorten the poll.

The second: `L3` first measured 5% *above* `L2`, which was an artifact of
running it in a separate batch from the others. Interleaved, the same comparison
is 0.991x. The per-cell spread also moved from 1.2-1.6% in one batch to
6.8-10.8% in another as host conditions drifted. Blocked ordering aliases that
drift onto whichever level was measured while the machine was busy, which is
exactly what happened. Interleave, pair, and report ratios.

**Next probe:** rerun this ladder against real Postgres, then add the backdated
arm. Postgres is where the advisory lock and the guarded-insert retry become
real, and the backdated arm is the only way `L4` can report anything but a tie.
Neither needs new tooling: `--db postgresql://...` already exists, and the
`--pyroscope` plus `pyroscope-analyse.ts --baseline` pair already produces a
per-module CPU delta table against a saved `L0_CLEAN` profile.

## Run 6 - the ladder on real Postgres

Same workload as Run 5, against Postgres 16.15 rather than in-memory PGlite.
The `reactor` schema is dropped before every cell, so no cell inherits another's
data and accumulation cannot drift the sweep.

```sh
docker exec reactor-postgres psql -U postgres -d reactor \
  -c "drop schema if exists reactor cascade;"
tsx scripts/profiling/reactor-direct.ts 10 -o 500 -b 100 \
  --auth-level L2 --auth-grants 100 \
  --db "postgresql://postgres:postgres@localhost:5433/reactor"
```

Interleaved `L0_POLICIED, L1, L2` five times:

| level | runs (s) | median | spread | vs prev |
| --- | --- | --- | --- | --- |
| `L0_POLICIED` | 7.16 7.14 7.24 6.71 6.67 | 7.14 | 8.0% | - |
| `L1_DOCUMENT_DECISIONS` | 8.91 8.94 8.80 8.57 8.59 | 8.80 | 4.2% | **1.232x** |
| `L2_AUTH_ENFORCEMENT` | 9.32 9.41 9.37 8.68 8.74 | 9.32 | 7.8% | **1.059x** |

Paired ratios, one per interleaved repetition:

| step | paired ratios | median | all positive |
| --- | --- | --- | --- |
| L1 / L0_POLICIED | 1.244 1.252 1.215 1.277 1.288 | 1.252 | yes |
| L2 / L1 | 1.046 1.053 1.065 1.013 1.017 | 1.046 | yes |

Interleaved `L0_CLEAN, L2, L3, L4` four times:

| level | median | vs L2 | paired ratios |
| --- | --- | --- | --- |
| `L0_CLEAN` | 6.42 | - | - |
| `L2_AUTH_ENFORCEMENT` | 8.29 | 1.000x | - |
| `L3_AUTH_GROUPS` | 8.50 | 1.025x | 0.988 1.049 1.021 0.995 |
| `L4_AUTH_CONDITIONS` | 8.19 | 0.988x | 0.989 1.031 1.066 0.918 |

### Notes on Run 6

**The ladder ratios are the same on real storage, to within a thousandth.**
PGlite gave 1.232x and 1.060x for the two steps; Postgres gives 1.232x and
1.059x. Absolute times are 15-18% higher across the board, as expected for a
real socket and a real fsync, but the shape of the ladder is unchanged and the
headline stands: +31% total, +23 points of it `documentDecisions`.

Both steps survive pairing. Every one of the five `L1/L0` pairs and every one of
the five `L2/L1` pairs is positive, which is what makes these two real rather
than an artifact of when the machine happened to be busy.

**This does not settle the advisory-lock question, and the agreement above is
the reason why.** `store.ts` takes a `pg_advisory_xact_lock` over every stream in
the read set, which is the mechanism by which `authGroups` would make documents
sharing a group serialise against each other. This workload never contends it:
`performOperations` executes one batch, awaits it to `READ_READY`, and only then
issues the next, so exactly one write is in flight for the whole run. A lock
nobody else is holding is nearly free, on any storage engine.

So Postgres reproducing PGlite is not evidence that the lock is cheap. It is
evidence that this workload does not exercise it. The two engines agree here
precisely because the contended path is unreached on both.

**`L3` and `L4` still tie with `L2`, now for a reason that has nothing to do
with the storage engine.** Their paired ratios straddle 1 in both directions
(0.988 to 1.049, and 0.918 to 1.066). Three things keep them unreachable: the
policy names no groups, nothing is backdated so `foldEvaluatedScope` never runs,
and there is no concurrency for a lock or an append-condition retry to bite on.

**Next probe:** concurrency, not storage. The smallest experiment that would
settle the lock hypothesis is N concurrent writers against M documents that all
name one group, against the same documents naming disjoint groups. The signal is
the throughput ratio between those two shapes, plus append-condition conflict
count - and conflicts are retried up to twenty times exempt from the retry
limit, each retry re-running the whole gate against an invalidated write cache,
so the cost multiplies rather than adds. That needs the group model registered
in the driver and a concurrent driver, neither of which exists yet.

## Run 7 - what inside documentDecisions costs the +23%

Runs 5 and 6 localise the cost to a flag. A flag is not a mechanism:
`documentDecisions` bundles four changes, and knowing which one to attack means
separating them. This run does that with two instruments, and the answer is not
the one the flag's name suggests.

```sh
# server side: what SQL each arm issued, and what it cost
tsx scripts/profiling/pg-statement-diff.ts capture --label L0_POLICIED --out /tmp/l0.json -- \
  tsx scripts/profiling/reactor-direct.ts 5 -o 1000 -b 100 --auth-level L0_POLICIED --auth-grants 100 --db "$DB"
tsx scripts/profiling/pg-statement-diff.ts capture --label L1 --out /tmp/l1.json -- \
  tsx scripts/profiling/reactor-direct.ts 5 -o 1000 -b 100 --auth-level L1 --auth-grants 100 --db "$DB"
tsx scripts/profiling/pg-statement-diff.ts diff /tmp/l0.json /tmp/l1.json

# client side: which module absorbed the rest
tsx scripts/profiling/reactor-direct.ts ... --pyroscope http://localhost:4040
tsx scripts/profiling/pyroscope-analyse.ts --query 'wall{service_name="reactor-direct-profiler"}' \
  --from <start> --until <end> --output-json /tmp/prof-l1 --baseline /tmp/prof-l0 --profiles wall
```

### It is not the decision logic

The micro tier puts the whole L1 gate at 0.49 us per action. Over 5000 actions
that is 2.5 ms, against 1660 ms of observed added time - **0.15%**. Whatever
`documentDecisions` costs, building the model and deciding against it is three
orders of magnitude too small to be it. That disposes of the reading its name
invites.

### What the database actually does differently

Median of three interleaved repetitions, schema dropped per cell:

| statement shape | L0_POLICIED | L1 | delta |
| --- | ---: | ---: | ---: |
| guarded insert into Operation | 0.0 ms | 696.7 ms | **+696.7** |
| advisory lock over the read set | 0.1 ms | 220.1 ms | **+220.0** |
| read: Operation aggregate | 236.8 ms | 385.7 ms | **+148.9** |
| read: Operation rows | 336.9 ms | 349.3 ms | +12.4 |
| plain insert into Operation | 320.5 ms | 1.1 ms | **-319.5** |
| **total in Postgres** | **2673.7 ms** | **3464.0 ms** | **+790.4** |

Three named costs, all consequences of carrying a read-set: the plain bulk
insert is replaced by a guarded one at a net **+375 ms**, an advisory lock is
taken over every read-set stream at **+220 ms**, and the extra document-scope
read adds **+149 ms**.

The call counts are the unperturbed part of this table and they carry their own
finding. There are 15015 guarded-insert phases and 15016 advisory-lock phases
for 5000 operations - three log phases per statement, so **one guarded insert
and one advisory lock per operation**. `apply` is not batched: 909 inserts for
900 operations in an earlier smaller run, in both arms. Batching a hundred
actions into one `execute` does not batch the storage writes underneath, so
every per-apply cost is paid a hundred times per batch.

### How much of the total is that, honestly

Between a fifth and a half, and this measurement does not pin it further.

| denominator | wall delta | in-database share |
| --- | ---: | ---: |
| measured with statement logging on | 3863 ms | 20% |
| measured with statement logging off | 1460 ms | 54% |

Statement logging is neither free nor neutral. L1 emits 287k log lines to L0's
156k, so the arm under test is taxed 1.84x harder and the logged wall delta is
inflated; dividing by it understates the database. Dividing the same numerator
by the unlogged delta mixes two conditions and overstates it. Reporting either
endpoint alone would be a choice about which story to tell.

Part of that inflation was the measuring tool rather than Postgres. The first
version of `pg-statement-diff` read the container log after the run, which
rescans it from the beginning and costs more on every use; it now follows from
the tail, and at a 900-operation workload the logged and unlogged wall times
moved from roughly 2x apart to 1.4x apart. A re-measurement with the fixed tool
should tighten these bounds and is owed. It is not in this run because the host
had been driven hard enough by then to produce a 19.9 s outlier in a 2 s
workload, and a quiet machine is a precondition for the answer being worth
anything.

### The client side

A wall-profile diff, taken with logging off so it does not share that problem,
attributes the added time by module:

| module | L0_POLICIED | L1 | delta | change |
| --- | ---: | ---: | ---: | ---: |
| kysely | 889.5 ms | 1.10 s | **+213.5 ms** | +24.0% |
| runMicrotasks | 74.1 ms | 169.7 ms | +95.6 ms | +128.9% |
| zod | 148.2 ms | 169.7 ms | +21.4 ms | +14.5% |
| pg | 413.0 ms | 381.8 ms | -31.2 ms | -7.5% |

kysely is the single largest mover, and at L1 the database *client* stack
(kysely, pg, pg-protocol) is 48% of all wall time. The guarded insert is not
only more expensive for Postgres to run, it is markedly more expensive to
*build*: `insertGuarded` assembles a `selectNoFrom` carrying fifteen `sql`
template fragments plus a `NOT EXISTS` subquery, where the unguarded path is one
`insertInto().values()`.

Caveat on magnitudes: the wall sampler covered roughly 3.4 s of a 7 s run, so
these are a sample of the run rather than its total. The composition within the
window is the signal; the absolute numbers are not comparable to the statement
table above.

### What this means

The cost is the **append-condition mechanism**, not the decision that produces
it, and it is paid on both sides of the wire: Postgres runs a heavier statement
and takes a lock, while the client spends more time assembling that statement
than it saves anywhere. Both are multiplied by `apply` running per operation.

That reframes the fix. Nothing here argues for making the decision cheaper,
because the decision is already free at this scale. It argues for issuing fewer
and cheaper guarded appends: batching applies so one guarded insert covers a
batch, and giving the guarded statement a stable shape the driver can prepare
once instead of rebuilding per operation.

**Next probe, first:** re-run the statement diff on a quiet host with the
fixed follower, which should collapse the 20-54% range to a single number.

**Then:** the two fix candidates are separable. Batching applies changes the
call count and leaves the statement shape alone; preparing the statement changes
the build cost and leaves the count alone. Measure them independently before
building either, and use `pg-statement-diff` for the first (call counts move)
and the wall profile for the second (kysely self-time moves).

## Coverage and what is not yet measured

Landed: the pure evaluator, the head admission gate, the read gate, and a
fixture guard that fails when a policy stops reaching the code under test.

Not yet built, in the order they should be:

1. **Concurrency.** Run 6 covers Postgres but not contention: the driver keeps
   one write in flight, so the advisory lock over the read set and the
   append-condition retry are both unreached. This is now the largest gap, and it
   is a driver limitation rather than a storage one.
2. **The positional path.** `foldEvaluatedScope` folds the entire effective
   stream of the evaluated scope, and it is the most expensive construct in the
   feature. It is also unreachable from a normal write: `simple-job-executor.ts`
   returns `plain()` at both `:944` and `:955` unless the action is backdated,
   and k6 stamps `Date.now()`. A backdated arm is required or `authConditions`
   will keep measuring as nearly free end to end.
3. **Macro tier.** The bench host sets no flags, installs no policy, registers
   no group model, and stubs signature verification to `() => true`. Its signer
   is constructed without a user, so the subject address is the empty string,
   which `principalProblem` rejects and no group principal can match.
4. **The write cache confound.** `maxDocuments` defaults to 100 and the LRU is
   keyed per stream, not per document. Each rung adds a stream per document, so
   at the historical `NUM_DRIVES=64` turning on `documentDecisions` alone takes
   the cache from 64 to 128 streams against a 100-stream capacity. Pin it
   explicitly before any flag sweep, or the sweep will attribute keyframe
   rebuilds to policy evaluation.
5. **Re-evaluation fan-out.** `GroupReevaluationTrigger` enqueues one job per
   referencing document on a membership change. Bursty, so a steady-state
   profile cannot see it.
