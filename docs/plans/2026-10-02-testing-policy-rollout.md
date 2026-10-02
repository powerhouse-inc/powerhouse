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

- [ ] Guard the `logger.error` call that opens `onFatal`
      (`apps/switchboard/src/fatal-shutdown.mts:40`) so a throwing logger
      cannot re-enter the handler.
- [ ] Stop passing the whole job as a log argument in the `JOB_FAILED`
      subscriber (`packages/reactor/src/core/reactor.ts:135-145`); log the
      job id, document id, and error only.
- [ ] Remove the duplicate `JOB_FAILED` emit on the timeout path
      (`packages/reactor/src/executor/simple-job-executor-manager.ts:210-215`
      emits once via `handle.fail` → `queue.ts:514-524` and once directly).
- [ ] Test: `fatal-shutdown.test.ts` gains a case where the injected
      logger throws an error with `code: "EPIPE"` from inside `onFatal`,
      asserting the process still reaches `exit` without re-entering. The
      existing `vi.fn()` logger stays for the other cases.
- [ ] Test: a reactor test subscribes a stdout-shaped logger whose write
      fails and asserts the `JOB_FAILED` subscriber survives it.

### 1b. Analytics period boundaries (R4: cite the authority; R2)

- [ ] Parse filter dates as UTC
      (`packages/analytics-engine/graphql/src/AnalyticsModel.ts:43-44`,
      add `{ zone: "utc" }`).
- [ ] Re-anchor annual periods to the calendar year in `_nextAnnualPeriod`
      (`packages/analytics-engine/core/src/AnalyticsTimeSlicer.ts:116-121`),
      matching what monthly/quarterly/daily already do.
- [ ] Decide the boundary convention for the 1 ms stepping
      (`AnalyticsTimeSlicer.ts:86`) and the `>=` attribution
      (`AnalyticsDiscretizer.ts:237,278`): either half-open calendar
      periods `[start, nextStart)` or the current convention stated
      explicitly. Write the chosen rule down in the test file per R4.
- [ ] Rewrite the annual slicer test so it asserts calendar years, with a
      comment citing the convention; replace the New York timezone case
      with (or add) a positive-offset zone (`Europe/Brussels`) and an
      exact-midnight instant.
- [ ] Correct the pg/browser integration fixtures that currently encode
      the one-bucket-early shift
      (`packages/analytics-engine/pg/test/Integration.test.ts:225-245`,
      `browser/test/Integration.test.ts:212-232`).
- [ ] Add a test over `getPeriodSeries` itself — the stepping loop at
      `AnalyticsTimeSlicer.ts:86` currently has zero coverage.

### 1c. Workflow step journal (R5: bound or measure)

- [ ] Add a per-payload cap in `stepValues()`
      (`packages/reactor-workflow/src/reactor/store.ts:823-824`), the same
      shape as `PIECE_STORE_MAX_VALUE_BYTES` (`store.ts:778,798-803`):
      truncate with an explicit `truncated: true` marker rather than
      refuse, since the journal is diagnostic.
- [ ] Test: a step whose output exceeds the cap journals the prefix and
      the marker (R2: assert the written value).
- [ ] Decide whether `document-get` should journal the whole document
      (`packages/workflow/pieces/reactor/lib/actions/document-get.ts:36-39`);
      if not, journal the header and a byte count.
- [ ] Leave retention off by default (that is a product decision the
      existing `run-retention.test.ts` already pins), but have the sweep's
      absence show up in the journal cap test's comment per R4, so the two
      bounds are considered together next time either changes.

### 1d. Pieces/reactor contract (R6: one contract, one fixture table)

- [ ] Align the type with the runtime: either supply `reactor` to trigger
      contexts (`packages/reactor-workflow/src/pieces/activepieces/context/trigger.ts:160-201`,
      `worker/entry.ts:369-382`) or remove `WithReactor` from
      `PowerhouseTriggerHookContext`
      (`packages/pieces-framework/src/powerhouse/context.ts:24-28`). The
      type must stop promising what the runtime refuses.
- [ ] Decide the access mechanism for non-first-party pieces (manifest
      capability vs. the hardcoded `@powerhousedao/piece-reactor` equality
      at `packages/reactor-workflow/src/pieces/engine/blocks.ts:423-427`).
      This is a design decision; the policy only requires that whatever is
      decided gets the composed test below.
