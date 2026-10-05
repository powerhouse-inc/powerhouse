# Plan: roll out the testing policy across the existing code base

Date: 2026-10-02
Status: proposal, not started. The policy this rolls out is
`2026-10-02-testing-policy.md`, next to this file. Rule numbers (R1–R7)
refer to that document.

## Overview

The policy is adopted by applying it, not by announcing it. This plan works
through the existing code base in four phases, ordered so that the first
work closes the defects that are still open and proves each rule on a real
case. Phases 2 and 3 are bounded sweeps, not open-ended audits: each has an
inventory step with a fixed scope and a per-item cost of roughly one test.

Budget rule for the whole plan: the reactor suite currently runs ~4,050
tests in ~9 minutes and is memory-bound. This plan adds tests in the low
tens across all packages, reuses existing PGlite harnesses, and spawns no
new processes in tests. Any task that would break that budget comes back to
this document first.

## Phase 1 — close the open defects, policy-shaped

Each fix lands with the test the policy would have required in advance.
These six are the proof cases; if a rule produces a bad test here, the rule
gets amended before Phase 2.

### 1a. Switchboard EPIPE kill loop (R7: failing infrastructure call)

- [x] Guard the `logger.error` call that opens `onFatal`
      (`apps/switchboard/src/fatal-shutdown.mts`): both fatal-path log
      calls now go through a wrapped helper, so a throwing logger cannot
      re-enter the handler or abort the shutdown before exit(1).
- [x] Stop passing the whole job as a log argument in the `JOB_FAILED`
      subscriber (`packages/reactor/src/core/reactor.ts`); it logs job id,
      document id, and error message only.
- [x] Remove the duplicate `JOB_FAILED` emit on the timeout path — in both
      `simple-job-executor-manager.ts` and (same duplication, confirmed)
      `worker-pool-job-executor-manager.ts`; `handle.fail` already emits
      once through `queue.failJob`.
- [x] Test: `fatal-shutdown.test.ts` gained the EPIPE-throwing-logger case
      (exit reached, no re-entry, forced exit exactly once).
- [x] Test: `test/core/job-failed-logging.test.ts` (new) asserts the exact
      logged arguments against a real Reactor (R2), the placeholder when
      the event carries no job, and the failing-logger case written to the
      real event-bus aggregate-error contract. Exactly-once emission is
      asserted on both manager paths.

### 1b. Analytics period boundaries (R4: cite the authority; R2)

- [x] Filter dates parsed as UTC at all four `DateTime.fromISO` sites in
      `AnalyticsModel.ts`; the DssVest `cliff` parse had the same disease
      and got the same fix.
- [x] `_nextAnnualPeriod` re-anchored to the calendar year. Hourly turned
      out to carry the same anchoring defect (a 07:30 start produced
      :30-to-:30 buckets labelled by hour) and was fixed alongside.
- [x] Convention decided and documented: half-open calendar periods
      `[start, nextStart)` — the full change, since the store SQL already
      filters `start < until` and the ripple was small. The 1 ms stepping
      and the `.999` period ends are gone; boundary-instant attribution
      flipped so an exact-midnight value lands in the period that starts
      there.
- [x] Annual slicer tests rewritten against the calendar with the
      convention cited (R4), including Europe/Brussels (positive offset,
      the arm the old New York case could never reach) and exact-midnight
      instants; the bug report's 2020-2030 case is a regression test.
- [x] pg and browser integration fixtures corrected — the value dated
      2023-01-01 now lands in the 2023 bucket, and the window-start value
      counts into the total.
- [x] `getPeriodSeriesArray` tiling tests added across 8 granularities
      (no gaps, no overlaps, awkward starts) — the stepping loop had zero
      coverage before.

### 1c. Workflow step journal (R5: bound or measure)

- [x] Per-payload cap landed in `stepValues()`: 256 KiB with a 32 KiB
      prefix, written as a self-describing `{truncated, bytes, prefix}`
      marker; both writers (`recordStep`, `sweepSteps`) flow through the
      one seam. Rerun refuses to replay a truncated output as data, the
      same way it already refuses redacted markers.
- [x] Test: `store.payload-cap.test.ts` asserts the written row content
      at, one byte over, and far over the cap, for both writers (R2).
