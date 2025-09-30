import type { Operation } from "document-model";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type {
  DocumentSnapshot,
  IDocumentView,
  IOperationStore,
} from "../storage/interfaces.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
  InsertableSlugMapping,
} from "./types.js";

// Combine both database schemas
type Database = StorageDatabase & DocumentViewDatabase;

// Extended operation type with database fields
interface OperationWithDbId extends Operation {
  dbId?: number;
  documentId?: string;
  scope?: string;
  branch?: string;
}

// Action types for type-safe access
interface BaseAction {
  type: string;
  scope?: string;
  documentType?: string;
  input?: {
    slug?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class KyselyDocumentView implements IDocumentView {
  private lastOperationId: number = 0;

  constructor(
    private db: Kysely<Database>,
    private operationStore: IOperationStore,
  ) {}

  async init(): Promise<void> {
    // Create tables if they don't exist
    await this.createTablesIfNotExist();

    // Load the last processed operation ID from ViewState
    const viewState = await this.db
      .selectFrom("ViewState")
      .selectAll()
      .executeTakeFirst();

    if (viewState) {
      this.lastOperationId = viewState.lastOperationId;

      // Catch up with any operations we missed
      const missedOperations = await this.operationStore.getSinceId(
        this.lastOperationId,
      );

      if (missedOperations.length > 0) {
        await this.indexOperations(missedOperations);
      }
    } else {
      // Initialize ViewState with ID 0
      await this.db
        .insertInto("ViewState")
        .values({
          lastOperationId: 0,
        })
        .execute();

      // Process all existing operations
      const allOperations = await this.operationStore.getSinceId(0);
      if (allOperations.length > 0) {
        await this.indexOperations(allOperations);
      }
    }
  }

  async indexOperations(operations: Operation[]): Promise<void> {
    if (operations.length === 0) return;

    await this.db.transaction().execute(async (trx) => {
      // Track the highest database ID we've seen
      let maxDbId = this.lastOperationId;

      for (const operation of operations) {
        // Extract document metadata from the operation
        const parsed = this.parseOperation(operation);
        const { documentId, scope, branch, index, action } = parsed;

        // Check if we need to create or update a snapshot
        const existingSnapshot = await trx
          .selectFrom("DocumentSnapshot")
          .selectAll()
          .where("documentId", "=", documentId)
          .where("scope", "=", scope)
          .where("branch", "=", branch)
          .executeTakeFirst();

        if (existingSnapshot) {
          // Update existing snapshot
          await trx
            .updateTable("DocumentSnapshot")
            .set({
              lastOperationIndex: index,
              lastOperationHash: operation.hash,
              lastUpdatedAt: new Date(),
              snapshotVersion: existingSnapshot.snapshotVersion + 1,
            })
            .where("documentId", "=", documentId)
            .where("scope", "=", scope)
            .where("branch", "=", branch)
            .execute();
        } else {
          // Create new snapshot
          const snapshot: InsertableDocumentSnapshot = {
            id: uuidv4(),
            documentId,
            slug: null,
            name: null,
            scope,
            branch,
            content: JSON.stringify({}), // Empty for now, will be filled when we build full documents
            documentType: this.extractDocumentType(action),
            lastOperationIndex: index,
            lastOperationHash: operation.hash,
            identifiers: null,
            metadata: null,
            deletedAt: null,
          };

          await trx.insertInto("DocumentSnapshot").values(snapshot).execute();
        }

        // Update slug mapping if the action contains slug information
        if (action.type === "SET_SLUG" || action.type === "CREATE") {
          const slug = this.extractSlug(action);
          if (slug) {
            const existingMapping = await trx
              .selectFrom("SlugMapping")
              .selectAll()
              .where("slug", "=", slug)
              .executeTakeFirst();

            if (!existingMapping) {
              const mapping: InsertableSlugMapping = {
                slug,
                documentId,
                scope,
                branch,
              };
              await trx.insertInto("SlugMapping").values(mapping).execute();
            } else if (existingMapping.documentId !== documentId) {
              // Update if the slug now points to a different document
              await trx
                .updateTable("SlugMapping")
                .set({
                  documentId,
                  scope,
                  branch,
                  updatedAt: new Date(),
                })
                .where("slug", "=", slug)
                .execute();
            }
          }
        }
        // Update max database ID if this operation has one
        const opWithDbId = operation as OperationWithDbId;
        if (typeof opWithDbId.dbId === "number" && opWithDbId.dbId > maxDbId) {
          maxDbId = opWithDbId.dbId;
        }
      }

      // Update the last operation ID if we processed operations from the database
      if (maxDbId > this.lastOperationId) {
        this.lastOperationId = maxDbId;

        await trx
          .updateTable("ViewState")
          .set({
            lastOperationId: this.lastOperationId,
            lastOperationTimestamp: new Date(),
          })
          .execute();
      }
    });
  }

  async exists(
    documentIds: string[],
    signal?: AbortSignal,
  ): Promise<boolean[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (documentIds.length === 0) {
      return [];
    }

    // Query for all documents at once
    const snapshots = await this.db
      .selectFrom("DocumentSnapshot")
      .select(["documentId"])
      .where("documentId", "in", documentIds)
      .where("isDeleted", "=", false)
      .distinct()
      .execute();

    // Create a Set of existing document IDs for fast lookup
    const existingIds = new Set(snapshots.map((s) => s.documentId));

    // Return a boolean array in the same order as the input
    return documentIds.map((id) => existingIds.has(id));
  }

  async getMany(
    documentIds: string[],
    scope: string = "global",
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<(DocumentSnapshot | null)[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (documentIds.length === 0) {
      return [];
    }

    // Query for all documents at once
    const snapshots = await this.db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "in", documentIds)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("isDeleted", "=", false)
      .execute();

    // Create a Map of document ID to snapshot for fast lookup
    const snapshotMap = new Map(snapshots.map((s) => [s.documentId, s]));

    // Return an array in the same order as the input, with null for missing documents
    return documentIds.map((id) => snapshotMap.get(id) || null);
  }

  private async createTablesIfNotExist(): Promise<void> {
    // Check if tables exist by trying to query them
    const tablesExist = await this.checkTablesExist();

    if (!tablesExist) {
      // Create ViewState table
      await this.db.schema
        .createTable("ViewState")
        .ifNotExists()
        .addColumn("lastOperationId", "integer", (col) => col.primaryKey())
        .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .execute();

      // Create DocumentSnapshot table
      await this.db.schema
        .createTable("DocumentSnapshot")
        .ifNotExists()
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("documentId", "text", (col) => col.notNull())
        .addColumn("slug", "text")
        .addColumn("name", "text")
        .addColumn("scope", "text", (col) => col.notNull())
        .addColumn("branch", "text", (col) => col.notNull())
        .addColumn("content", "text", (col) => col.notNull())
        .addColumn("documentType", "text", (col) => col.notNull())
        .addColumn("lastOperationIndex", "integer", (col) => col.notNull())
        .addColumn("lastOperationHash", "text", (col) => col.notNull())
        .addColumn("lastUpdatedAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .addColumn("snapshotVersion", "integer", (col) =>
          col.defaultTo(1).notNull(),
        )
        .addColumn("identifiers", "text")
        .addColumn("metadata", "text")
        .addColumn("isDeleted", "boolean", (col) =>
          col.defaultTo(false).notNull(),
        )
        .addColumn("deletedAt", "timestamptz")
        .addUniqueConstraint("unique_doc_scope_branch", [
          "documentId",
          "scope",
          "branch",
        ])
        .execute();

      // Create indexes for DocumentSnapshot
      await this.db.schema
        .createIndex("idx_slug_scope_branch")
        .on("DocumentSnapshot")
        .columns(["slug", "scope", "branch"])
        .execute();

      await this.db.schema
        .createIndex("idx_doctype_scope_branch")
        .on("DocumentSnapshot")
        .columns(["documentType", "scope", "branch"])
        .execute();

      await this.db.schema
        .createIndex("idx_last_updated")
        .on("DocumentSnapshot")
        .column("lastUpdatedAt")
        .execute();

      await this.db.schema
        .createIndex("idx_is_deleted")
        .on("DocumentSnapshot")
        .column("isDeleted")
        .execute();

      // Create SlugMapping table
      await this.db.schema
        .createTable("SlugMapping")
        .ifNotExists()
        .addColumn("slug", "text", (col) => col.primaryKey())
        .addColumn("documentId", "text", (col) => col.notNull())
        .addColumn("scope", "text", (col) => col.notNull())
        .addColumn("branch", "text", (col) => col.notNull())
        .addColumn("createdAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .addColumn("updatedAt", "timestamptz", (col) =>
          col.defaultTo("now()").notNull(),
        )
        .addUniqueConstraint("unique_docid_scope_branch", [
          "documentId",
          "scope",
          "branch",
        ])
        .execute();

      // Create index for SlugMapping
      await this.db.schema
        .createIndex("idx_slug_documentid")
        .on("SlugMapping")
        .column("documentId")
        .execute();
    }
  }

  private async checkTablesExist(): Promise<boolean> {
    try {
      // Try to query ViewState table
      await this.db
        .selectFrom("ViewState")
        .select("lastOperationId")
        .limit(1)
        .execute();
      return true;
    } catch {
      return false;
    }
  }

  private parseOperation(operation: Operation): {
    documentId: string;
    scope: string;
    branch: string;
    index: number;
    action: BaseAction;
  } {
    const opWithDbFields = operation as OperationWithDbId;

    // Handle operations from database (which have documentId, scope, branch at root level)
    // vs operations from memory
    if (
      "documentId" in opWithDbFields &&
      typeof opWithDbFields.documentId === "string"
    ) {
      return {
        documentId: opWithDbFields.documentId,
        scope: opWithDbFields.scope || "global",
        branch: opWithDbFields.branch || "main",
        index: opWithDbFields.index,
        action: opWithDbFields.action as BaseAction,
      };
    }

    // Extract from action for in-memory operations
    const action = operation.action as BaseAction;
    const actionWithDocId = action as BaseAction & {
      documentId?: string;
      branch?: string;
    };

    return {
      documentId: actionWithDocId.documentId || "",
      scope: action.scope || "global",
      branch: actionWithDocId.branch || "main",
      index: operation.index,
      action,
    };
  }

  private extractDocumentType(action: BaseAction): string {
    // Extract document type from action
    // This would need to be customized based on your action structure
    return action.documentType || "unknown";
  }

  private extractSlug(action: BaseAction): string | null {
    // Extract slug from action if present
    if (action.type === "SET_SLUG") {
      return action.input?.slug || null;
    }
    if (action.type === "CREATE" && action.input?.slug) {
      return action.input.slug;
    }
    return null;
  }
}
