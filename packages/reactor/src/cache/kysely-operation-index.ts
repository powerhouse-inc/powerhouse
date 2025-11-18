import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  PagedResults,
  PagingOptions,
  ViewFilter,
} from "../storage/interfaces.js";
import type { Database } from "../storage/kysely/types.js";
import type {
  InsertableDocumentCollection,
  InsertableOperationIndexOperation,
  IOperationIndex,
  IOperationIndexTxn,
  OperationIndexEntry,
  OperationIndexOperationRow,
} from "./operation-index-types.js";

type CollectionMembershipRecord = {
  collectionId: string;
  documentId: string;

  // this is NOT operation.index -- it is the index of the operation in the
  // operations array
  operationIndex: number;
};

class KyselyOperationIndexTxn implements IOperationIndexTxn {
  private collections: string[] = [];
  private collectionMemberships: CollectionMembershipRecord[] = [];
  private collectionRemovals: CollectionMembershipRecord[] = [];
  private operations: OperationIndexEntry[] = [];

  createCollection(collectionId: string): void {
    this.collections.push(collectionId);
  }

  addToCollection(collectionId: string, documentId: string): void {
    const lastOpIndex = this.operations.length - 1;
    if (lastOpIndex < 0) {
      throw new Error(
        "addToCollection must be called after write() - no operations in transaction",
      );
    }
    this.collectionMemberships.push({
      collectionId,
      documentId,
      operationIndex: lastOpIndex,
    });
  }

  removeFromCollection(collectionId: string, documentId: string): void {
    const lastOpIndex = this.operations.length - 1;
    if (lastOpIndex < 0) {
      throw new Error(
        "removeFromCollection must be called after write() - no operations in transaction",
      );
    }
    this.collectionRemovals.push({
      collectionId,
      documentId,
      operationIndex: lastOpIndex,
    });
  }

  write(operations: OperationIndexEntry[]): void {
    this.operations.push(...operations);
  }

  getCollections(): string[] {
    return this.collections;
  }

  getCollectionMemberships(): CollectionMembershipRecord[] {
    return this.collectionMemberships;
  }

  getCollectionRemovals(): CollectionMembershipRecord[] {
    return this.collectionRemovals;
  }

  getOperations(): OperationIndexEntry[] {
    return this.operations;
  }
}

export class KyselyOperationIndex implements IOperationIndex {
  constructor(private db: Kysely<Database>) {}

  start(): IOperationIndexTxn {
    return new KyselyOperationIndexTxn();
  }

  async commit(txn: IOperationIndexTxn, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const kyselyTxn = txn as KyselyOperationIndexTxn;
    const collections = kyselyTxn.getCollections();
    const memberships = kyselyTxn.getCollectionMemberships();
    const removals = kyselyTxn.getCollectionRemovals();
    const operations = kyselyTxn.getOperations();

    await this.db.transaction().execute(async (trx) => {
      if (collections.length > 0) {
        const collectionRows: InsertableDocumentCollection[] = collections.map(
          (collectionId) => ({
            documentId: collectionId,
            collectionId,
            joinedOrdinal: BigInt(0),
            leftOrdinal: null,
          }),
        );

        await trx
          .insertInto("document_collections")
          .values(collectionRows)
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      let operationOrdinals: number[] = [];
      if (operations.length > 0) {
        const operationRows: InsertableOperationIndexOperation[] =
          operations.map((op) => {
            const timestamp = op.timestampUtcMs;
            let timestampMs: number;
            if (/^\d+$/.test(timestamp)) {
              timestampMs = Number(timestamp);
            } else {
              timestampMs = new Date(timestamp).getTime();
            }
            return {
              opId: op.id || "",
              documentId: op.documentId,
              documentType: op.documentType,
              scope: op.scope,
              branch: op.branch,
              timestampUtcMs: BigInt(timestampMs || 0),
              index: op.index,
              skip: op.skip,
              hash: op.hash,
              action: op.action as unknown,
            };
          });

        const insertedOps = await trx
          .insertInto("operation_index_operations")
          .values(operationRows)
          .returning("ordinal")
          .execute();

        operationOrdinals = insertedOps.map((row) => row.ordinal);
      }

      if (memberships.length > 0) {
        for (const m of memberships) {
          // this is guaranteed to be defined because we enforce in KyselyOperationIndexTxn
          const ordinal = operationOrdinals[m.operationIndex];

          await trx
            .insertInto("document_collections")
            .values({
              documentId: m.documentId,
              collectionId: m.collectionId,
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
      }

      if (removals.length > 0) {
        for (const r of removals) {
          // this is guaranteed to be defined because we enforce in KyselyOperationIndexTxn
          const ordinal = operationOrdinals[r.operationIndex];

          await trx
            .updateTable("document_collections")
            .set({
              leftOrdinal: BigInt(ordinal),
            })
            .where("collectionId", "=", r.collectionId)
            .where("documentId", "=", r.documentId)
            .where("leftOrdinal", "is", null)
            .execute();
        }
      }
    });
  }

  async find(
    collectionId: string,
    cursor?: number,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationIndexEntry>> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("operation_index_operations as oi")
      .innerJoin("document_collections as dc", "oi.documentId", "dc.documentId")
      .selectAll("oi")
      .select(["dc.documentId", "dc.collectionId"])
      .where("dc.collectionId", "=", collectionId)
      .whereRef("oi.ordinal", ">=", "dc.joinedOrdinal")
      .where(
        sql<boolean>`dc."leftOrdinal" IS NULL OR oi.ordinal < dc."leftOrdinal"`,
      )
      .orderBy("oi.ordinal", "asc");

    if (cursor !== undefined) {
      query = query.where("oi.ordinal", ">", cursor);
    }

    if (view?.branch) {
      query = query.where("oi.branch", "=", view.branch);
    }

    if (view?.scopes && view.scopes.length > 0) {
      query = query.where("oi.scope", "in", view.scopes);
    }

    if (paging?.cursor) {
      const cursorOrdinal = Number.parseInt(paging.cursor, 10);
      query = query.where("oi.ordinal", ">", cursorOrdinal);
    }

    if (paging?.limit) {
      query = query.limit(paging.limit + 1);
    }

    const rows = await query.execute();

    let hasMore = false;
    let items = rows;

    if (paging?.limit && rows.length > paging.limit) {
      hasMore = true;
      items = rows.slice(0, paging.limit);
    }

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].ordinal.toString()
        : undefined;

    return {
      items: items.map((row) => this.rowToOperationIndexEntry(row)),
      nextCursor,
      hasMore,
    };
  }

  private rowToOperationIndexEntry(
    row: OperationIndexOperationRow,
  ): OperationIndexEntry {
    return {
      ordinal: row.ordinal,
      documentId: row.documentId,
      documentType: row.documentType,
      branch: row.branch,
      scope: row.scope,
      index: row.index,
      timestampUtcMs: row.timestampUtcMs.toString(),
      hash: row.hash,
      skip: row.skip,
      action: row.action as OperationIndexEntry["action"],
      id: row.opId,
    };
  }
}
