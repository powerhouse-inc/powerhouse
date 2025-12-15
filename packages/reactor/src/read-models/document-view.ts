import type { Operation, PHDocument, PHDocumentHeader } from "document-model";
import type { Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../shared/types.js";
import type {
  IDocumentView,
  IOperationStore,
  OperationWithContext,
  PagedResults,
  PagingOptions,
  ViewFilter,
} from "../storage/interfaces.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./types.js";

type Database = StorageDatabase & DocumentViewDatabase;

export class KyselyDocumentView implements IDocumentView {
  private lastOrdinal: number = 0;

  constructor(
    private db: Kysely<Database>,
    private operationStore: IOperationStore,
    private operationIndex: IOperationIndex,
    private consistencyTracker: IConsistencyTracker,
  ) {}

  async init(): Promise<void> {
    const viewState = await this.db
      .selectFrom("ViewState")
      .selectAll()
      .executeTakeFirst();

    if (viewState) {
      this.lastOrdinal = viewState.lastOrdinal;

      const missedOperations = await this.operationIndex.getSinceOrdinal(
        this.lastOrdinal,
      );

      if (missedOperations.items.length > 0) {
        await this.indexOperations(missedOperations.items);
      }
    } else {
      await this.db
        .insertInto("ViewState")
        .values({
          lastOrdinal: 0,
        })
        .execute();

      const allOperations = await this.operationIndex.getSinceOrdinal(0);
      if (allOperations.items.length > 0) {
        await this.indexOperations(allOperations.items);
      }
    }
  }

  async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    await this.db.transaction().execute(async (trx) => {
      for (const item of items) {
        const { operation, context } = item;
        const { documentId, scope, branch, documentType, resultingState } =
          context;
        const { index, hash } = operation;

        // We never rebuild here
        if (!resultingState) {
          throw new Error(
            `Missing resultingState in context for operation ${operation.id || "unknown"}. ` +
              `IDocumentView requires resultingState from upstream - it does not rebuild documents.`,
          );
        }

        let fullState: Record<string, unknown> = {};
        try {
          fullState = JSON.parse(resultingState) as Record<string, unknown>;
        } catch (error) {
          throw new Error(
            `Failed to parse resultingState for operation ${operation.id || "unknown"}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        const operationType = operation.action.type;
        let scopesToIndex: Array<[string, unknown]>;

        if (operationType === "CREATE_DOCUMENT") {
          scopesToIndex = Object.entries(fullState).filter(
            ([key]) => key === "header" || key === "document" || key === "auth",
          );
        } else if (operationType === "UPGRADE_DOCUMENT") {
          const scopeStatesToIndex: Array<[string, unknown]> = [];

          for (const [scopeName, scopeState] of Object.entries(fullState)) {
            if (scopeName === "header") {
              scopeStatesToIndex.push([scopeName, scopeState]);
              continue;
            }

            if (scopeName === scope) {
              scopeStatesToIndex.push([scopeName, scopeState]);
              continue;
            }

            const existingSnapshot = await trx
              .selectFrom("DocumentSnapshot")
              .select("scope")
              .where("documentId", "=", documentId)
              .where("scope", "=", scopeName)
              .where("branch", "=", branch)
              .executeTakeFirst();

            if (!existingSnapshot) {
              scopeStatesToIndex.push([scopeName, scopeState]);
            }
          }

          scopesToIndex = scopeStatesToIndex;
        } else {
          scopesToIndex = [];

          if (fullState.header !== undefined) {
            scopesToIndex.push(["header", fullState.header]);
          }

          if (fullState[scope] !== undefined) {
            scopesToIndex.push([scope, fullState[scope]]);
          } else {
            scopesToIndex.push([scope, {}]);
          }
        }

        for (const [scopeName, scopeState] of scopesToIndex) {
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

          let slug: string | null = existingSnapshot?.slug ?? null;
          let name: string | null = existingSnapshot?.name ?? null;

          if (scopeName === "header") {
            const headerSlug = newState.slug;
            const headerName = newState.name;

            if (typeof headerSlug === "string") {
              slug = headerSlug;
            }
            if (typeof headerName === "string") {
              name = headerName;
            }

            if (slug && slug !== documentId) {
              await trx
                .insertInto("SlugMapping")
                .values({
                  slug,
                  documentId,
                  scope: scopeName,
                  branch,
                })
                .onConflict((oc) =>
                  oc.column("slug").doUpdateSet({
                    documentId,
                    scope: scopeName,
                    branch,
                  }),
                )
                .execute();
            }
          }

          if (existingSnapshot) {
            await trx
              .updateTable("DocumentSnapshot")
              .set({
                lastOperationIndex: index,
                lastOperationHash: hash,
                lastUpdatedAt: new Date(),
                snapshotVersion: existingSnapshot.snapshotVersion + 1,
                content: newState,
                slug,
                name,
              })
              .where("documentId", "=", documentId)
              .where("scope", "=", scopeName)
              .where("branch", "=", branch)
              .execute();
          } else {
            const snapshot: InsertableDocumentSnapshot = {
              id: uuidv4(),
              documentId,
              slug,
              name,
              scope: scopeName,
              branch,
              content: newState,
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

      const maxOrdinal = Math.max(...items.map((item) => item.context.ordinal));
      this.lastOrdinal = maxOrdinal;
      await trx
        .updateTable("ViewState")
        .set({
          lastOrdinal: maxOrdinal,
          lastOperationTimestamp: new Date(),
        })
        .execute();
    });

    const coordinates: ConsistencyCoordinate[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      coordinates.push({
        documentId: item.context.documentId,
        scope: item.context.scope,
        branch: item.context.branch,
        operationIndex: item.operation.index,
      });
    }
    this.consistencyTracker.update(coordinates);
  }

  async waitForConsistency(
    token: ConsistencyToken,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (token.coordinates.length === 0) {
      return;
    }
    await this.consistencyTracker.waitFor(token.coordinates, timeoutMs, signal);
  }

  async exists(
    documentIds: string[],
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<boolean[]> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (documentIds.length === 0) {
      return [];
    }

    const snapshots = await this.db
      .selectFrom("DocumentSnapshot")
      .select(["documentId"])
      .where("documentId", "in", documentIds)
      .where("isDeleted", "=", false)
      .distinct()
      .execute();

    const existingIds = new Set(snapshots.map((s) => s.documentId));

    return documentIds.map((id) => existingIds.has(id));
  }

  async get<TDocument extends PHDocument>(
    documentId: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const branch = view?.branch || "main";

    // Determine which scopes to retrieve
    let scopesToQuery: string[];
    if (view?.scopes && view.scopes.length > 0) {
      // If scopes has values, always include header + document + specified scopes
      // (header and document are the minimum scopes that must be returned)
      scopesToQuery = [...new Set(["header", "document", ...view.scopes])];
    } else {
      // If scopes is undefined, null, or empty array [], get all scopes (no filter)
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

    // Get the header from JSONB content (already parsed)
    const header = headerSnapshot.content as PHDocumentHeader;

    // Reconstruct cross-scope header metadata (revision, lastModifiedAtUtcIso)
    // by aggregating information from all scopes
    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    header.revision = revisions.revision;
    header.lastModifiedAtUtcIso = revisions.latestTimestamp;

    // Reconstruct the document state from all snapshots
    // Note: exclude "header" scope from state since it's already in the header field
    const state: Record<string, unknown> = {};
    for (const snapshot of snapshots) {
      // Skip header scope - it's stored separately in the header field
      if (snapshot.scope === "header") {
        continue;
      }

      // Content is already an object from JSONB
      state[snapshot.scope] = snapshot.content;
    }

    // Retrieve operations from the operation store to match legacy storage format
    const operations: Record<string, Operation[]> = {};

    // Get all operations for this document across all scopes
    const allOps = await this.operationStore.getSinceId(0, undefined, signal);
    const docOps = allOps.items.filter(
      (op) =>
        op.context.documentId === documentId && op.context.branch === branch,
    );

    // Group operations by scope and normalize to match legacy storage structure
    for (const { operation, context } of docOps) {
      operations[context.scope] ??= [];

      // Normalize operation to match legacy storage format
      // Legacy storage includes redundant top-level fields that duplicate action fields
      const normalizedOp: Operation = {
        action: operation.action,
        index: operation.index,
        timestampUtcMs: operation.timestampUtcMs,
        hash: operation.hash,
        skip: operation.skip,
        // Add top-level fields that mirror action fields (legacy format)
        ...(operation.action as Record<string, unknown>),
        // Legacy storage includes these optional fields
        error: operation.error,
        resultingState: operation.resultingState,
      };

      operations[context.scope].push(normalizedOp);
    }

    // Construct the PHDocument
    const document: PHDocument = {
      header,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      state: state as any,
      operations,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      initialState: state as any,
      clipboard: [],
    };

    return document as TDocument;
  }

  async getByIdOrSlug<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const branch = view?.branch || "main";

    const idCheckPromise = this.db
      .selectFrom("DocumentSnapshot")
      .select("documentId")
      .where("documentId", "=", identifier)
      .where("branch", "=", branch)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    const slugCheckPromise = this.db
      .selectFrom("SlugMapping")
      .select("documentId")
      .where("slug", "=", identifier)
      .where("branch", "=", branch)
      .executeTakeFirst();

    const [idMatch, slugMatch] = await Promise.all([
      idCheckPromise,
      slugCheckPromise,
    ]);

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const idMatchDocId = idMatch?.documentId;
    const slugMatchDocId = slugMatch?.documentId;

    if (idMatchDocId && slugMatchDocId && idMatchDocId !== slugMatchDocId) {
      throw new Error(
        `Ambiguous identifier "${identifier}": matches both document ID "${idMatchDocId}" and slug for document ID "${slugMatchDocId}". ` +
          `Please use get() for ID or resolveSlug() + get() for slug to be explicit.`,
      );
    }

    const resolvedDocumentId = idMatchDocId || slugMatchDocId;

    if (!resolvedDocumentId) {
      throw new Error(`Document not found: ${identifier}`);
    }

    return this.get<TDocument>(resolvedDocumentId, view, undefined, signal);
  }

  async findByType(
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const branch = view?.branch || "main";

    const startIndex = paging?.cursor ? parseInt(paging.cursor) : 0;
    const limit = paging?.limit || 100;

    const documents: PHDocument[] = [];
    const processedDocumentIds = new Set<string>();
    const allDocumentIds: string[] = [];

    const snapshots = await this.db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentType", "=", type)
      .where("branch", "=", branch)
      .where("isDeleted", "=", false)
      .orderBy("lastUpdatedAt", "desc")
      .execute();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    for (const snapshot of snapshots) {
      if (processedDocumentIds.has(snapshot.documentId)) {
        continue;
      }

      processedDocumentIds.add(snapshot.documentId);
      allDocumentIds.push(snapshot.documentId);
    }

    const docsToFetch = allDocumentIds.slice(startIndex, startIndex + limit);

    for (const documentId of docsToFetch) {
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      try {
        const document = await this.get<PHDocument>(
          documentId,
          view,
          undefined,
          signal,
        );
        documents.push(document);
      } catch {
        continue;
      }
    }

    const hasMore = allDocumentIds.length > startIndex + limit;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      items: documents,
      nextCursor,
      hasMore,
    };
  }

  async resolveSlug(
    slug: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const branch = view?.branch || "main";

    const mapping = await this.db
      .selectFrom("SlugMapping")
      .select("documentId")
      .where("slug", "=", slug)
      .where("branch", "=", branch)
      .executeTakeFirst();

    if (!mapping) {
      return undefined;
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (view?.scopes && view.scopes.length > 0) {
      const scopeCheck = await this.db
        .selectFrom("DocumentSnapshot")
        .select("scope")
        .where("documentId", "=", mapping.documentId)
        .where("branch", "=", branch)
        .where("scope", "in", view.scopes)
        .where("isDeleted", "=", false)
        .executeTakeFirst();

      if (!scopeCheck) {
        return undefined;
      }
    }

    return mapping.documentId;
  }
}