- [x] `document-get` left alone, deliberately: the return value feeds the
      next step as live data and must stay whole; the journaled copy is a
      separate value that the `stepValues()` cap already bounds. There is
      no seam inside the action that shrinks one without the other.
- [x] Retention stays off by default; the cap's comment and the test
      header cite `run-retention.ts` so the two bounds travel together.

### 1d. Pieces/reactor contract (R6: one contract, one fixture table)

- [x] Type and runtime aligned, in the type's favor: trigger contexts now
      carry `reactor` — the real `RemoteReactorService` when the gate
      grants access (threaded symmetrically with actions through
      `TriggerHookRequest.reactorAccess` and the trigger supervisor's
      single `hook()` call site), the named throwing stub otherwise, so a
      denied piece gets the typed `UnsupportedContextMemberError` instead
      of a property-access `TypeError`.
- [x] The access mechanism decision was deliberately deferred (no
      manifest capability invented); what exists is now honest and in one
      place — `servesReactorPort` was verified by grep to be the only
      gate predicate, now used by all three gate sites including the new
      trigger path.
- [x] Test: `test/pieces/activepieces/reactor-gate-contract.test.ts` runs
      the author-shaped action and polling trigger through the real block
      executor, real trigger supervisor, and real forked worker under
      privileged and third-party package names — working reactor for
      both privileged shapes (content asserted), typed refusal for both
      denied shapes, predicate pinned directly.

### 1e. Document-view fallback (R3: asserted or removed)

- [x] Convert `scopesToIndex.push([scope, {}])`
      (`packages/reactor/src/read-models/document-view.ts:239`) to
      skip-and-warn, per the field amendment: never write `{}` over a row
      when the operation's own scope is missing from `resultingState`;
      leave the snapshot intact and log. A throw is wrong here — it parks
      the cursor for every document behind the bad one.
- [x] Test: an operation whose `resultingState` lacks its own scope leaves
      the existing snapshot untouched and advances past it with a warning
      (assert both the surviving content and the skip).
- [x] Found during implementation: the second `{}` guard (the ternary the
      bug report cleared as "reads like the culprit and is not") silently
      converted a null or primitive scope state to `{}` — same class, next
      entry point. Converted to the same skip-and-warn, with its own test.
- [x] Found during implementation: the one pre-existing test that depended
      on the old `{}` write ("should catch up with missed operations on
      init", document-view/integration.test.ts) had been asserting row
      count and index over an empty snapshot since it was written — the
      exact weak-oracle shape of R2. It now feeds the executor-shaped
      document through the mocked cache and asserts content.

### 1f. Codegen subgraph index (R2, R6)

- [x] Content-assert the boilerplate template test: `existsSync` replaced
      with content assertions, plus a new describe pinning that
      `writeModuleFiles` over an existing project preserves populated
      aggregates and re-seeds banner-only ones.
- [x] `ph migrate` preserves populated module aggregates. The clobber was
      a shared mechanism, so it is fixed at the shared level
      (`seedModuleAggregateFile`): subgraphs, document-models, editors,
      and accumulating processor files are seeded only when missing or
      banner-only; the fully codegen-owned static files keep overwrite
      semantics so migrate still refreshes them.
- [x] All three loader acceptance rules unified behind one predicate
      (`src/packages/subgraph-extraction.ts`), with a 10-row shared
      fixture table run against all four surfaces plus one composed test
      booting a real vite server over a real project tree. Fixing this
      required fixing `isSubgraphClass` first — see the findings appendix:
      the old check accepted any function.
- [x] Generator-meets-consumer: the generated export line is content-
      pinned in codegen, appears verbatim as the first fixture row in the
      reactor-api table, and the composed vite test loads that exact
      shape; the two files cite each other. A central warning now fires
      when a manifest declares subgraphs the loaders did not deliver.

## Phase 2 — seam inventory and real-pair backfill (R1)

- [x] Inventory: 22 seams found in `packages/reactor` (the `as unknown
      as I*` and `vi.fn()`-literal sweep). Scope note: reactor-api and
      reactor-workflow seams were covered by their Phase 1 tracks' new
      composed tests rather than a separate inventory pass.
- [x] Classified: 14 already real-paired, 5 with logic on both sides
      (3 backfilled, 2 deferred — the two-reactor purge harness and the
      cross-package GqlRequestChannel/reactor-api subgraph pair), 5 inert.
- [x] Backfilled, write path and sync path first: the write-cache/view
      rebuild seam (the September data-loss seam — `targetRevision`
      semantics now pinned on snapshot content), the SyncManager/real
      GqlRequestChannel pair (inbound and outbound, doubled only at
      fetch), and the queue/resolver/registry admit path. All reuse the
      catch-up-guards PGlite harness. The composed tests passed without
      source changes: the real pairs agree on the contracts the mocks
      assumed — now guarded instead of presumed.
- [x] Inventory recorded with file:line citations in
      `docs/plans/2026-10-02-seam-inventory.md`.

## Phase 3 — degraded-branch audit (R3) and tooling

- [x] Script: `packages/reactor/scripts/rare-branches.ts` reads
      `coverage/coverage-final.json` and lists branch arms executed at or
      below a threshold while a sibling arm ran, sorted so a near-zero arm
      beside a high-traffic sibling tops the list. Advisory; not a gate.
      Its first run found the second `{}` guard above (0 hits against
      48,272 sibling executions) and the never-exercised mixed-scope
      refusal in `core/utils.ts` (now tested).
- [x] First sweep done over the script's output: the two document-view
      substitution sites converted (1e), the never-exercised mixed-scope
      refusal in `core/utils.ts` tested, and the remaining
      fallback-shaped candidates triaged — two flagged for a decision
      (see the appendix: `document-action-handler.ts:1147`,
      `sync/utils.ts:283`), the rest judged benign defensive defaults.
      The base-read-model's store-absent sweep drop (skip-and-warn by
      design, warn branch untested with a real cache) is the named
      candidate for the next pass.
