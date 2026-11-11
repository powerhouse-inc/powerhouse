# Design a push transport for Switchboard-to-Connect sync

> **Correction to the deck.** Connect ↔ Switchboard sync is not entirely poll-based. Client-to-server already pushes: each outbox add calls `pushSyncEnvelopes` right away (`GqlRequestChannel.attemptPush`, `packages/reactor/src/sync/channels/gql-req-channel.ts:1185-1187`). Only server-to-client operations, and the server's `ackOrdinal` for pushed rows, wait for the next `pollSyncEnvelopes`.

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** packages/reactor (sync/channels), packages/reactor-api (GraphQL/WS), packages/reactor-browser, apps/switchboard-lb

## Context

Connect adds a `{ type: "gql" }` remote per drive (`packages/reactor-browser/src/actions/drive.ts:236-251`). `GqlRequestChannelFactory` builds a `GqlRequestChannel` with an `IntervalPollTimer` (`sync/channels/gql-request-channel-factory.ts:163-189`), which polls every 2000 ms by default (`interval-poll-timer.ts:26`). The server side is a `GqlResponseChannel` whose outbox waits for the client's poll (`gql-res-channel.ts:23`, `:60-90`). Transports plug in through `IChannel`/`IChannelFactory` (`sync/interfaces.ts:37-127`, `:138-…`), composed by `CompositeChannelFactory` (`channels/composite-channel-factory.ts:30`) and `ReactorBuilder.withAdditionalChannelFactory` (`core/reactor-builder.ts:718`). reactor-api already runs a WebSocket server at `/graphql/subscriptions` (`packages/reactor-api/src/server.ts:686-689`). switchboard-lb carries WebSockets across reloads (`apps/switchboard-lb/ARCHITECTURE.md:334`).

## Problem

Verified on main b957b9e811:
- A write on the Switchboard reaches an idle Connect tab only on the next tick: `poll()` at `gql-req-channel.ts:571`, the request at `:870-945`. That is up to `intervalMs` of latency, plus backpressure skips (`interval-poll-timer.ts:28`).
- Every open drive in every tab polls every 2 s even when nothing changed. The server pays for each poll: the serving gate, outbox reads and liveness bookkeeping (`reactor-api/src/graphql/reactor/subgraph.ts:725-850`).
- The client's outbox is trimmed only by the `ackOrdinal` in a poll response (`sync/design.md`, "GqlRequestChannel / Outbox / Remove"). Pushed rows stay in the outbox until the next poll.

## Goal

An ADR that picks a server-to-client push transport, delivered as a new `IChannel` pair. It must keep sync semantics unchanged, fall back to polling, and state the expected latency and server-load change.

## Acceptance criteria

- The ADR compares the options below and picks one, with an auth design for the long-lived connection.
- It maps every field of `pollSyncEnvelopes` (envelopes, `ackOrdinal`, `deadLetters`, `hasMore`, `manifestRevision`, `peerManifestRevision`, `gql-req-channel.ts:937-942`) and of the `refusals` input (`schema.graphql:785-787`) onto the push protocol, or says why one is dropped.
- It defines reconnect: resume from the persisted cursor, with no gap and no ack ahead of an unapplied item.
- It says how the LB routes the connection (`Drive-Id` header on the upgrade) and what happens when the drive moves (421 on upgrade; see `sync-04-move-drives-between-switchboards.md`).
- It names the benchmark that proves the gain: `bench:sync` latency, plus a server CPU comparison with N idle clients.

## Constraints and invariants

- Envelope and ack semantics, and the two ordinal frames (`sync/design.md:178-204`). `ackOrdinal` stays in the client's ordinals.
- The inbox ack never passes an unapplied item (`gql-res-channel.ts:73-90`; received markers, `sync-manager.ts:2740`).
- The serving gate applies to every pushed envelope exactly as it does to a poll: one snapshot feeds the gate and the send (`subgraph.ts:810-835`, `collectHeldSyncOperations` at `resolvers.ts:1959`). Held entries are withheld, not consumed.
- Channel binding: only the bound address may receive (`#bindOrRefuseChannel`, `subgraph.ts:230-266`). Credentials can expire mid-connection, so re-check them (`wsCredentialRecheckIntervalMs` exists in `server.ts`).
- Liveness: a served channel is pruned by `lastHolderPollUtcMs` (`interfaces.ts:93-104`, `sync-manager.ts:3399-3407`). A push connection must keep reporting holder liveness, or live clients get pruned (or dead ones never are).
- Peer agreement: a poll names the client's revision, and a server silences a client that names none (`spec/README.md`, `POLL_REVISION`). The push handshake must carry the same thing. Check whether `spec/PeerAgreement.qnt` needs a push-edge change.
- `triggerPull` and `PollBehavior.Manual` (`interfaces.ts:85`, factory `:179`) keep working.

## Suggested approach

Options:
- **(a) GraphQL subscription over the existing WS server**, for example `syncEnvelopes(channelId)`, with pushes and acks staying on HTTP mutations. Smallest change; reuses graphql-ws auth.
- **(b) Wake-up only.** The server pushes "you have work" over WS or SSE, and the client polls at once. Envelope handling does not change, the gate stays in the poll resolver, and the poll interval can rise to minutes.
- **(c) A full duplex sync protocol over a raw WS.** Biggest change. Only worth it if (a) or (b) cannot meet the target.

Start by measuring (b). It may get most of the gain with no change to sync semantics. Open questions: Do service workers or the Connect SharedWorker (`connect-core` reactor worker) hold the socket per tab or once? How many concurrent sockets can one Switchboard hold (`ws` limits, LB `worker_connections`)?

## Verify

The ADR is the deliverable. Use the `adr` skill. For any prototype: in `packages/reactor`, run `pnpm bench:sync` before and after, then `pnpm tsc --build` and `pnpm test`. In `packages/reactor-api`, run `pnpm test`. Run `pnpm build` in `packages/reactor` before testing reactor-api or reactor-browser, because both read it from dist.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.
