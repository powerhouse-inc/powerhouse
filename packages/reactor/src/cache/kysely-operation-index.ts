import type { Kysely } from "kysely";
import type { Database } from "../storage/kysely/types.js";
import type {
  PagedResults,
  PagingOptions,
  ViewFilter,
} from "../storage/interfaces.js";
import type {
  IOperationIndex,
  IOperationIndexTxn,
  OperationIndexEntry,
  InsertableOperationIndexOperation,
  InsertableDocumentCollection,
  OperationIndexOperationRow,
} from "./operation-index-types.js";

class KyselyOperationIndexTxn implements IOperationIndexTxn {
  private collections: string[] = [];
  private collectionMemberships: Array<{
    collectionId: string;
    documentId: string;
  }> = [];
  private operations: OperationIndexEntry[] = [];

  createCollection(collectionId: string): void {
    this.collections.push(collectionId);
  }

  addToCollection(collectionId: string, documentId: string): void {
    this.collectionMemberships.push({ collectionId, documentId });
  }

  write(operations: OperationIndexEntry[]): void {
    this.operations.push(...operations);
  }

  getCollections(): string[] {
    return this.collections;
  }

  getCollectionMemberships(): Array<{
    collectionId: string;
    documentId: string;
  }> {
    return this.collectionMemberships;
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
    const operations = kyselyTxn.getOperations();

    await this.db.transaction().execute(async (trx) => {
      if (collections.length > 0) {
        const collectionRows: InsertableDocumentCollection[] = collections.map(
          (collectionId) => ({
            documentId: collectionId,
            collectionId,
          }),
        );

        await trx
          .insertInto("document_collections")
          .values(collectionRows)
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      if (memberships.length > 0) {
        const membershipRows: InsertableDocumentCollection[] = memberships.map(
          (m) => ({
            documentId: m.documentId,
            collectionId: m.collectionId,
          }),
        );

        await trx
          .insertInto("document_collections")
          .values(membershipRows)
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

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

        await trx
          .insertInto("operation_index_operations")
          .values(operationRows)
          .execute();
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
