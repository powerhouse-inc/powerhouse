import type { PHDocument, PHDocumentHeader } from "document-model";
import type { Kysely, Transaction } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type {
  ConsistencyToken,
  PagedResults,
  PagingOptions,
} from "../shared/types.js";
import type {
  IDocumentView,
  IOperationStore,
  OperationWithContext,
  ViewFilter,
} from "../storage/interfaces.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import { BaseReadModel } from "./base-read-model.js";
import type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./types.js";

type Database = StorageDatabase & DocumentViewDatabase;

export class KyselyDocumentView extends BaseReadModel implements IDocumentView {
  private _db: Kysely<Database>;

  constructor(
    db: Kysely<Database>,
    private operationStore: IOperationStore,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
  ) {
    super(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      writeCache,
      consistencyTracker,
      "document-view",
    );
    this._db = db;
  }

  override async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    await this._db.transaction().execute(async (trx) => {
      for (const item of items) {
        const { operation, context } = item;
        const { documentId, scope, branch, documentType, resultingState } =
          context;
        const { index, hash } = operation;

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

      await this.saveState(
        trx as unknown as Transaction<DocumentViewDatabase>,
        items,
      );
    });

    this.updateConsistencyTracker(items);
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

    const snapshots = await this._db
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

    let scopesToQuery: string[];
    if (view?.scopes && view.scopes.length > 0) {
      scopesToQuery = [...new Set(["header", "document", ...view.scopes])];
    } else {
      scopesToQuery = [];
    }

    let query = this._db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("branch", "=", branch)
      .where("isDeleted", "=", false);

    if (scopesToQuery.length > 0) {
      query = query.where("scope", "in", scopesToQuery);
    }

    const snapshots = await query.execute();

    if (snapshots.length === 0) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const headerSnapshot = snapshots.find((s) => s.scope === "header");
    if (!headerSnapshot) {
      throw new Error(`Document header not found: ${documentId}`);
    }

    const header = headerSnapshot.content as PHDocumentHeader;

    const revisions = await this.operationStore.getRevisions(
      documentId,
      branch,
      signal,
    );
    header.revision = revisions.revision;
    header.lastModifiedAtUtcIso = revisions.latestTimestamp;

    const state: Record<string, unknown> = {};
    for (const snapshot of snapshots) {
      if (snapshot.scope === "header") {
        continue;
      }

      state[snapshot.scope] = snapshot.content;
    }

    const document: PHDocument = {
      header,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      state: state as any,
      operations: {},
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
    const documentId = await this.resolveIdOrSlug(
      identifier,
      view,
      consistencyToken,
      signal,
    );
    return this.get<TDocument>(documentId, view, undefined, signal);
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

    const snapshots = await this._db
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
      results: documents,
      options: paging || { cursor: "0", limit: 100 },
      nextCursor,
      next: hasMore
        ? () =>
            this.findByType(
              type,
              view,
              { cursor: nextCursor!, limit },
              consistencyToken,
              signal,
            )
        : undefined,
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

    const mapping = await this._db
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
      const scopeCheck = await this._db
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

  async resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string> {
    if (consistencyToken) {
      await this.waitForConsistency(consistencyToken, undefined, signal);
    }

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const branch = view?.branch || "main";

    const idCheckPromise = this._db
      .selectFrom("DocumentSnapshot")
      .select("documentId")
      .where("documentId", "=", identifier)
      .where("branch", "=", branch)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    const slugCheckPromise = this._db
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

    return resolvedDocumentId;
  }
}