- [ ] Test: run the `author.test.ts` piece shapes through the real host
      gate and worker context construction — not a fabricated ctx — and
      assert which packages receive `reactor` and that a denied piece gets
      the typed refusal, not `UnsupportedContextMemberError` at call time.

### 1e. Document-view fallback (R3: asserted or removed)

- [ ] Convert `scopesToIndex.push([scope, {}])`
      (`packages/reactor/src/read-models/document-view.ts:239`) to
      skip-and-warn, per the field amendment: never write `{}` over a row
      when the operation's own scope is missing from `resultingState`;
      leave the snapshot intact and log. A throw is wrong here — it parks
      the cursor for every document behind the bad one.
- [ ] Test: an operation whose `resultingState` lacks its own scope leaves
      the existing snapshot untouched and advances past it with a warning
      (assert both the surviving content and the skip).

### 1f. Codegen subgraph index (R2, R6)

- [ ] Content-assert the boilerplate template test: replace the
      `existsSync` check
      (`packages/codegen/src/file-builders/boilerplate/generated-project-files.test.ts:33`)
      with an assertion on what `subgraphs/index.ts` exports.
- [ ] Make `ph migrate` preserve an existing `subgraphs/index.ts` instead
      of rewriting it to the banner
      (`packages/codegen/src/codegen/migrate.ts:298` →
      `writeGeneratedSubgraphsFiles`).
- [ ] Unify the three loader acceptance rules
      (`packages/reactor-api/src/packages/vite-loader.mts:241-248`,
      `http-loader.ts:52-58`, `import-loader.ts:87-93`) behind one
      predicate, with one shared fixture table of accept/reject module
      shapes that all three run against.
- [ ] Test: feed `makeSubgraphsIndexFile` output
      (`packages/codegen/src/file-builders/subgraphs.ts:110-155`) through
      the unified predicate — generator output meets real consumer once.

## Phase 2 — seam inventory and real-pair backfill (R1)

- [ ] Inventory: list the interface seams in `packages/reactor`,
      `packages/reactor-api` and `packages/reactor-workflow` where unit
      tests substitute a double for a collaborator that has a real in-repo
      implementation. Mechanical starting points: `as unknown as I` casts
      and `vi.fn()`-built objects assigned to interface-typed parameters in
      test files. Expected yield: 15–25 seams.
- [ ] Classify each seam: already has a real-pair test (done — e.g. the
      view/gate seam since `sync-scope-gate-postgres.test.ts`), seam
      carries logic on both sides (needs one composed test), or double is
      inert (logger, clock — no obligation).
- [ ] Backfill one composed test per seam in the second class, reusing the
      harness in `catch-up-guards.test.ts` (PGlite, real migrations, real
      stores) rather than new per-file boots. Priority order: seams on the
      write path and sync path first, since that is where the two
      data-loss reports lived.
- [ ] Record the inventory and its classifications as an appendix to this
      file when done, so the next seam added to the code base has a list
      to join.

## Phase 3 — degraded-branch audit (R3) and tooling

- [ ] Script: a small coverage-report reader (the JSON reporter is already
      on in `packages/reactor/vitest.config.ts`) that lists branches
      executed fewer than N times across a full run, with file:line.
      Advisory output for reviewers; not a CI gate. Home:
      `packages/reactor/scripts/` or the bench tooling directory,
      whichever review prefers.
- [ ] Sweep the reactor's fallback branches the script surfaces (the
      `{}`-substitution class: default-on-missing in read models, caches,
      sync). For each: add the intent assertion, or convert to
      refuse/skip-and-warn, or delete dead protection (the redundant guard
      noted in the catch-up report,
      `document-view.ts` second `{}` normalization, is a candidate).
- [ ] Apply R4 retroactively only where a convention test is already
      known wrong (the analytics suite, Phase 1b) — no blanket rewrite of
      passing convention tests.

## Phase 4 — CI topology

The policy is only as good as what CI runs.

- [ ] Add the analytics integration suites to a CI lane:
      `analytics-engine-pg` and `analytics-engine-browser` are in neither
      `test:ci` nor `test:ci:platform` (root `package.json:7`), so
      Phase 1b's corrected tests would otherwise gate nothing.
- [ ] Note which packages declare a `test` script but ship zero test
      files (`analytics-engine-graphql`, `analytics-engine-knex`) in the
      policy's enforcement section once verified — a green check from an
      empty suite is a standing R2 violation at package scale.
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
