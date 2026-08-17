import { isDenied } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import type { IOperationStore } from "../storage/interfaces.js";
import type { Database } from "../storage/kysely/types.js";

/** A document whose history crosses a reducer-version boundary. */
export type DocumentVersionFailure = {
  documentId: string;
  branch: string;
  fromVersion: number;
  toVersion: number;
  index: number;
};

export type DocumentVersionSweepResult = {
  documentsChecked: number;
  failures: DocumentVersionFailure[];
};

/**
 * Sweeps for documents whose history crosses an `UPGRADE_DOCUMENT` that changes
 * the reducer version, which `authConditions` cannot evaluate correctly.
 *
 * A positional walk resolves one reducer for the whole range, from the base
 * state read below every upgrade boundary, so it folds the range with the
 * document's creation-time reducer and never runs the migration. A condition
 * reading a field a migration introduced therefore reads undefined, and worse,
 * admission and replay disagree: admission reads the condition's state at the
 * head, where every upgrade has been applied, so an operation admitted against
 * post-upgrade state can be refused when re-evaluation walks it again.
 *
 * Creation-time seeds are not boundaries. `reactor.create` submits an upgrade
 * from version zero as part of the create batch, and the rebuild applies those
 * inline; this uses the same predicate the write cache uses to tell one from a
 * real version change.
 *
 * Read through the operation store the way the write cache reads, so a denied
 * or errored upgrade is visible: the cache skips both before it tests the
 * version, so neither changes the reducer, and a delete-then-upgrade leaves
 * exactly that row. Reporting one would call a document permanently unsafe
 * with no remediation, because the document scope is append-only.
 */
export async function sweepDocumentVersions(
  db: Kysely<Database>,
  operationStore: IOperationStore,
): Promise<DocumentVersionSweepResult> {
  const documents = await db
    .selectFrom("Operation")
    .select(["documentId", "branch"])
    .where("scope", "=", "document")
    .distinct()
    .execute();

  const failures: DocumentVersionFailure[] = [];
  for (const { documentId, branch } of documents) {
    const stored = await operationStore.getSince(
      documentId,
      "document",
      branch,
      -1,
      { actionTypes: ["UPGRADE_DOCUMENT"] },
    );

    for (const operation of stored.results) {
      if (operation.error || isDenied(operation)) {
        continue;
      }

      const input = operation.action.input as
        | { fromVersion?: unknown; toVersion?: unknown }
        | undefined;
      const fromVersion = numberOf(input?.fromVersion);
      const toVersion = numberOf(input?.toVersion);

      // The write cache's own test for an upgrade that changes the reducer, so
      // a creation-time 0 -> N seed is correctly not a boundary.
      if (fromVersion > 0 && fromVersion < toVersion) {
        failures.push({
          documentId,
          branch,
          fromVersion,
          toVersion,
          index: operation.index,
        });
      }
    }
  }

  return { documentsChecked: documents.length, failures };
}

function numberOf(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
