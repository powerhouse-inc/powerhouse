# Testing policy (draft)

Date: 2026-10-02
Status: draft, not adopted. The rollout plan is
`2026-10-02-testing-policy-rollout.md`, next to this file.

## Provenance

Twelve external bug reports were filed against 6.2.3-dev.31 between
2026-09-25 and 2026-10-01. Every one of them passed the full test suite —
`packages/reactor` alone runs 4,046 tests at roughly 91% line coverage — and
every one was found by a real deployment instead. Seven were fixed within
days, each fix arriving with the regression test the suite had been missing.

That pattern is the finding. The team writes good tests for named scenarios;
the defects clustered in a small set of scenario shapes the suite
systematically does not name. This policy names them. Each rule below
generalizes a test that already exists in the repo — the fixes supplied the
precedents — so the policy asks for more of what the codebase already does at
its best, not for a new style.

## What stays the same

The existing philosophy holds:

- Unit tests mock their dependencies; integration tests use real
  implementations; components with no dependencies need only unit tests
  (`packages/reactor/test/CLAUDE.md`). Nothing below bans a mock.
- Coverage percentage is not a target. The twelve bugs shipped under 91%
  coverage; three of them were on lines the suite executes. Raising the
  number would not have caught any of them.
- The suite's budget is real. The reactor suite alone costs ~9 minutes and
  is memory-bound (`2026-10-02-reactor-tests-on-windows.md`). Every rule
  below is written to cost one test per seam or branch, not one per test
  file, and to prefer in-process harnesses over spawned processes.

## The six failure shapes

1. **Mocked at the seam where the bug lived.** The sync-scope gate was
   tested against a mocked document view primed with
   `mockRejectedValue(new DocumentNotFoundError(...))` — the mock threw the
   typed error the real view never threw, so the guard passed against a
   fiction. The catch-up rebuild was tested with a mocked write cache and
   assertions on coordinates only. The fatal-shutdown handler was tested
   with `{ error: vi.fn() }`, a logger that cannot fail, in a suite about
   what happens when logging fails.
2. **Covered lines, absent oracles.** The `{}` substitution in
   `document-view.ts` executes three times in a full suite run and no test
   asserts anything about it. Codegen's subgraph `index.ts` template is
   tested with `existsSync` — the file exists, content unexamined.
3. **Contract seams tested one side at a time.** Codegen produces a
   subgraphs index; three loaders consume it under three different
   acceptance rules; only the most permissive rule has a test.
   `pieces-framework` tests an author's piece against a context the test
   fabricates; the host tests its gate against the one package name that
   passes it; the contract between them — who actually receives a
   `reactor` — is asserted by neither, and the `WithReactor` type promises
   trigger contexts a member the runtime never supplies.
4. **Adversity classes never constructed.** Restart with a read-model
   cursor behind. A collaborator that answers after the timeout. A log
   write that itself fails. A stdout whose reader has gone away. Each of
   these is ordinary in production and absent from the suite.
5. **Long-horizon properties at test-sized volumes.** Dead-tuple bloat, a
   2^31-1-byte buffer ceiling, a journal growing at tens of megabytes per
   minute: structurally invisible to any test that writes a handful of
   rows, unless the test is shaped for growth rather than for state.
6. **Tests that pin the bug as the specification.** The analytics annual
   test asserts period stepping from the start date rather than the
   calendar year; the pg integration fixture encodes the one-bucket-early
   shift in its expected values; the one timezone test uses a
   negative-offset zone, the only kind that cannot trigger the drift.

## Rules

### R1. Every doubled seam gets one real-pair test

When a test replaces a collaborator with a double, and a real implementation
of that collaborator exists in the repo, at least one test somewhere must
exercise the real pair across that same seam. The obligation is per seam,
not per test: the hundred unit tests keep their mocks; the seam gets one
composed test.

A seam here means an interface boundary where both sides carry logic that
can disagree: view/gate, cache/read-model, producer/consumer of a
serialized value. A logger or clock double does not create a seam
obligation; a mocked `IWriteCache` under a read model does.

Precedent: `packages/reactor/test/decision/sync-scope-gate-postgres.test.ts`
(real view, real gate, real Postgres) and
`packages/reactor/test/read-models/catch-up-guards.test.ts` — both written
as part of fixes, both the test this rule would have required in advance.

### R2. Write-path tests assert the written value

A test of a path that persists state must assert the persisted content, not
only coordinates, counts, cursor positions, or the absence of an error. "The
row was written with the right index" is how an empty snapshot with a
correct index passes every check.

