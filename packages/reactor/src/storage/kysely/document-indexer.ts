import type { Operation } from "document-model";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type {
  DocumentGraphEdge,
  DocumentRelationship,
  IDocumentGraph,
  IDocumentIndexer,
  IOperationStore,
  OperationWithContext,
} from "../interfaces.js";
import type {
  Database as StorageDatabase,
  DocumentIndexerDatabase,
  InsertableDocumentRelationship,
} from "./types.js";

type Database = StorageDatabase & DocumentIndexerDatabase;

export class KyselyDocumentIndexer implements IDocumentIndexer {
  private lastOperationId: number = 0;

  constructor(
    private db: Kysely<Database>,
    private operationStore: IOperationStore,
  ) {}

  async init(): Promise<void> {
    await this.createTablesIfNotExist();

    const indexerState = await this.db
      .selectFrom("IndexerState")
      .selectAll()
      .executeTakeFirst();

    if (indexerState) {
      this.lastOperationId = indexerState.lastOperationId;

      const missedOperations = await this.operationStore.getSinceId(
        this.lastOperationId,
      );

      if (missedOperations.items.length > 0) {
        await this.indexOperations(missedOperations.items);
      }
    } else {
      await this.db
        .insertInto("IndexerState")
        .values({
          lastOperationId: 0,
        })
        .execute();

      const allOperations = await this.operationStore.getSinceId(0);
      if (allOperations.items.length > 0) {
        await this.indexOperations(allOperations.items);
      }
    }
  }

  async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    await this.db.transaction().execute(async (trx) => {
      for (const item of items) {
        const { operation } = item;
        const actionType = operation.action.type;

        if (actionType === "ADD_RELATIONSHIP") {
          await this.handleAddRelationship(trx, operation);
        } else if (actionType === "REMOVE_RELATIONSHIP") {
          await this.handleRemoveRelationship(trx, operation);
        }
      }

      const lastOpId = items[items.length - 1].operation.id;
      if (lastOpId && typeof lastOpId === "number") {
        this.lastOperationId = lastOpId;
        await trx
          .updateTable("IndexerState")
          .set({
            lastOperationId: lastOpId,
            lastOperationTimestamp: new Date(),
          })
          .execute();
      }
    });
  }

  async getOutgoing(
    documentId: string,
    types?: string[],
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("sourceId", "=", documentId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      relationshipType: row.relationshipType,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getIncoming(
    documentId: string,
    types?: string[],
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("targetId", "=", documentId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      relationshipType: row.relationshipType,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async hasRelationship(
    sourceId: string,
    targetId: string,
    types?: string[],
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
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

  async getDirectedRelationships(
    sourceId: string,
    targetId: string,
    types?: string[],
    signal?: AbortSignal,
  ): Promise<DocumentRelationship[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("DocumentRelationship")
      .selectAll()
      .where("sourceId", "=", sourceId)
      .where("targetId", "=", targetId);

    if (types && types.length > 0) {
      query = query.where("relationshipType", "in", types);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      sourceId: row.sourceId,
      targetId: row.targetId,
      relationshipType: row.relationshipType,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async findPath(
    sourceId: string,
    targetId: string,
    types?: string[],
    signal?: AbortSignal,
  ): Promise<string[] | null> {
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

      const outgoing = await this.getOutgoing(current.id, types, signal);

      for (const rel of outgoing) {
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
    signal?: AbortSignal,
  ): Promise<IDocumentGraph> {
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

      const incoming = await this.getIncoming(currentId, types, signal);

      for (const rel of incoming) {
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

  async getRelationshipTypes(signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("DocumentRelationship")
      .select("relationshipType")
      .distinct()
      .execute();

    return rows.map((row) => row.relationshipType);
  }

  private async handleAddRelationship(
    trx: Kysely<Database>,
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
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      };

      await trx
        .insertInto("DocumentRelationship")
        .values(relationship)
        .execute();
    }
  }

  private async handleRemoveRelationship(
    trx: Kysely<Database>,
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

  private async checkTablesExist(): Promise<boolean> {
    try {
      await this.db
        .selectFrom("IndexerState")
        .select("lastOperationId")
        .limit(1)
        .execute();
      return true;
    } catch {
      return false;
    }
  }

  private async createTablesIfNotExist(): Promise<void> {
    const tablesExist = await this.checkTablesExist();

    if (!tablesExist) {
      await this.db.schema
        .createTable("IndexerState")
        .ifNotExists()
        .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
        .addColumn("lastOperationId", "integer", (col) => col.notNull())
        .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .execute();

      await this.db.schema
        .createTable("Document")
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("createdAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .addColumn("updatedAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .execute();

      await this.db.schema
        .createTable("DocumentRelationship")
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("sourceId", "text", (col) => col.notNull())
        .addColumn("targetId", "text", (col) => col.notNull())
        .addColumn("relationshipType", "text", (col) => col.notNull())
        .addColumn("metadata", "text")
        .addColumn("createdAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .addColumn("updatedAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .addUniqueConstraint("unique_source_target_type", [
          "sourceId",
          "targetId",
          "relationshipType",
        ])
        .execute();

      await this.db.schema
        .createIndex("idx_relationship_source")
        .on("DocumentRelationship")
        .column("sourceId")
        .execute();

      await this.db.schema
        .createIndex("idx_relationship_target")
        .on("DocumentRelationship")
        .column("targetId")
        .execute();

      await this.db.schema
        .createIndex("idx_relationship_type")
        .on("DocumentRelationship")
        .column("relationshipType")
        .execute();
    }
  }
}
