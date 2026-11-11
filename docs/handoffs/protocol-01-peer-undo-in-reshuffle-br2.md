# Decide the fate of the base-reducer 2 peer-UNDO-in-reshuffle pin

**Type:** Triage (confirm, recommend fix or wontfix, then stop)
**Size:** S (triage) / L (if a fix is chosen)   **Area:** packages/reactor, packages/shared (document-model)

## Context

Repo: `/Users/benjaminjordan/projects/powerhouse/powerhouse`, checked at main b957b9e811. Paths below are relative to it.

Base-reducer 2 (v2) records an undo as a `NOOP` row whose `skip` rewinds the operations before it. The `NOOP` names no target. Base-reducer 3 (v3, the default since undo v3 merged as #3322..#3348 on 2026-11-02) replaced this with `RETRACT`, which names the action id it undoes.

When a load reshuffles a v2 stream (`executeLoadJob`, `packages/reactor/src/executor/simple-job-executor.ts:3402`), `reshuffleByTimestamp` (`src/utils/reshuffle.ts:66`) hands the whole skip to the first re-sorted row and zeroes the rest. The executor then gives incoming `NOOP`s a skip of 1 back (`simple-job-executor.ts:3679-3705`). A skip of 1 undoes whatever now sorts directly before the `NOOP`, which after a reshuffle need not be the operation the peer undid.

The undo v3 re-land had a hard rule: a v1 or v2 document behaves exactly as before, and every behaviour change applies only to v3. Sources:
- `git -C /Users/benjaminjordan/projects/powerhouse/powerhouse show 38cdedc760^:docs/plans/2026-10-19-undo-v3-deviations.md`, section "Base-reducers 1 and 2 are unchanged".
- `docs/adr/0007-action-ids-and-auth-clock.md:44-49`.
- The recorded v2 corpus, replayed on every change: `packages/reactor/test/v2-corpus/v2-corpus.test.ts:56`.

`docs/HANDOFF.md` lists this pin under "Open work without a plan". Nobody has decided it must be fixed.

## Problem

`packages/reactor/test/executor/load-rewind.test.ts:183` is pinned `it.fails` ("keeps a peer's undo on the operation it undid"). The comment at `:180-181` gives the cause: a `NOOP` records no target, so a reshuffle that moves a peer's undo away from the operation it undid leaves the skip on whatever sorts before it. Confirmed on main b957b9e811: `pnpm vitest run test/executor/load-rewind.test.ts` gives 5 passed, 1 expected fail. The v3 twin (`:303`) passes, because a `RETRACT` names `x`.

Sibling v2 pins of the same family (a skip lands on the wrong row):
- `test/executor/load-append-undo.test.ts:97` (trivial-append load)
- `test/executor/load-noop-head.test.ts:60` (reshuffle-head `NOOP`)
- `test/executor/effective-ops-rules.test.ts:226-423` (9 pins under "base-reducer 2")
- `test/sync/lost-operation-resend.test.ts:438` and `:594` ("BUG (b)": a trivial-append load keeps the sender's skip); the v3 twins at `:651` and `:733` pass

## Goal

A written decision, wontfix or fix, for this pin and its siblings, backed by evidence. If wontfix, the pins become documented behaviour, not open bugs.

## Acceptance criteria

- The failure is reproduced on current main and the root cause confirmed against the code cited above.
- A recommendation covering the whole family, not just `load-rewind.test.ts:183`, with:
  - whether any v2 fix is possible without changing what peers store or derive (the replica agreement test below);
  - which hosts still create v2 documents (models not built by `createReducer`, `undoV3=false` hosts, `module.utils.createDocument()`) and so how much live traffic it affects;
  - cost of each option.
- **If wontfix (expected outcome):** stop and report. On approval, the follow-up converts each `it.fails` into an `it` that asserts today's behaviour, with a one-line comment naming the limit, and adds one line to `docs/TROUBLESHOOTING.md` or the reactor README saying v2 peer undo is unreliable across reshuffles and v3 is the fix.
- **If a fix:** stop with a plan for review before writing code. The plan must say how every peer applies the same rule at the same time.

## Constraints and invariants

- Base-reducer 1 and 2 behaviour is frozen (sources in Context). A change that alters what a v2 replica stores or derives breaks that rule and must be argued as an explicit exception.
- Replica agreement: every replica must derive the same state from the same stored rows. A change to how a v2 load positions or reads a `NOOP` is a protocol change. It has to be deterministic across peers and switched fleet-wide (a protocol version or flag announced through peer agreement), never per host.
- The v2 corpus (`test/v2-corpus/`) must stay green unchanged.
- Do not touch v3 code paths; the v3 twin must keep passing.

## Suggested approach

1. Reproduce. Read `simple-job-executor.ts:3600-3710` and `src/utils/reshuffle.ts:60-130`.
2. Check whether the executor could recover the target at load time without new wire data (for example, from the sender's original index and skip). If it needs data the `NOOP` does not carry, a fix is a new v2 protocol revision, and v3 already is that revision.
3. Count exposure: see where v2 is still chosen at create: `fitCreateBaseReducer` (`packages/shared/document-model/create-base-reducer.ts:25`); `module.utils.createDocument()` still creates v2.
4. Write the recommendation (under a page) and stop.

Open question: is there any deployment that both runs v2 documents and relies on concurrent peer undo? If none is known, wontfix is the default.

## Verify

- `pnpm vitest run test/executor/load-rewind.test.ts` in packages/reactor: 5 passed, 1 expected fail before; after a wontfix conversion, 6 passed.
- Same for the sibling files listed above.
- `pnpm test` in packages/reactor, including `test/v2-corpus`.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
