# ADR 0007 — UUIDv7 action ids and a strictly increasing auth clock

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Benjamin Jordan
- **Implements:** branch `feat/action-ids-auth-clock` (40806a0090 through 75039f788f),
  extracted from `feat/undo-v3` (PR #3259). Design notes: `docs/plans/2026-09-25-undo-v3.md`
  and `docs/plans/2026-10-19-undo-v3-deviations.md` on that branch.

## Context

Actions created in the same millisecond have no defined order, and the auth scope refuses a
same-millisecond burst.

### Key facts about action ids and timestamps before this decision

- `createAction` gave every action a random UUIDv4 id (`generateId`) and a wall-clock
  `timestampUtcMs`. The reactor's action builders, the drive builders and the workflow piece's
  `plainAction` did the same.
- Two actions built in one millisecond carry equal timestamps. Wherever the action id breaks
  the tie, a random id puts them in a random order, not the order they were created in.
- The auth scope's admission rule requires each auth operation's timestamp to strictly exceed
  the stream's newest one. The executor refuses a violation with
  `AuthTimestampNotMonotonicError`, also within one batch. A client that built
  `initializeAuth` and `setGrant` in one millisecond had its write refused.
- Base-reducer 3 (undo v3) orders a job's actions by timestamp, then action id, then operation
  id, comparing ids by code unit. Its same-millisecond order is the action id order.

### Why now

Undo v3 depends on action ids that sort in creation order. The id format and the auth stamp
rule are independent of undo v3, so they land first, for every document version.

## Decision

### 1. Every action id is a UUIDv7

`generateActionId` (in `@powerhousedao/shared/document-model/action-id`) returns a UUIDv7
(RFC 9562, method 1) that strictly increases per process: a 12-bit counter seeded from random
bits orders ids within one millisecond, and a clock that steps back does not reorder them.
`createAction`, the genesis `CREATE_DOCUMENT` and `UPGRADE_DOCUMENT` actions, the reactor and
drive action builders, the workflow piece and the test harnesses use it.

This applies to base-reducer 1 and 2 documents too. Their code treats an action id as an opaque
string. Document, node and folder ids stay UUIDv4.

### 2. Auth actions get strictly increasing stamps

`nextAuthTimestamp` stamps every auth-scope action `createAction` and `plainAction` build. It
returns the wall clock, or one millisecond past the last stamp it returned when the clock has
not passed it. A clock that steps back is followed, not outrun. One process's auth burst
therefore arrives strictly increasing and passes the admission rule.

The executor's refusal stays. `AuthTimestampNotMonotonicError` still rejects a tie or a
backward stamp, for example an action stamped by hand or by another process.

### 3. Non-auth stamps keep the wall clock

Every other scope is stamped with `new Date().toISOString()`. Non-auth stamps are never floored
at the last auth stamp. The undo marker that base-reducers 1 and 2 synthesize is also built
with the wall clock, so undo does not advance the auth clock.

### 4. A same-millisecond auth burst may deny content

A burst of N auth actions in one millisecond is stamped up to N−1 milliseconds ahead of the
clock. Content built in that millisecond keeps the wall-clock stamp, sorts before the grants
stamped ahead of it, and is denied under `documentDecisions` when it depends on those grants.
This window is accepted.

## Consequences

### Positive

- One process's same-millisecond actions keep their creation order wherever the action id
  breaks a tie.
- A client can build and submit an auth burst without spacing it out or catching
  `AuthTimestampNotMonotonicError`.
- Content timestamps stay true wall-clock times.

### Negative / risks

- The window in Decision 4: content made in the millisecond of a grant burst may be denied.
  The author resubmits it once the clock passes the burst.
- The id counter and the auth clock are per process. A Connect tab and its SharedWorker, or two
  workflow piece workers, each have their own. Their actions are not ordered within a
  millisecond, and an auth burst in one can push a later auth write from another below the
  stream's newest stamp, which is refused.
- Clients that predate `generateActionId` keep sending random ids, whose same-millisecond order
  is not preserved.

Confidence is high for single-process clients. Revisit if denied content from bursts shows up
in practice, or if multi-process submitters need a shared clock.

## Alternatives considered

- **Do nothing.** Same-millisecond auth bursts stay refused, and undo v3 has no creation order
  for same-millisecond actions.
- **Strictly increasing stamps for every action.** This was undo v3's first implementation. It
  orders a process's actions by timestamp alone, but moves content stamps off the wall clock and
  changes the rows base-reducer 2 writes. Rejected.
- **Floor non-auth stamps at the last auth stamp.** Content would sort after a burst's grants and
  avoid the denial in Decision 4, but every content stamp after a burst would run ahead of the
  clock. Rejected: the denial window is the smaller cost.
- **Drop the executor's monotonic check.** Ties in the auth stream would be stored, and the
  position walk refuses to read such a stream, with no repair path. Rejected.
- **v3-only ids.** Give v7 ids only to base-reducer 3 documents. Builders do not know the
  document's version when they mint an id, and v1/v2 code treats ids as opaque, so one generator
  for all versions is simpler. Rejected.
