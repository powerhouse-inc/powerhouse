/**
 * Repro for mechanism (D) of
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md
 * (addendum 2, item 2) and the analysis in
 * docs/bugs/2026-10-03-sync-defect-analysis.md.
 *
 * The live defect: 40s after the restart, a new inbound op for
 * `distyra/original-source-queue` doc `vq9tPk...` dead-lettered as
 * `error_type: UNCLASSIFIED`, "Document not found" -- its ancestor state was in
 * the rolled-back batch. Worse than the bug doc recorded: UNCLASSIFIED also
 * QUARANTINES the document, and nothing but a purge ever clears a quarantine,
 * so every future op for that document is refused for the life of the store.
 *
 * Everything below asserts the CORRECT behaviour, so every test fails against
 * current code. `describe.skip`ped so CI stays green until the fixes land as
 * their own reviewed work packages.
 */
import { describe, expect, it } from "vitest";
import { DocumentNotFoundError } from "../../src/shared/errors.js";
import {
  classifyJobFailure,
  quarantinesDocument,
  syncOperationErrorType,
} from "../../src/sync/utils.js";
import { ChannelError } from "../../src/sync/errors.js";
import { ChannelErrorSource } from "../../src/sync/types.js";

describe.skip("mechanism D: missing-ancestor inbox failures are buried as garbage", () => {
  /**
   * The classification site is the single `switch` in
   * src/sync/utils.ts:556-580. It has no `DocumentNotFoundError` case, so the
   * `default` branch (:578-579) returns `UNCLASSIFIED`.
   *
   * How an inbound op gets there:
   *  1. The load job's write cache throws `DocumentNotFoundError`
   *     (src/cache/kysely-write-cache.ts:799-801) because the document has no
   *     op at `document` scope index -1.
   *  2. `job-result-handler.ts:148-167` DEFERS the job instead of failing it --
   *     the one place the stack admits "the ancestor may still be in flight".
   *  3. `deferred-jobs.ts` releases it only on a `CREATE_DOCUMENT` for that
   *     exact id; otherwise it expires after
   *     `DEFAULT_DEFERRED_JOB_TTL_MS = 30_000` (executor/types.ts:167) and is
   *     failed with a fresh `DocumentNotFoundError` (deferred-jobs.ts:160).
   *  4. `SyncManager.inboxFailure` (sync-manager.ts:2305-2327) classifies by
   *     `error.name` -> `UNCLASSIFIED`, and flattens the typed error into
   *     `new Error("Failed to apply operations: ...")`, dropping the
   *     `documentId` that `ErrorInfo` had carried.
   *
   * A missing ancestor is repair signal, not garbage: the remote HAS the
   * ancestor and a cursor rewind would fetch it. It must be distinguishable
   * from an op that is genuinely unapplicable.
   *
   * Correct behaviour: a missing-ancestor failure gets its own classification.
   */
  it("classifies a missing ancestor as something other than UNCLASSIFIED", () => {
    expect(classifyJobFailure("DocumentNotFoundError")).not.toBe(
      "UNCLASSIFIED",
    );
    // `DocumentPurgedError` is the only neighbour of this failure that the
    // system already treats as its own thing (DOCUMENT_PURGED,
    // non-quarantining) -- and `DocumentNotFoundError.isError` deliberately
    // answers true for it (src/shared/errors.ts:306-309), because only the
    // name crosses the queue. Any fix has to keep the two apart: purged is
    // terminal, missing-ancestor is repairable.
    expect(classifyJobFailure("DocumentPurgedError")).toBe("DOCUMENT_PURGED");
    expect(classifyJobFailure("DocumentNotFoundError")).not.toBe(
      "DOCUMENT_PURGED",
    );
  });

  /**
   * The irreversible part. `quarantinesDocument` (utils.ts:601-605) returns
   * true for everything outside `NON_QUARANTINING_ERROR_TYPES` (:589-597), so
   * UNCLASSIFIED quarantines. `SyncManager` then adds the id to
   * `quarantinedDocumentIds` (sync-manager.ts:1524-1530) and refuses all
   * further inbound ops for it (:1834). The only line that ever deletes from
   * that set is inside `tombstone()` (:804) -- i.e. a purge. The existing
   * suite already notes this: test/sync/failure-classification.test.ts:96-98,
   * "nothing ever clears a quarantine".
   *
   * So one rolled-back ancestor permanently excommunicates a document from
   * sync, with no lever to undo it.
   *
   * Correct behaviour: a missing ancestor must not quarantine -- the traffic
   * that would repair it is exactly the traffic a quarantine stops. It belongs
   * in NON_QUARANTINING_ERROR_TYPES alongside AUTH_TIMESTAMP_NOT_MONOTONIC,
   * whose comment makes the same argument.
   */
  it("does not quarantine a document for a missing ancestor", () => {
    const classification = classifyJobFailure("DocumentNotFoundError");
    expect(quarantinesDocument(classification)).toBe(false);
  });

  /**
   * End-to-end through the shape the sync manager actually builds. This is
   * what a "repairable" classification would have to key on, and it shows what
   * is available to key on at that point: only `name` and `message` survive
   * `inboxFailure`'s rewrap.
   */
  it("classifies the ChannelError the inbox path builds", () => {
    const underlying = new DocumentNotFoundError("vq9tPk");
    const channelError = new ChannelError(
      ChannelErrorSource.Inbox,
      new Error(`Failed to apply operations: ${underlying.message}`),
      classifyJobFailure(underlying.name),
    );

    const errorType = syncOperationErrorType(channelError);
    expect(errorType).not.toBe("UNCLASSIFIED");
    expect(quarantinesDocument(errorType)).toBe(false);
  });
});