- [x] R4 applied retroactively only to the analytics suite (Phase 1b),
      as planned.

## Phase 4 — CI topology

The policy is only as good as what CI runs.

- [x] Add the analytics integration suites to a CI lane. Verified first:
      the browser suite already runs in `e2e-tests.yml`
      (`analytics-engine-integration-tests`), so only the pg suite gated
      nothing. That job now carries a `postgres:16-alpine` service on port
      5555 matching the package's hardcoded connection string, installs
      `analytics-engine-pg...`, and runs `pnpm test:pg`.
- [x] Noted in the policy's enforcement section, after verifying:
      `analytics-engine-graphql` and `analytics-engine-knex` declare a
      `test` script, sit in `test:ci`, and ship zero test files — a green
      check from an empty suite.
- [ ] Reactor-on-Windows remains tracked by
      `2026-10-02-reactor-tests-on-windows.md` Track D; this plan does not
      duplicate it.

## Phase 0 — adoption (after Phase 1 proves the rules)

Deliberately last in numbering and second in execution: the policy text is
adopted once the six proof cases have shaped it.

- [ ] Amend `2026-10-02-testing-policy.md` with whatever Phase 1 taught;
      move it to `docs/testing-policy.md`; flip its status to adopted.
- [ ] Add one pointer line to `packages/reactor/test/CLAUDE.md`,
      `packages/reactor/CLAUDE.md`, and the `CLAUDE.md` of each package
      Phase 1 touched.
- [ ] Add the review checklist (one line per rule, R1–R7) wherever PR
      review guidance lives.

## Non-goals

- No coverage threshold gates. The defect record shows the number is not
  the instrument.
- No visual or ergonomic test automation (the CSS template and argument
  naming reports). Those route to the review checklist: "does a generated
  project render?" is a release-checklist question, not a vitest question.
- No rewriting of passing unit tests to use real collaborators. R1 adds a
  sibling, it does not convert.
- No process-spawning tests. The EPIPE case is tested at the handler and
  subscriber level; a harness that boots switchboard and closes its stdout
  is out of budget and out of proportion to what it would prove beyond
  Phase 1a's two tests.

## Sequencing and size

Phase 1 is six independent tracks; 1a–1c are each a day or less, 1d
contains a design decision that may stall and should be split out if it
does, 1e and 1f are small. Phase 2 is the bulk of the test-writing and is
bounded by the inventory count. Phase 3's script is small and its sweep is
bounded by what the script surfaces in `packages/reactor` alone. Phase 4 is
configuration. Total new tests across all phases: roughly 25–40, against a
current count of ~4,050 in the reactor package alone.

## Appendix — defects the rollout found (2026-10-02)

