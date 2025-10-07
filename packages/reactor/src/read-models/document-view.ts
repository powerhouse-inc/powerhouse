import type {
  CreateDocumentAction,
  PHDocumentHeader,
  UpgradeDocumentAction,
} from "document-model";
import { createPresignedHeader } from "document-model/core";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type {
  DocumentSnapshot,
  IDocumentView,
  IOperationStore,
  OperationWithContext,
} from "../storage/interfaces.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./types.js";

// Combine both database schemas
type Database = StorageDatabase & DocumentViewDatabase;

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

  async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    await this.db.transaction().execute(async (trx) => {
      for (const item of items) {
        const { operation, context } = item;
        const { documentId, scope, branch, documentType } = context;
        const { index, hash, action } = operation;

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
              lastOperationHash: hash,
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
            documentType,
            lastOperationIndex: index,
            lastOperationHash: hash,
            identifiers: null,
            metadata: null,
            deletedAt: null,
          };

          await trx.insertInto("DocumentSnapshot").values(snapshot).execute();
        }
      }
    });
  }

  async getHeader(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<PHDocumentHeader> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // Query operations from header and document scopes only
    // - "header" scope: CREATE_DOCUMENT actions contain initial header metadata
    // - "document" scope: UPGRADE_DOCUMENT actions contain version transitions
    const headerAndDocOps = await this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("branch", "=", branch)
      .where("scope", "in", ["header", "document"])
      .orderBy("timestampUtcMs", "asc") // Process in chronological order
      .execute();

    if (headerAndDocOps.length === 0) {
      throw new Error(`Document header not found: ${documentId}`);
    }

    // Reconstruct header from header and document scope operations
    let header = createPresignedHeader();

    for (const op of headerAndDocOps) {
      const action = JSON.parse(op.action) as
        | { type: "CREATE_DOCUMENT"; input: CreateDocumentAction }
        | { type: "UPGRADE_DOCUMENT"; input: UpgradeDocumentAction }
        | { type: string; input: unknown };

      if (action.type === "CREATE_DOCUMENT") {
        const input = action.input as CreateDocumentAction;
        // Extract header from CREATE_DOCUMENT action's signing parameters
        if (input.signing) {
          header = {
            ...header,
            id: input.signing.signature, // documentId === signing.signature
            documentType: input.signing.documentType,
            createdAtUtcIso: input.signing.createdAtUtcIso,
            lastModifiedAtUtcIso: input.signing.createdAtUtcIso,
            sig: {
              nonce: input.signing.nonce,
              publicKey: input.signing.publicKey,
            },
          };
        }
      } else if (action.type === "UPGRADE_DOCUMENT") {
        // UPGRADE_DOCUMENT tracks version changes in the document scope
        // Version information would be in the operation's resulting state
        // For now, this is handled elsewhere in the document state
      }
    }

    // Get revision map and latest timestamp from all scopes efficiently
    const { revision, latestTimestamp } =
      await this.operationStore.getRevisions(documentId, branch, signal);

    // Update header with cross-scope revision and timestamp information
    header.revision = revision;
    header.lastModifiedAtUtcIso = latestTimestamp;

    return header;
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
}
