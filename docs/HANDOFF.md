# Handoff

State of open work as of 2026-11-06 (main `a88b2cfb13`).

## Start here

- `docs/TROUBLESHOOTING.md` - build, test, CI and runtime traps.
- `.claude/README.md` - repo agents, commands and the bench pipeline.
- `docs/adr/` - architecture decisions. `docs/specs/auth-scope.md` - auth scope design and stage status.
- `RELEASE.md`, `docs/BREAKING-CHANGES-GUIDE.md` - release flow.

## Plans in progress

Each plan's Status line says what is done and what remains.

| Plan | Remaining |
|---|---|
| `docs/plans/2026-09-08-hybrid-projection-worker.md` | Bench sweep, staging parity checks, `REACTOR_PROJECTION_WORKER=1` rollout |
| `docs/plans/2026-09-30-graphql-document-argument-names.md` | Stages 5c-5e (reactor-browser, renown), stage 6 deletions, stage 7 (recipes), then drop the deprecated args |
| `docs/plans/2026-10-01-subgraph-attachments.md` | Stage 2 (workflow reference-only access), refuse an upload send after the reservation expires |
| `docs/plans/2026-10-02-reactor-tests-on-windows.md` | Track D: reactor gate in `check-windows.yml` |
| `docs/plans/2026-10-02-reactor-worker-packaging.md` | Four follow-ups, incl. whether workers are on by default |
| `docs/plans/2026-10-02-testing-policy.md`, `-rollout.md` | Never adopted (phase 0) |
| `docs/plans/2026-10-13-uniform-runners.md` | Built behind `FEATURE_UNIFORM_RUNNERS_ENABLED`; flip on, remove flag, delete legacy boot paths |

## Open work without a plan

- **Auth scope stages 9-10.** Migrate permission tables to grants, then retire the tables. Enforcement cannot be turned on until stage 9 lands; all four auth flags default off. Until then an unprotected document is readable by anyone (`packages/reactor-api/src/services/authorization.service.ts`). See `docs/specs/auth-scope.md`.
- **Remove the `documentDecisions` flag.** Intended to be always on; still defaults off in `packages/reactor/src/core/feature-flags.ts`. Not started.
- **Lost rows after a peer narrows its protocol.** Rows refused as `PEER_PROTOCOL_UNSUPPORTED` are never resent once the peer widens again. `noLostRows` fails in `packages/reactor/spec/PeerAgreement.qnt`; pinned as `it.fails` in `packages/reactor/test/sync/lost-operation-resend.test.ts`, which also pins the echo-alone repair.
- **Multi-reactor:** rewind/replay protocol and remote admin mutations were deferred.
- **Peer UNDO inside a load reshuffle**, base-reducer 2 documents only. `it.fails` in `packages/reactor/test/executor/load-rewind.test.ts`. Base-reducer 3 (the default) passes.
- **undici HTTP 421 retry.** Worked around in `packages/reactor-browser/src/graphql-client/transport.ts`; never reported upstream.
- **Small:** no `events` before/after bench record for read-side catch-up (#3124); the `DYNAMIC_BASE_PLACEHOLDER` rewrite from #3167 was never verified.

## Known gaps in landed work

Recorded in deviation notes removed with their plans. Unverified since written; read them with `git show 38cdedc760^:<path>`.

- `docs/plans/2026-09-30-document-erasure-deviations.md` - "Open items" and "Pre-existing bugs found, not fixed": about 40 entries across release/CI, scheduler, sync, processors and executor (e.g. `isPurgedFailure` matches on message text, no size cap on marker loads, no env var for `jobTimeoutMs`).
- `docs/plans/2026-10-19-undo-v3-deviations.md` - "Known gaps": 11 entries (e.g. copies keep source versions, unknown base-reducer numbers, pre-`generateActionId` client ids are random).
- `docs/plans/2026-10-01-retire-atomic-node-fs-deviations.md` - the downgrade path was never tested.
