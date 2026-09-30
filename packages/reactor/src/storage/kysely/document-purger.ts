import {
  garbageCollect,
  mentionedGroupIds,
  sortOperations,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { sql, type Kysely, type Transaction } from "kysely";
import type { DocumentViewDatabase } from "../../read-models/types.js";
import { findPurged } from "./document-purges.js";
import type {
  Database,
  DocumentRelationshipTable,
  DocumentTable,
  OperationRow,
  PurgeRemovedRows,
} from "./types.js";

/** An `Operation` row whose DELETE_DOCUMENT applied: not errored, not denied. */
export const appliedDelete = sql<boolean>`action->>'type' = 'DELETE_DOCUMENT' and coalesce(error, '') = '' and coalesce("deniedReason", '') = ''`;

/** Rows removed per statement from the tables a document can fill. */
export const DEFAULT_PURGE_DELETE_BATCH = 5_000;

type PurgeDatabase = Database &
  DocumentViewDatabase & {
    Document: DocumentTable;
    DocumentRelationship: DocumentRelationshipTable;
  };

export type PurgeStream = { scope: string; branch: string };

/** A document of a drive's collection, and whether it lives on elsewhere. */
export type CollectionMember = {
  documentId: string;
  openElsewhere: boolean;
};

/** A purge transaction's statements; bound to the job's transaction. */
export class KyselyDocumentPurger {
  private readonly db: Kysely<PurgeDatabase>;

  constructor(
    db: Kysely<Database> | Transaction<Database>,
    private readonly batchSize = DEFAULT_PURGE_DELETE_BATCH,
  ) {
    this.db = db as unknown as Kysely<PurgeDatabase>;
  }

  /** Every stream the document holds operations in. */
  async streams(documentId: string): Promise<PurgeStream[]> {
    return this.db
      .selectFrom("Operation")
      .select(["scope", "branch"])
      .distinct()
      .where("documentId", "=", documentId)
      .orderBy("scope")
      .orderBy("branch")
      .execute();
  }

  async operationCount(documentId: string): Promise<number> {
    const row = await this.db
      .selectFrom("operation_index_operations")
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .where("documentId", "=", documentId)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  /** Untombstoned documents group_references records as naming the group. */
  async groupReferencers(groupId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom("group_references")
      .select("documentId")
      .where("groupId", "=", groupId)
      .where("documentId", "<>", groupId)
      .orderBy("documentId")
      .execute();
    const ids = rows.map((row) => row.documentId);
    const purged = await findPurged(this.db, ids);
    return ids.filter((id) => !purged.has(id));
  }

  /** Survivors whose accepted auth history names the group; refusals do not. */
  async groupReferencersInHistory(groupId: string): Promise<string[]> {
    const referencing: string[] = [];
    for (const documentId of await this.groupReferencers(groupId)) {
      const byBranch = await this.authOperations(documentId);
      const names = [...byBranch.values()].some((operations) =>
        garbageCollect(sortOperations(operations)).some(
          (operation) =>
            operation.deniedReason === undefined &&
            operation.error === undefined &&
            mentionedGroupIds(operation.action).includes(groupId),
        ),
      );
      if (names) referencing.push(documentId);
    }
    return referencing;
  }

  /** The document's auth-scope operations, per branch, in index order. */
  async authOperations(documentId: string): Promise<Map<string, Operation[]>> {
    const rows = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", "auth")
      .orderBy("branch")
      .orderBy("index")
      .execute();
    const byBranch = new Map<string, Operation[]>();
    for (const row of rows as OperationRow[]) {
      const operations = byBranch.get(row.branch) ?? [];
      operations.push({
        index: row.index,
        timestampUtcMs: row.timestampUtcMs.toISOString(),
        hash: row.hash,
        skip: row.skip,
        error: row.error || undefined,
        deniedReason: row.deniedReason || undefined,
        id: row.opId,
        action: row.action as Operation["action"],
      });
      byBranch.set(row.branch, operations);
    }
    return byBranch;
  }

  /** Every document ever in the collection, but its owner and its own row. */
  async collectionMembers(
    collectionId: string,
    ownerId: string,
  ): Promise<CollectionMember[]> {
    const rows = await this.db
      .selectFrom("document_collections as dc")
      .select("dc.documentId")
      .select((eb) =>
        eb
          .exists(
            eb
              .selectFrom("document_collections as other")
              .select("other.documentId")
              .whereRef("other.documentId", "=", "dc.documentId")
              .where("other.collectionId", "<>", collectionId)
              .where("other.leftOrdinal", "is", null),
          )
          .as("openElsewhere"),
      )
      .where("dc.collectionId", "=", collectionId)
      .where("dc.documentId", "not in", [ownerId, collectionId])
      .orderBy("dc.documentId")
      .execute();
    return rows.map((row) => ({
      documentId: row.documentId,
      openElsewhere: Boolean(row.openElsewhere),
    }));
  }

  async remoteCollection(remoteName: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom("sync_remotes")
      .select("collection_id")
      .where("name", "=", remoteName)
      .executeTakeFirst();
    return row?.collection_id;
  }

  /** Deletes every row about the document; the counts are per table. */
  async deleteRows(documentId: string): Promise<PurgeRemovedRows> {
    const removed: PurgeRemovedRows = {};

    removed.Operation = await this.deleteBatched(async () => {
      const result = await this.db
        .deleteFrom("Operation")
        .where("id", "in", (eb) =>
          eb
            .selectFrom("Operation")
            .select("id")
            .where("documentId", "=", documentId)
            .limit(this.batchSize),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });

    removed.operation_index_operations = await this.deleteBatched(async () => {
      const result = await this.db
        .deleteFrom("operation_index_operations")
        .where("ordinal", "in", (eb) =>
          eb
            .selectFrom("operation_index_operations")
            .select("ordinal")
            .where("documentId", "=", documentId)
            .limit(this.batchSize),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });

    removed.Keyframe = await this.deleteBatched(async () => {
      const result = await this.db
        .deleteFrom("Keyframe")
        .where("id", "in", (eb) =>
          eb
            .selectFrom("Keyframe")
            .select("id")
            .where("documentId", "=", documentId)
            .limit(this.batchSize),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });

    removed.DocumentSnapshot = await this.deleteBatched(async () => {
      const result = await this.db
        .deleteFrom("DocumentSnapshot")
        .where("id", "in", (eb) =>
          eb
            .selectFrom("DocumentSnapshot")
            .select("id")
            .where("documentId", "=", documentId)
            .limit(this.batchSize),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });

    removed.SlugMapping = await this.deleteWhere(
      "SlugMapping",
      "documentId",
      documentId,
    );

    // Counted first: deleting the Document row cascades both ways (004).
    const relationships = await this.db
      .selectFrom("DocumentRelationship")
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .where((eb) =>
        eb.or([
          eb("sourceId", "=", documentId),
          eb("targetId", "=", documentId),
        ]),
      )
      .executeTakeFirst();
    removed.DocumentRelationship = Number(relationships?.count ?? 0);
    removed.Document = await this.deleteWhere("Document", "id", documentId);

    // Rows naming the purged id as the group stay: they key survivors.
    removed.group_references = await this.deleteWhere(
      "group_references",
      "documentId",
      documentId,
    );
    removed.sync_dead_letters = await this.deleteWhere(
      "sync_dead_letters",
      "document_id",
      documentId,
    );
    removed.sync_holds = await this.deleteWhere(
      "sync_holds",
      "document_id",
      documentId,
    );

    return removed;
  }

  async writeTombstone(tombstone: {
    documentId: string;
    ordinal: number;
    removedRows: PurgeRemovedRows;
    purgedAtUtc: Date | string;
    requestId: string;
  }): Promise<void> {
    const values = {
      documentId: tombstone.documentId,
      ordinal: tombstone.ordinal,
      removedRows: JSON.stringify(tombstone.removedRows),
      purgedAtUtc: tombstone.purgedAtUtc,
      requestId: tombstone.requestId,
    };
    await this.db
      .insertInto("document_purges")
      .values(values)
      .onConflict((oc) =>
        oc.column("documentId").doUpdateSet({
          ordinal: values.ordinal,
          removedRows: values.removedRows,
          purgedAtUtc: values.purgedAtUtc,
          requestId: values.requestId,
        }),
      )
      .execute();
  }

  /** Reopens every membership at the marker ordinal, plus `collectionIds`. */
  async reopenMemberships(
    documentId: string,
    ordinal: number,
    collectionIds: Iterable<string> = [],
  ): Promise<string[]> {
    await this.db
      .updateTable("document_collections")
      .set({ joinedOrdinal: BigInt(ordinal), leftOrdinal: null })
      .where("documentId", "=", documentId)
      .execute();
    for (const collectionId of new Set(collectionIds)) {
      await this.db
        .insertInto("document_collections")
        .values({
          documentId,
          collectionId,
          joinedOrdinal: BigInt(ordinal),
          leftOrdinal: null,
        })
        .onConflict((oc) =>
          oc.columns(["documentId", "collectionId"]).doUpdateSet({
            joinedOrdinal: BigInt(ordinal),
            leftOrdinal: null,
          }),
        )
        .execute();
    }
    const rows = await this.db
      .selectFrom("document_collections")
      .select("collectionId")
      .where("documentId", "=", documentId)
      .orderBy("collectionId")
      .execute();
    return rows.map((row) => row.collectionId);
  }

  private async deleteBatched(step: () => Promise<number>): Promise<number> {
    let total = 0;
    for (;;) {
      const deleted = await step();
      total += deleted;
      if (deleted < this.batchSize) {
        return total;
      }
    }
  }

  private async deleteWhere(
    table:
      | "SlugMapping"
      | "Document"
      | "group_references"
      | "sync_dead_letters"
      | "sync_holds",
    column: string,
    documentId: string,
  ): Promise<number> {
    const result = await (this.db as Kysely<any>)
      .deleteFrom(table)
      .where(column, "=", documentId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
