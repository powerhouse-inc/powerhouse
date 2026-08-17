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

/**
 * An `UPGRADE_DOCUMENT` whose version pair is not two numbers, so the boundary
 * rule cannot classify it either way. No writer in this repo produces one, but
 * the sync path admits an inbound action without validating its schema, and the
 * write cache compares the raw values, where a string pair is a boundary.
 */
export type DocumentVersionMalformed = {
  documentId: string;
  branch: string;
  index: number;
  fromVersion: string;
  toVersion: string;
};

export type DocumentVersionSweepResult = {
  documentsChecked: number;
  failures: DocumentVersionFailure[];
  malformed: DocumentVersionMalformed[];
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
 *
 * A version pair that is not two numbers is reported rather than coerced.
 * Coercing a missing version to zero reads it as a creation-time seed, so the
 * one row the rule cannot classify would make the fleet look safe -- and the
 * write cache, which compares the raw values, treats a string pair as a
 * boundary.
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
  const malformed: DocumentVersionMalformed[] = [];
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

      const { fromVersion, toVersion } = versionPair(operation.action.input);
      if (typeof fromVersion !== "number" || typeof toVersion !== "number") {
        malformed.push({
          documentId,
          branch,
          index: operation.index,
          fromVersion: describeVersion(fromVersion),
          toVersion: describeVersion(toVersion),
        });
        continue;
      }

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

  return { documentsChecked: documents.length, failures, malformed };
}

type UpgradeVersions = {
  fromVersion: unknown;
  toVersion: unknown;
};

/** The stored pair, untrusted: the sync path admits an action it never validated. */
function versionPair(input: unknown): UpgradeVersions {
  if (typeof input !== "object" || input === null) {
    return { fromVersion: undefined, toVersion: undefined };
  }

  const stored = input as UpgradeVersions;
  return { fromVersion: stored.fromVersion, toVersion: stored.toVersion };
}

/** Renders a version with its type visible, so a report tells 1 from "1". */
function describeVersion(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