This rule is cheap: it usually converts one existing assertion, not adds a
test. It applies to new tests immediately and to existing tests when they
are touched.

### R3. A silent fallback is either asserted or removed

Every branch that substitutes a default on missing data — `?? {}`, an
`else` that supplies an empty value, a catch that continues — must have
exactly one of:

- a test asserting that the substituted value is the intended behavior for
  a named input, or
- a conversion to refuse-and-report (throw, or skip with a warning,
  whichever the context's failure mode demands — the catch-up amendment's
  skip-and-warn is the model for paths that must not wedge a cursor).

A fallback no test wants is a defect the suite is hiding. The
`scopesToIndex.push([scope, {}])` branch is the canonical case: it turned a
shape mismatch into silent data loss that passed every consistency check.

### R4. Convention tests cite their authority

A test that pins a convention — a period boundary, a timezone rule, an
argument-naming scheme — must say in a comment what external rule it
encodes (the calendar, a spec section, a plan doc). A fixture's expected
values must not be produced by running the implementation; that is how the
analytics suite came to assert its own off-by-one.

Specifically for time: any suite that slices time must include at least one
test at an exact boundary instant (`T00:00:00.000Z`) and at least one with a
positive-UTC-offset zone, because a negative offset can never roll a UTC
date backward and therefore tests nothing about that failure mode.

### R5. Unbounded growth is bounded or measured

Anything appended to durable storage needs one of:

- an enforced size or retention bound, with a test that the bound holds
  (the `PIECE_STORE_MAX_VALUE_BYTES` enforcement is the in-repo shape), or
- a relative-growth test: run the same workload at N and 2N, assert the
  ratio, never the absolute size.

Precedent for the second form: `packages/pglite-fs/test/maintenance.test.ts`
(growth with maintenance off vs. on) and
`streaming-snapshot.test.ts` with its `setIoChunkSizeForTests` override. A
test-only scale override is a sanctioned pattern, not a hack: it is the only
way a 2 GB property fits in a unit test.

### R6. One contract, one fixture table

When several implementations accept the same artifact (three subgraph
loaders, two host surfaces), they share one table of accept/reject fixtures
and each implementation runs against all of it. When a generator produces an
artifact a loader consumes, one test feeds the generated output to the real
consumer. Divergence then fails a test instead of a deployment.

Corollary for types: a type that promises a capability (`WithReactor` on
trigger contexts) is a contract; a test must construct the context the
runtime actually builds and assert the member exists, or the type must stop
promising it.

### R7. The adversity catalog

Each subsystem that persists, syncs, or crosses a process boundary carries
one test per applicable row of this catalog. One test per row per subsystem;
rows that cannot apply are skipped with a sentence in the test file saying
why.

| Adversity | Shape of the test |
|---|---|
| Restart with backlog | cursor behind at init, real collaborators, content asserted after catch-up |
| Late collaborator | the double answers after the deadline; timeouts must be injectable to keep the test fast |
| Failing infrastructure call | the logger/emitter/writer itself throws, with a realistic error (`code: "EPIPE"`), inside the handler that runs on failure |
| Crashed writer | partial commit, then recovery; the recovery's output asserted, not just its completion |
| Unreadable input | malformed or empty payload fails closed, and the test asserts the refusal, not the absence of a crash |

The last row is already policy in miniature: `records-guard.sh` refuses to
pass commands through when it cannot read them, and
`test/bench/records-guard.test.ts` asserts the refusal.

## What this policy does not ask for

- No mock bans, no mandatory integration test per feature, no inversion of
  the test pyramid. R1 adds roughly one test per genuine seam.
- No coverage threshold changes. Coverage remains a map, not a goal.
- No end-to-end suites for visual or ergonomic properties. A missing CSS
  import and an awkward argument name are found by API review and by using
  the product; a policy that pretends tests catch them would spend the
  budget where it returns least. The rollout plan routes those to review
  checklists instead.
- No new tests that spawn processes where an in-process harness exists.
  The suite is memory-bound; R1 tests should reuse the existing PGlite
  harness files rather than boot new databases per test file where
  practical.

## Enforcement

Review-time, not hook-time, at first:

- This file's rules become a PR review checklist item for changes touching
  persistence, sync, codegen templates, or cross-package contracts.
- The relevant `CLAUDE.md` files gain one line each pointing here, so
  agent-written tests follow the same rules.
- A small coverage-report script (rollout phase 3) lists branches executed
  fewer than N times across the suite, as a review aid for R3 candidates.
  It advises; it does not gate.

Escalation to a lint rule or guard hook is deliberately deferred until the
rules have survived a quarter of review-time use.
