import {
  actionSignerIdentity,
  purgeDocumentAction,
  purgeMarkerOperation,
  type ISigner,
  type PurgeMarkerOperation,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import type {
  Database,
  PurgeRemovedRows,
} from "../../src/storage/kysely/types.js";

export const PURGE_TEST_DOCUMENT_TYPE = "powerhouse/document-model";

export type MarkerOptions = {
  documentType?: string;
  requestId?: string;
  actionId?: string;
  timestampUtcMs?: string;
};

/** An unsigned PURGE_DOCUMENT operation for `documentId`. */
export function purgeMarker(
  documentId: string,
  options: MarkerOptions = {},
): PurgeMarkerOperation {
  const action = purgeDocumentAction(
    {
      documentId,
      documentType: options.documentType ?? PURGE_TEST_DOCUMENT_TYPE,
      requestId: options.requestId ?? "test-request",
    },
    { id: options.actionId, timestampUtcMs: options.timestampUtcMs },
  );
  return purgeMarkerOperation(action);
}

/** A marker signed as the executor signs one: v2, against the purged id. */
export async function signedPurgeMarker(
  signer: ISigner,
  documentId: string,
  options: MarkerOptions = {},
): Promise<PurgeMarkerOperation> {
  const unsigned = purgeMarker(documentId, options);
  const signature = await signer.signAction(unsigned.action, {
    documentId,
    branch: "main",
  });
  const action = {
    ...unsigned.action,
    context: {
      signer: { ...actionSignerIdentity(signer), signatures: [signature] },
    },
  };
  return { ...unsigned, action };
}

export type TombstoneOptions = {
  removedRows?: PurgeRemovedRows;
  purgedAtUtc?: Date;
  requestId?: string;
};

/** Inserts a document_purges row, as the purge transaction does. */
export async function seedTombstone(
  db: Kysely<Database>,
  documentId: string,
  ordinal: number,
  options: TombstoneOptions = {},
): Promise<void> {
  await db
    .insertInto("document_purges")
    .values({
      documentId,
      ordinal,
      removedRows: JSON.stringify(options.removedRows ?? {}),
      purgedAtUtc: options.purgedAtUtc ?? new Date(),
      requestId: options.requestId ?? "test-request",
    })
    .execute();
}

/** Appends the marker as index 0 of a stream with no document-scope rows. */
export async function writeMarkerOperation(
  store: IOperationStore,
  marker: PurgeMarkerOperation,
): Promise<void> {
  await store.apply(
    marker.action.input.documentId,
    marker.action.input.documentType,
    "document",
    "main",
    0,
    (txn) => {
      txn.addOperations(marker);
    },
  );
}

export type IndexMarkerOptions = {
  collectionIds?: string[];
  sourceRemote?: string;
  /** Reopens every membership of the id at the marker ordinal, as a purge does. */
  reopenMemberships?: Kysely<Database>;
};

/** Commits the marker's index twin through the index; returns its ordinal. */
export async function indexMarker(
  index: IOperationIndex,
  marker: PurgeMarkerOperation,
  options: IndexMarkerOptions = {},
): Promise<number> {
  const { documentId, documentType } = marker.action.input;
  const txn = index.start();
  txn.write([
    {
      ...marker,
      documentId,
      documentType,
      scope: "document",
      branch: "main",
      sourceRemote: options.sourceRemote ?? "",
    },
  ]);
  for (const collectionId of options.collectionIds ?? []) {
    txn.addToCollection(collectionId, documentId);
  }
  const [ordinal] = await index.commit(txn);

  if (options.reopenMemberships) {
    await options.reopenMemberships
      .updateTable("document_collections")
      .set({ joinedOrdinal: BigInt(ordinal), leftOrdinal: null })
      .where("documentId", "=", documentId)
      .execute();
  }
  return ordinal;
}

/** A purged id as its stores hold it: the marker, its index twin, a tombstone. */
export async function seedPurgedDocument(
  deps: {
    db: Kysely<Database>;
    store: IOperationStore;
    index: IOperationIndex;
  },
  marker: PurgeMarkerOperation,
  options: IndexMarkerOptions & TombstoneOptions = {},
): Promise<number> {
  await writeMarkerOperation(deps.store, marker);
  const ordinal = await indexMarker(deps.index, marker, options);
  await seedTombstone(deps.db, marker.action.input.documentId, ordinal, {
    requestId: marker.action.input.requestId,
    purgedAtUtc: new Date(marker.action.input.purgedAtUtcIso),
    ...options,
  });
  return ordinal;
}
