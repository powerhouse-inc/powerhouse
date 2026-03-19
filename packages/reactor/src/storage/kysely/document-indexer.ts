import type {
  Operation,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type { IOperationIndex } from "../../cache/operation-index-types.js";
import type { IWriteCache } from "../../cache/write/interfaces.js";
import { BaseReadModel } from "../../read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../../read-models/types.js";
import { collectAllPages } from "../../shared/collect-all-pages.js";
import type { IConsistencyTracker } from "../../shared/consistency-tracker.js";
import type {
  ConsistencyToken,
  PagedResults,
  PagingOptions,
} from "../../shared/types.js";
import type {
  DocumentGraphEdge,
  DocumentRelationship,
  IDocumentGraph,
  IDocumentIndexer,
} from "../interfaces.js";
import type {
  DocumentIndexerDatabase,
  InsertableDocumentRelationship,
  Database as StorageDatabase,
} from "./types.js";

export type IndexerDatabase = StorageDatabase &
  DocumentIndexerDatabase &
  DocumentViewDatabase;

export class KyselyDocumentIndexer
  extends BaseReadModel
  implements IDocumentIndexer
{
  private _db: Kysely<IndexerDatabase>;

  constructor(
    db: Kysely<IndexerDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
  ) {
    super(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      writeCache,
      consistencyTracker,
      { readModelId: "document-indexer", rebuildStateOnInit: false },
    );
    this._db = db;
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    await this._db.transaction().execute(async (trx) => {
      for (const item of items) {
        const { operation } = item;
        const actionType = operation.action.type;

        if (actionType === "ADD_RELATIONSHIP") {
          await this.handleAddRelationship(trx, operation);
        } else if (actionType === "REMOVE_RELATIONSHIP") {
          await this.handleRemoveRelationship(trx, operation);
        }
      }
    });
  }

  async getOutgoing(
    documentId: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const startIndex = paging?.cursor ? parseInt(paging.cursor) : 0;
    const limit = paging?.limit || 100;

    let query = this._db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("sourceId", "=", documentId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .offset(startIndex)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: results.map((row) => ({
        sourceId: row.sourceId,
        targetId: row.targetId,
        relationshipType: row.relationshipType,
        metadata: row.metadata
          ? (row.metadata as Record<string, unknown>)
          : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      options: paging || { cursor: "0", limit: 100 },
      nextCursor,
      next: hasMore
        ? () =>
            this.getOutgoing(
              documentId,
              types,
              { cursor: nextCursor!, limit },
              consistencyToken,
              signal,
            )
        : undefined,
    };
  }

  async getIncoming(
    documentId: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const startIndex = paging?.cursor ? parseInt(paging.cursor) : 0;
    const limit = paging?.limit || 100;

    let query = this._db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("targetId", "=", documentId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .offset(startIndex)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: results.map((row) => ({
        sourceId: row.sourceId,
        targetId: row.targetId,
        relationshipType: row.relationshipType,
        metadata: row.metadata
          ? (row.metadata as Record<string, unknown>)
          : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      options: paging || { cursor: "0", limit: 100 },
      nextCursor,
      next: hasMore
        ? () =>
            this.getIncoming(
              documentId,
              types,
              { cursor: nextCursor!, limit },
              consistencyToken,
              signal,
            )
        : undefined,
    };
  }

  async hasRelationship(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this._db
      .selectFrom("DocumentRelationship")
      .select("id")
      .where("sourceId", "=", sourceId)
      .where("targetId", "=", targetId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const result = await query.executeTakeFirst();

    return result !== undefined;
  }

  async getUndirectedRelationships(
    a: string,
    b: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const startIndex = paging?.cursor ? parseInt(paging.cursor) : 0;
    const limit = paging?.limit || 100;

    let query = this._db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([eb("sourceId", "=", a), eb("targetId", "=", b)]),
          eb.and([eb("sourceId", "=", b), eb("targetId", "=", a)]),
        ]),
      );

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .offset(startIndex)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: results.map((row) => ({
        sourceId: row.sourceId,
        targetId: row.targetId,
        relationshipType: row.relationshipType,
        metadata: row.metadata
          ? (row.metadata as Record<string, unknown>)
          : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      options: paging || { cursor: "0", limit: 100 },
      nextCursor,
      next: hasMore
        ? () =>
            this.getUndirectedRelationships(
              a,
              b,
              types,
              { cursor: nextCursor!, limit },
              consistencyToken,
              signal,
            )
        : undefined,
    };
  }

  async getDirectedRelationships(
    sourceId: string,
    targetId: string,
    types?: string[],
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const startIndex = paging?.cursor ? parseInt(paging.cursor) : 0;
    const limit = paging?.limit || 100;

    let query = this._db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("sourceId", "=", sourceId)
      .where("targetId", "=", targetId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .offset(startIndex)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const results = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results: results.map((row) => ({
        sourceId: row.sourceId,
        targetId: row.targetId,
        relationshipType: row.relationshipType,
        metadata: row.metadata
          ? (row.metadata as Record<string, unknown>)
          : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      options: paging || { cursor: "0", limit: 100 },
      nextCursor,
      next: hasMore
        ? () =>
            this.getDirectedRelationships(
              sourceId,
              targetId,
              types,
              { cursor: nextCursor!, limit },
              consistencyToken,
              signal,
            )
        : undefined,
    };
  }

  async findPath(
    sourceId: string,
    targetId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[] | null> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (sourceId === targetId) {
      return [sourceId];
    }

    const visited = new Set<string>();
    const queue: Array<{ id: string; path: string[] }> = [
      { id: sourceId, path: [sourceId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.id === targetId) {
        return current.path;
      }

      if (visited.has(current.id)) {
        continue;
      }

      visited.add(current.id);

      const outgoingPage = await this.getOutgoing(
        current.id,
        types,
        undefined,
        consistencyToken,
        signal,
      );
      const outgoingRelationships = await collectAllPages(outgoingPage, signal);

      for (const rel of outgoingRelationships) {
        if (!visited.has(rel.targetId)) {
          queue.push({
            id: rel.targetId,
            path: [...current.path, rel.targetId],
          });
        }
      }
    }

    return null;
  }

  async findAncestors(
    documentId: string,
    types?: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<IDocumentGraph> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const nodes = new Set<string>([documentId]);
    const edges: DocumentGraphEdge[] = [];
    const queue: string[] = [documentId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const incomingPage = await this.getIncoming(
        currentId,
        types,
        undefined,
        consistencyToken,
        signal,
      );
      const incomingRelationships = await collectAllPages(incomingPage, signal);

      for (const rel of incomingRelationships) {
        nodes.add(rel.sourceId);
        edges.push({
          from: rel.sourceId,
          to: rel.targetId,
          type: rel.relationshipType,
        });

        if (!visited.has(rel.sourceId)) {
          queue.push(rel.sourceId);
        }
      }
    }

    return {
      nodes: Array.from(nodes),
      edges,
    };
  }

  async getRelationshipTypes(
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this._db
      .selectFrom("DocumentRelationship")
      .select("relationshipType")
      .distinct()
      .execute();

    return rows.map((row) => row.relationshipType);
  }

  private async handleAddRelationship(
    trx: Kysely<IndexerDatabase>,
    operation: Operation,
  ): Promise<void> {
    const input = operation.action.input as {
      sourceId: string;
      targetId: string;
      relationshipType: string;
      metadata?: Record<string, unknown>;
    };

    const existingDoc = await trx
      .selectFrom("Document")
      .select("id")
      .where("id", "=", input.sourceId)
      .executeTakeFirst();

    if (!existingDoc) {
      await trx
        .insertInto("Document")
        .values({
          id: input.sourceId,
        })
        .execute();
    }

    const existingTargetDoc = await trx
      .selectFrom("Document")
      .select("id")
      .where("id", "=", input.targetId)
      .executeTakeFirst();

    if (!existingTargetDoc) {
      await trx
        .insertInto("Document")
        .values({
          id: input.targetId,
        })
        .execute();
    }

    const existingRel = await trx
      .selectFrom("DocumentRelationship")
      .select("id")
      .where("sourceId", "=", input.sourceId)
      .where("targetId", "=", input.targetId)
      .where("relationshipType", "=", input.relationshipType)
      .executeTakeFirst();

    if (!existingRel) {
      const relationship: InsertableDocumentRelationship = {
        id: uuidv4(),
        sourceId: input.sourceId,
        targetId: input.targetId,
        relationshipType: input.relationshipType,
        metadata: input.metadata || null,
      };

      await trx
        .insertInto("DocumentRelationship")
        .values(relationship)
        .execute();
    }
  }

  private async handleRemoveRelationship(
    trx: Kysely<IndexerDatabase>,
    operation: Operation,
  ): Promise<void> {
    const input = operation.action.input as {
      sourceId: string;
      targetId: string;
      relationshipType: string;
    };

    await trx
      .deleteFrom("DocumentRelationship")
      .where("sourceId", "=", input.sourceId)
      .where("targetId", "=", input.targetId)
      .where("relationshipType", "=", input.relationshipType)
      .execute();
  }
}
