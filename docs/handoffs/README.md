# Reactor work prompts

One prompt per "Would need work" bullet on the handoff deck's "what's next" slides. Each file stands alone: drop it into an agent as the task. All claims were checked against main at b957b9e811 (2026-11-11); several files open with a correction where the deck was wrong.

**Types**
- **Implement**: build it, open a PR.
- **Design first**: write an ADR or plan, then stop for review before any code.
- **Triage**: confirm the behaviour, recommend fix or wontfix, then stop.

## Start here (Implement, small to medium)

| File | Task |
|---|---|
| queue-02-inspector-telemetry-any-queue.md | Let the inspector and queue telemetry work with any queue (two `instanceof InMemoryQueue` checks) |
| hosts-02-store-health-in-health-endpoint.md | Make reactor-api's /health report store health (one liveness vs readiness decision first) |
| sync-01-resend-refused-rows.md | Resend rows refused as PEER_PROTOCOL_UNSUPPORTED once the peer widens |
| sync-02b-remote-admin-mutations.md | Serve the remaining admin levers over GraphQL and wire them into the monitor |

## Triage

| File | Task |
|---|---|
| protocol-01-peer-undo-in-reshuffle-br2.md | Base-reducer 2 peer-UNDO-in-reshuffle pin: fix or wontfix (wontfix expected) |
| protocol-02-undo-v3-known-gaps.md | 6 undo v3 known gaps, checklist |
| protocol-03-erasure-known-gaps.md | 34 erasure known gaps, checklist |
| protocol-05-live-models-in-workers.md | How executor workers get models registered live on the host |

## Design first

| Area | File | Task |
|---|---|---|
| Queue | queue-01-job-tracker-hook.md | Make the job tracker replaceable and readable from another host |
| Queue | queue-03-deferred-jobs-out-of-process.md | Where deferred load jobs live when the queue is out of process |
| Event bus | eventbus-01-serializable-payloads.md | Make job lifecycle event payloads plain data (covers the queue slide's Error/Job bullet too) |
| Event bus | eventbus-02-enqueue-without-emit.md | Stop `queue.enqueue` waiting on job execution through the bus |
| Event bus | eventbus-03-cross-host-subscriptions.md | GraphQL `jobChanges`/`documentChanges` across hosts (also flags a timer leak in `jobChanges`) |
| Event bus | eventbus-04-otel-event-timing.md | Time job metrics at the source, not on receipt |
| Write path | write-01-second-projector.md | Whether and how to partition projection across workers (bench first) |
| Write path | write-02-projection-as-a-service.md | How projection could run as a separate service |
| Write path | write-03-alternate-store-engine.md | A store-engine seam for the write side |
| Protocol | protocol-02a-lost-operation-resend.md | Resend path for rows a peer lacks and the sender never resends (pairs with sync-01) |
| Protocol | protocol-04-delegate-signed-run-writes.md | Settle ADR 0008's open questions, then go/no-go on delegate-signed run writes |
| Sync | sync-02a-rewind-replay-protocol.md | A rewind/replay request between reactors |
| Sync | sync-03-catch-up-outside-process.md | Read-side catch-up for consumers outside the reactor process |
| Sync | sync-04-move-drives-between-switchboards.md | Move a drive's stored data between Switchboards (pairs with hosts-03) |
| Sync | sync-05-connect-push-sync.md | Push transport for Switchboard-to-Connect sync |
| Hosts | hosts-01-worker-pool-on-pglite.md | Whether the executor worker pool can run on PGlite |
| Hosts | hosts-03-rebalancing-switchboard-lb.md | Drive moves, then load-balancer rebalancing |

## Pairs to run together or in order
- sync-01 and protocol-02a (refused-row resend vs rows the sender never resends).
- sync-04 then hosts-03 (move a drive's data, then rebalance the LB).
- eventbus-01 before eventbus-03 (serialisable payloads are a prerequisite for crossing hosts).
