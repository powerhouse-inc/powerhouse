import type { Kysely } from "kysely";
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
 */
export async function sweepDocumentVersions(
  db: Kysely<Database>,
): Promise<DocumentVersionSweepResult> {
  const documents = await db
    .selectFrom("Operation")
    .select(["documentId", "branch"])
    .where("scope", "=", "document")
    .distinct()
    .execute();

  const upgrades = await db
    .selectFrom("Operation")
    .select(["documentId", "branch", "index", "action"])
    .where("scope", "=", "document")
    .orderBy("documentId")
    .orderBy("branch")
    .orderBy("index")
    .execute();

  const failures: DocumentVersionFailure[] = [];
  for (const row of upgrades) {
    const action = parseAction(row.action);
    if (action === undefined || action.type !== "UPGRADE_DOCUMENT") {
      continue;
    }

    const fromVersion = numberOf(action.input?.fromVersion);
    const toVersion = numberOf(action.input?.toVersion);

    // The write cache's own test for an upgrade that changes the reducer, so a
    // creation-time 0 -> N seed is correctly not a boundary.
    if (fromVersion > 0 && fromVersion < toVersion) {
      failures.push({
        documentId: row.documentId,
        branch: row.branch,
        fromVersion,
        toVersion,
        index: row.index,
      });
    }
  }

  return { documentsChecked: documents.length, failures };
}

type UpgradeShape = {
  type?: string;
  input?: { fromVersion?: unknown; toVersion?: unknown };
};

/** The action column is jsonb on Postgres and text on some stores. */
function parseAction(action: unknown): UpgradeShape | undefined {
  if (typeof action === "string") {
    try {
      return JSON.parse(action) as UpgradeShape;
    } catch {
      return undefined;
    }
  }
  if (typeof action === "object" && action !== null) {
    return action as UpgradeShape;
  }
  return undefined;
}

function numberOf(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
