# Settle ADR 0008, then decide whether run writes are signed by the delegate

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M (ADR work) / L (if stage 2 is built)   **Area:** docs/adr, packages/renown, packages/reactor (signer), packages/reactor-workflow, apps/switchboard

## Context

Repo: `/Users/benjaminjordan/projects/powerhouse/powerhouse`, checked at main b957b9e811. Paths below are relative to it.

ADR 0008 (`docs/adr/0008-delegated-signers.md`) adds a second link: a Renown session key A signs a statement naming a delegate key K, and K signs as the person X, carrying the statement in `signatures`. The monorepo slice merged on 2026-10-31 in ed2387914b (`feat/delegated-signers`):
- `packages/renown/src/delegation.ts` (`verifyDelegation` `:143`, `signDelegatedAction` `:251`). The accepted scope is only `PUBLISH_WORKFLOW` (`DELEGABLE_OPERATIONS`, `:26`).
- `SignatureTrustPolicy.authorizeSigner` gained a fourth argument `{ path, actionType }` (`packages/reactor/src/signer/types.ts:61-72`), passed by admission (`packages/reactor/src/executor/signature-admission.ts:383`).
- With `authEnforcement` off, Switchboard installs `createRenownTrustPolicy({ delegationOnly: true })`, also as a worker spec (`getDelegationTrustPolicyConfig`, `apps/switchboard/src/renown.ts:144-159`).

The ADR is still **Status: Proposed** (`:3`) with 12 open questions addressed to named people (`## Open questions`, end of file). Its §7 says run writes stay host-signed "until stage 2" (`:168`). Its implementation footprint lists run writes signed by the delegate, document permissions, HTTP bearers for delegates and scoped agents as out of the slice. The confidence line says to revisit "if run writes move to stage 2, because carrying `prf` on every write costs real space there" (`:281`). The statement measures about 3.1 KB (§2).

Today a run's writes are host-signed. `RunScopedReactorClient.submitExecute` refuses any action that carries a signer: "the host signs every action" (`packages/reactor-workflow/src/reactor/run-scoped-client.ts:578-590`). ADR 0005 §7 (`docs/adr/0005-piece-reactor-access.md:302-323`) and §8 (`:325-351`) depend on that: under enforcement a run write lands only if both the run user and the Switchboard may make it, so the editor grants the Switchboard's key. The run user is derived from the latest publish (`runUserOfOperation`, `packages/reactor-workflow/src/reactor/run-user.ts:15-29`).

Nothing commits the team to stage 2. The ADR names it as conditional.

## Problem

1. A merged, stored-format decision (ADR §"Negative / risks": "the format is permanent once stored") is still unratified. Delegated publishes can already be stored by any host that runs this code.
2. Stage 2 is undefined beyond one line. It would change who signs every run write, which touches ADR 0005 §7-8 grants and the size of every operation.

## Goal

ADR 0008 has answers to its open questions and a Status that matches the code (Accepted, or amended and Accepted). Stage 2 has a written go/no-go with the design questions answered, or is recorded as not planned.

## Acceptance criteria

- For each of the 12 open questions: a drafted answer with the evidence it rests on (code, tests, or "needs the named owner"), collected in one place.
- Questions that need a person (1-3 Renown owner; 4-8 acaldas and Frank; 9 Benjamin Jordan; 10-12 owner) are put to the user with AskUserQuestion, grouped by owner. Do not answer them on anyone's behalf.
- Question 8 (two-reactor sync of a delegated operation to a peer with no policy) is answered by a test, not a guess: the existing tests (`apps/switchboard/test/delegated-publish.test.ts`, `packages/renown/test/delegation.test.ts`) are single-reactor.
- A revised ADR 0008 (use the repo's `/adr` skill) that records the answers, updates Status only once the user confirms, and either adds a stage 2 section or states that stage 2 is not planned.
- If stage 2 goes ahead: a design section answering the questions below. Stop for review before code.

## Constraints and invariants

- The v2 signature preimage and `hashActionV2` do not change (ADR §3). Element [3] carries the statement hash; any change to that is a new protocol version, fleet-wide.
- Same verdict on every replica: a `path`-dependent check may only add to what load checks (`packages/reactor/src/signer/types.ts:56-58`). The ADR's `env` check at first write is one (§6).
- `signatureVerification` defaults to `enforce`; a host without a policy accepts signed writes only with enforcement off (ADR "Facts").
- Workers get signer and trust policy as module references (`FactorySpec`, `packages/reactor/src/executor/worker/protocol.ts:103-106`, `:230-232`). Any stage 2 signer must be constructible from a spec.
- A host with no signer stores unsigned synthesized undo/redo, which peers reject; stage 2 must not leave a run path without a signer.

## Suggested approach

1. Read ADR 0008 in full, ADR 0005 §6-8, `delegation.ts`, `signer-trust.ts` (`packages/renown/src/signer-trust.ts:41-200`), and `run-scoped-client.ts`.
2. Draft answers. Several can be grounded in code: Q5 (the fourth argument shipped; check that `path` is only additive), Q8 (write the two-reactor test), Q9 (where the signed time is read in `verifyDelegation`).
3. Ask the owners through AskUserQuestion. Record answers in the ADR.
4. Stage 2 design questions, all open:
   - Who holds K at run time? Today K is Sektar's runner key (ADR §12), outside this repo. Does the Switchboard sign run writes with K, or does it forward to Sektar?
   - Does each run write carry the full statement (3.1 KB, with `prf`), or a reference to the publish that carried it? A reference breaks the "verifies offline on any replica" property.
   - What happens to ADR 0005 §8 grants: are writes judged as X with subject key K, and does the Switchboard still need its grant?
   - Statement expiry mid-run: refuse, or finish the run?
   - `scp.ops` widens beyond `PUBLISH_WORKFLOW`: to what, and does `*` stay refused?
5. Recommend go or no-go for stage 2 and stop.

## Verify

- The new two-reactor test passes: `pnpm test` in the package where it lives.
- `pnpm lint` passes in any package with a changed test.
- No code beyond the test changes before review.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