The policy predicted that applying it would surface defects the suite
could not see. It did. Everything below was found during the rollout
itself, beyond the twelve external reports that motivated the policy.

### Fixed on this branch

| Site | Mechanism | Severity |
|---|---|---|
| `reactor-api/src/graphql/utils.ts` (pre-fix :14-27) | `isSubgraphClass` called `isPrototypeOf` backwards and accepted any function — it was the only junk gate any subgraph loader had | high |
| `analytics-engine/browser/src/BrowserAnalyticsStore.ts` (pre-fix :407-415) | PGlite serializes a Date param as UTC text but parses the naive column back in host-local time: every stored instant shifted on a non-UTC host (verified by probe on a UTC+2 machine) | high |
| `reactor/src/read-models/document-view.ts` (pre-fix :289) | the second `{}` guard — the one the field report cleared as "reads like the culprit and is not" — silently converted a null or primitive scope state to `{}`; 0 suite executions against 48,272 sibling runs | medium |
| `reactor/test/read-models/document-view/integration.test.ts` | "should catch up with missed operations on init" asserted row count and index over a snapshot whose content had been `{}` since the test was written — it was the suite's only execution of the fallback branch | test defect |
| `reactor/src/executor/worker-pool-job-executor-manager.ts` (pre-fix :299) | same duplicate `JOB_FAILED` emit as the simple manager, found while fixing it | medium |
| `analytics-engine/core/src/AnalyticsTimeSlicer.ts` (pre-fix :290) | hourly had annual's anchoring defect: a 07:30 start produced :30-to-:30 buckets labelled by hour | medium |
| `analytics-engine/core/src/AnalyticsDiscretizer.ts` (pre-fix :235) | start == end threw `TypeError` on `periods[0].start` instead of returning empty results | low |
| `AnalyticsDiscretizer.ts` (pre-fix :290) | DssVest `cliff` parsed without UTC — shifted on non-UTC hosts | low |
| `AnalyticsDiscretizer._getPeriodString` | monthly label mixed local-zone year with UTC month | low |
| `codegen` `writeGeneratedProcessorsFiles` | wrote `processors/index.ts` twice | trivial |
| `apps/switchboard/src/observability.mts` (pre-fix :239-244) | signal handlers ended in a literal `process.exit(0)` — after a fatal, exit code 1 became supervisor-visible success and the ~5s forced exit could truncate the 15s drain. Now flushes and exits `exitCode ?? 0` only when no module claimed a non-zero code; on a fatal it abstains. The live window was every path without the builder's exit shim | medium-high |
| `reactor/src/executor/deferred-jobs.ts` + `queue/queue.ts` | deferred expiry emitted `JOB_FAILED` twice, the second without the job; the queue now emits only when it still holds the job, changing exactly the one caller that produced the job-less duplicate | low-medium |
| `reactor-workflow/src/reactor/store.ts` | `run.trigger_payload` now flows through the same `cappedPayload` seam as steps; rerun refuses a truncated trigger payload by name, since nothing can reproduce it | low-medium |
| `reactor-workflow` `redact.ts` | both quadratic patterns rewritten to anchor on their literals: `URL_USERINFO` was the measured ~50s case on unbroken runs (the appendix had attributed it to `TEXT_FIELD`), `TEXT_FIELD` the quadratic case on hyphen-separated runs. Output byte-identical over a 40-case table and 60k fuzz strings; 300 KiB inputs bounded at 2s by timed regression tests | medium |

### Open — need a decision or their own track

