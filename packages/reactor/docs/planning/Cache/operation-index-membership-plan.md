# Operation Index – Historical Membership Plan

## Goal

Allow `IOperationIndex` collections to expose **all operations for documents while they were members of a drive**, while still keeping a single cursor per collection. Today, removing a child leaves the `document_collections` row untouched, so the collection continues to emit that document’s operations forever. We need start/end metadata so a collection cursor only sees operations that were inside the drive at that ordinal, while still preserving historical membership for analytics.

## Design Overview

| Concern | Current Behaviour | Planned Behaviour |
| --- | --- | --- |
| Membership storage | `document_collections(documentId, collectionId)` with `ON CONFLICT DO NOTHING` | Extend row with `joinedOrdinal BIGINT` and `leftOrdinal BIGINT NULL` (or timestamp equivalent) |
| ADD_RELATIONSHIP | Inserts membership row once and never edits it | Insert (or ensure) row with `joinedOrdinal = op.ordinal`, `leftOrdinal = NULL` |
| REMOVE_RELATIONSHIP | No-op for collections, so membership never ends | Update membership row to set `leftOrdinal = op.ordinal` (if not already set) |
| `find(collectionId, cursor, …)` | Simple join on `collectionId`, includes every historical member forever | Add predicates so only operations with `joinedOrdinal ≤ ordinal < leftOrdinal (or NULL)` are returned |
| “Ever attached” queries | Implicit because rows never delete | Explicit: `document_collections` rows retain both ordinals, so callers can derive history |

## Schema Changes

Update `document_collections` (or add a companion table if we want to keep inserts append-only):

```sql
ALTER TABLE document_collections
  ADD COLUMN joinedOrdinal BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN leftOrdinal BIGINT NULL;

CREATE INDEX idx_doc_collections_collection_range
  ON document_collections(collectionId, joinedOrdinal, COALESCE(leftOrdinal, 9223372036854775807));
```

Backfill strategy:
1. Determine the lowest ordinal currently written per document, set that as `joinedOrdinal`.
2. Leave `leftOrdinal = NULL` for all existing rows so behaviour stays the same until removals happen with the new code.

## Job Executor / Index Writer Updates

1. **ADD_RELATIONSHIP**
   - Pass the operation’s ordinal into `IOperationIndexTxn.addToCollection`.
   - In Kysely’s `commit`, insert the row if it does not exist; if it exists with a `leftOrdinal`, treat the relationship as re-adding the doc: update the row to set `joinedOrdinal = currentOrdinal` and `leftOrdinal = NULL`.

2. **REMOVE_RELATIONSHIP**
   - Extend `IOperationIndexTxn` with a `removeFromCollection(collectionId, documentId, ordinal)` call.
   - In `commit`, translate removals into `UPDATE document_collections SET leftOrdinal = :ordinal WHERE collectionId = :collectionId AND documentId = :documentId AND leftOrdinal IS NULL`.
   - No deletes; we keep the history.

## Query Logic

Modify `KyselyOperationIndex.find`:

```ts
query = query
  .where("dc.collectionId", "=", collectionId)
  .whereRef("oi.ordinal", ">=", "dc.joinedOrdinal")
  .where(({ eb }) =>
    eb.or([
      eb("dc.leftOrdinal", "is", null),
      eb("oi.ordinal", "<", eb.ref("dc.leftOrdinal")),
    ]),
  );
```

This ensures each returned operation is only included while its document belonged to the collection.

## Data Model Notes

- `joinedOrdinal`/`leftOrdinal` are recorded at the same time the operation index rows are written, so they share the same transaction and stay in lockstep.
- If a document is added, removed, then re-added, we can either overwrite the existing row or keep a history table. The simplest approach is to reuse the single row by resetting `joinedOrdinal`/`leftOrdinal`. If we need full multi-period history later, we can split memberships into a separate table.

## Testing

- Unit tests for `KyselyOperationIndex.commit` verifying add/remove flows.
- Integration test covering add → remove → re-add and ensuring `find` only emits operations during active membership ranges.
- Migration tests that ensure legacy memberships still emit operations until they are explicitly removed in the new system.

By capturing membership windows explicitly we keep the single-cursor collection design, stop leaking operations from past members, and still allow analytics tooling to ask “who has ever been attached to this drive?” by reading the recorded ordinals.
