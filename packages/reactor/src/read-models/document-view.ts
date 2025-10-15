import type { PHDocument, PHDocumentHeader } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type {
  IDocumentView,
  IOperationStore,
  OperationWithContext,
  ViewFilter,
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
        const { index, hash } = operation;

        // Parse the full resulting state if present
        let fullState: Record<string, unknown> = {};
        if (operation.resultingState) {
          try {
            fullState = JSON.parse(operation.resultingState) as Record<
              string,
              unknown
            >;
          } catch (error) {
            console.warn(
              `Failed to parse resultingState for operation ${index} on document ${documentId}:`,
              error,
            );
          }
        }

        // If resultingState is present, create/update snapshots for ALL scopes in the state
        // Otherwise, fall back to creating/updating a snapshot for just the operation's scope
        const scopesToIndex: Array<[string, unknown]> =
          Object.keys(fullState).length > 0
            ? Object.entries(fullState)
            : [[scope, {}]];

        for (const [scopeName, scopeState] of scopesToIndex) {
          // Check if we need to create or update a snapshot for this scope
          const existingSnapshot = await trx
            .selectFrom("DocumentSnapshot")
            .selectAll()
            .where("documentId", "=", documentId)
            .where("scope", "=", scopeName)
            .where("branch", "=", branch)
            .executeTakeFirst();

          const newState =
            typeof scopeState === "object" && scopeState !== null
              ? (scopeState as Record<string, unknown>)
              : {};

          if (existingSnapshot) {
            // Update existing snapshot with new state
            await trx
              .updateTable("DocumentSnapshot")
              .set({
                lastOperationIndex: index,
                lastOperationHash: hash,
                lastUpdatedAt: new Date(),
                snapshotVersion: existingSnapshot.snapshotVersion + 1,
                content: JSON.stringify(newState),
              })
              .where("documentId", "=", documentId)
              .where("scope", "=", scopeName)
              .where("branch", "=", branch)
              .execute();
          } else {
            // Create new snapshot with computed state
            const snapshot: InsertableDocumentSnapshot = {
              id: uuidv4(),
              documentId,
              slug: null,
              name: null,
              scope: scopeName,
              branch,
              content: JSON.stringify(newState),
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

    // Query the header scope snapshot for basic header info
    const headerSnapshot = await this.db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("branch", "=", branch)
      .where("scope", "=", "header")
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    if (!headerSnapshot) {
      throw new Error(`Document header not found: ${documentId}`);
    }

    // Parse the basic header from snapshot
    let header: PHDocumentHeader;
    try {
      header = JSON.parse(headerSnapshot.content) as PHDocumentHeader;
    } catch (error) {
      throw new Error(
        `Failed to parse header for document ${documentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Augment with cross-scope revision and timestamp information from operation store
    // These fields span all scopes and need to be computed dynamically
    const { revision, latestTimestamp } =
      await this.operationStore.getRevisions(documentId, branch, signal);

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

  async get<TDocument extends PHDocument>(
    documentId: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const branch = view?.branch || "main";

    // Determine which scopes to retrieve
    // Always include header and document scopes
    let scopesToQuery: string[];
    if (view?.scopes && view.scopes.length > 0) {
      // If specific scopes are requested, include them along with header and document
      scopesToQuery = [...new Set(["header", "document", ...view.scopes])];
    } else {
      // If no specific scopes are requested, get all scopes for this document
      // Don't apply scope filter
      scopesToQuery = [];
    }

    // Build query to get snapshots
    let query = this.db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("branch", "=", branch)
      .where("isDeleted", "=", false);

    // Apply scope filter if we have specific scopes to query
    if (scopesToQuery.length > 0) {
      query = query.where("scope", "in", scopesToQuery);
    }

    // Execute the query
    const snapshots = await query.execute();

    if (snapshots.length === 0) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // Find the header snapshot
    const headerSnapshot = snapshots.find((s) => s.scope === "header");
    if (!headerSnapshot) {
      throw new Error(`Document header not found: ${documentId}`);
    }

    // Parse the header
    let header: PHDocumentHeader;
    try {
      header = JSON.parse(headerSnapshot.content) as PHDocumentHeader;
    } catch (error) {
      throw new Error(
        `Failed to parse header for document ${documentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Reconstruct the document state from all snapshots
    const state: Record<string, unknown> = {};
    for (const snapshot of snapshots) {
      try {
        const scopeState = JSON.parse(snapshot.content) as unknown;
        state[snapshot.scope] = scopeState;
      } catch (error) {
        console.warn(
          `Failed to parse snapshot content for document ${documentId} scope ${snapshot.scope}:`,
          error,
        );
        state[snapshot.scope] = {};
      }
    }

    // Construct the PHDocument
    const document: PHDocument = {
      header,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      state: state as any,
      operations: {},
      // to be removed...
      initialState: defaultBaseState(),
      clipboard: [],
    };

    return document as TDocument;
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
}