| Site | Mechanism | Severity |
|---|---|---|
| `analytics-engine/knex/src/KnexAnalyticsStore.ts:149,207` | the pg store persists host-local wall clock into a naive column: zone-dependent database content, and a different convention than the (now fixed) pglite store. Changing it reinterprets existing rows — needs a migration decision | medium-high |
| `reactor/src/executor/job-result-handler.ts:179,207,230` | three more `JOB_FAILED` double-emits (direct + via `handle.fail`); payloads differ (typed error vs plain), so removing either changes what subscribers receive | medium |
| `codegen` `writeAiConfigFiles` via `migrate.ts:298` | every `ph migrate` unconditionally overwrites `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, editor configs — user-authored files | medium |
| `reactor-workflow` `runsForDocuments` / `journaledTriggerDocumentIds` | document-scoped run lookups search `trigger_payload` text, so a capped payload can hide a run whose document id sits past the 32 KiB prefix. Inherent to capping; unpinned | low |
| `reactor-workflow` `redact.ts` | residual, pre-existing: thousands of repeated `signature-` tokens with no separator stay super-linear in `TEXT_FIELD` (the old pattern was strictly worse); unreachable via the capped journal paths | low |
| `analytics-engine/compat` suite | compares pg vs pglite stores with `toEqual`; zone-dependent until the knex finding is resolved | low-medium |
| `reactor-workflow` `redact.ts:280-331` | `containsRedactedMarker` misses the `[truncated]` depth markers, so rerun could replay one as data | low |
| `reactor-workflow/src/reactor/service.ts:4033` | a truncated test-step output is served as an expression sample | low |
| `reactor-workflow/src/reactor/store.ts:1826` | truncated samples lose the fields one erasure route matches on | low |
| `reactor-workflow` worker protocol | `executionType: "RESUME"` contexts promise `resumePayload` the builder never supplies — latent, no production caller sends RESUME | low |
| `reactor-api` loaders | residual divergence: http-loader requires `documentModel !== null`, the other two accept null | low |
| `apps/switchboard` | an EPIPE `uncaughtException` outside `onFatal` still triggers full shutdown; the field fix ignored stream-gone codes outright — decision recorded, not taken | low |

### Flagged, not yet confirmed as defects

- `reactor/src/executor/document-action-handler.ts:1147` — the executor's
  own `{}` substitution when building `resultingState` for relationship
  operations. Plausibly legitimate (relationships live in the operation
  index, not scope state) but it is the write-side twin of the
  document-view shape; worth one deliberate look.
- `reactor/src/sync/utils.ts:283` — `ordinal ?? 0` stamped onto an
  operation context; ordinal 0 downstream of cursor logic deserves the
  same suspicion as any silent coordinate default.
- `analytics-engine` trailing-partial-period conventions (monthly/annual
  final buckets extend past the query end; daily merges a trailing
  partial day) — no misattribution, but the reported `end` can exceed the
  query window; needs a convention decision.

### Found in the wild while this rolled out

PR 3163's `check-windows` failures (both shards) were reviewed during this
rollout and both turned out to be the contention category the Windows plan's
Track C triage predicts — not the branch's changes:

- shard 2 failed `host-call-reactor-jobs.test.ts` "fails by name, carrying
  the job, when the deadline comes first": the oracle pinned the `RUNNING`
  status word, but under load the 1s deadline passes before the first wait
  slice, so the job is correctly reported `PENDING`. A race's incidental
  half, pinned by a regression test upstream shipped five days ago — the
  exact over-specified-oracle shape R2 warns about, in a brand-new test.
  Fixed on this branch (accept `PENDING|RUNNING`); the file passes 13/13
  in isolation locally.
- a third, machine-local failure surfaced during verification:
  `loader.test.ts`'s symlink-containment case fails `EPERM` on a stock
  Windows dev machine (symlink creation needs Developer Mode or
  elevation; CI runners have the privilege). Fixed with a one-time
  capability probe and `it.skipIf`, so the case still runs everywhere
  symlinks exist and skips with a reason where they cannot.
- shard 1 failed the switchboard boot suite's `beforeAll` at the 120s
  `hookTimeout`; it passes locally and on main. Contention on the runner —
  the Track D memory-budget work (`--no-coverage`, explicit `maxWorkers`)
  is the remedy, not a test change.
- the PR branch's `pnpm-lock.yaml` carries collateral from a local
  non-frozen install (semver, ws, @types/node downgraded; snapshot
  variants dropped). Not the cause of these failures, but worth reverting
  to main's resolutions before merge.

### A negative result that is also evidence

The Phase 2 composed tests — the write-cache/view rebuild seam, the
SyncManager/GqlRequestChannel pair, the queue admit path — all passed
against current sources without a single source change. The real pairs
agree on the contracts the mocks had been assuming. That is the healthy
outcome R1 is designed to produce cheaply: where the seam is sound, one
test converts an assumption into a guarantee (`targetRevision` semantics
and the envelope's `resultingState` strip are now pinned); where it is
not, the same test shape is what found the September data loss. Both
outcomes justify the test.
