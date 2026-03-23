import type {
  GetDocumentResult,
  GetDocumentWithOperationsResult,
  GetOperationsResult,
  IRemoteClient,
  PropagationMode,
  ReactorGraphQLClient,
  RemoteDocumentData,
  RemoteOperation,
  RemoteOperationResultPage,
} from "./types.js";

/**
 * Thin facade over the GraphQL SDK for remote document operations.
 */
const DEFAULT_PAGE_SIZE = 100;

export class RemoteClient implements IRemoteClient {
  private readonly pageSize: number;

  constructor(
    private readonly client: ReactorGraphQLClient,
    pageSize?: number,
  ) {
    this.pageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  }

  /** Fetch a document by identifier. Returns null if not found. */
  async getDocument(
    identifier: string,
    branch?: string,
  ): Promise<GetDocumentResult | null> {
    const result = await this.client.GetDocument({
      identifier,
      view: branch ? { branch } : undefined,
    });
    return result.document ?? null;
  }

  /**
   * Fetch a document and its operations.
   *
   * When scopes are provided and BatchGetDocumentWithOperations is available,
   * fetches the document and per-scope operations in a single HTTP request.
   * Otherwise falls back to GetDocumentWithOperations for the first page,
   * then paginates remaining operations per scope.
   */
  async getDocumentWithOperations(
    identifier: string,
    branch?: string,
    sinceRevision?: Record<string, number>,
    scopes?: string[],
  ): Promise<GetDocumentWithOperationsResult | null> {
    // Fast path: batch document + per-scope operations in one request
    if (
      this.client.BatchGetDocumentWithOperations &&
      scopes &&
      scopes.length > 0
    ) {
      return this.batchGetDocumentWithOperations(
        identifier,
        branch,
        sinceRevision,
        scopes,
      );
    }

    // Standard path: GetDocumentWithOperations + paginate if needed
    const result = await this.client.GetDocumentWithOperations({
      identifier,
      view: branch ? { branch } : undefined,
      operationsPaging: {
        limit: this.pageSize,
        cursor: null,
      },
    });

    if (!result.document) return null;

    const doc = result.document.document;
    const opsPage = doc.operations;
    const operationsByScope: Record<string, RemoteOperation[]> = {};

    if (opsPage) {
      for (const op of opsPage.items) {
        (operationsByScope[op.action.scope] ??= []).push(op);
      }
    }

    // Check if we have all expected operations by comparing against revisionsList
    const expectedTotal = doc.revisionsList.reduce(
      (sum, r) => sum + r.revision,
      0,
    );
    const fetchedTotal = opsPage?.items.length ?? 0;

    if (fetchedTotal >= expectedTotal) {
      return {
        document: doc,
        childIds: result.document.childIds,
        operations: { operationsByScope },
      };
    }

    // Missing operations — fetch all per scope
    const allScopes = doc.revisionsList.map((r) => r.scope);
    const allOps = await this.getAllOperations(
      doc.id,
      branch,
      sinceRevision,
      allScopes,
    );

    return {
      document: doc,
      childIds: result.document.childIds,
      operations: allOps,
    };
  }

  /**
   * Fetch document + per-scope operations in a single HTTP request
   * via BatchGetDocumentWithOperations, then paginate any remaining pages.
   */
  private async batchGetDocumentWithOperations(
    identifier: string,
    branch: string | undefined,
    sinceRevision: Record<string, number> | undefined,
    scopes: string[],
  ): Promise<GetDocumentWithOperationsResult | null> {
    const view = branch ? { branch } : undefined;
    const filters = scopes.map((scope) => ({
      documentId: identifier,
      branch: branch ?? null,
      sinceRevision: sinceRevision?.[scope] ?? 0,
      scopes: [scope],
    }));
    const pagings = scopes.map(() => ({
      limit: this.pageSize,
      cursor: null as string | null,
    }));

    const result = await this.client.BatchGetDocumentWithOperations!(
      identifier,
      view,
      filters,
      pagings,
    );

    if (!result.document) return null;

    const operationsByScope: Record<string, RemoteOperation[]> = {};
    let pending: {
      scope: string;
      filter: (typeof filters)[0];
      cursor: string;
    }[] = [];

    for (let i = 0; i < scopes.length; i++) {
      const page = result.operations[i];
      for (const op of page.items) {
        (operationsByScope[op.action.scope] ??= []).push(op);
      }
      if (page.hasNextPage && page.cursor) {
        pending.push({
          scope: scopes[i],
          filter: filters[i],
          cursor: page.cursor,
        });
      }
    }

    // Continue pagination for scopes with more pages
    while (pending.length > 0) {
      const pages = await this.fetchOperationPages(
        pending.map((p) => p.filter),
        pending.map((p) => ({ limit: this.pageSize, cursor: p.cursor })),
      );

      const nextPending: typeof pending = [];
      for (let i = 0; i < pending.length; i++) {
        const page = pages[i];
        for (const op of page.items) {
          (operationsByScope[op.action.scope] ??= []).push(op);
        }
        if (page.hasNextPage && page.cursor) {
          nextPending.push({ ...pending[i], cursor: page.cursor });
        }
      }
      pending = nextPending;
    }

    return {
      document: result.document.document,
      childIds: result.document.childIds,
      operations: { operationsByScope },
    };
  }

  /**
   * Fetch all operations for a document, paginating through all pages.
   * Each scope is queried individually because the API only returns
   * pagination cursors for single-scope queries.
   */
  async getAllOperations(
    documentId: string,
    branch?: string,
    sinceRevision?: Record<string, number>,
    scopes?: string[],
  ): Promise<GetOperationsResult> {
    // When scopes are specified, query each scope in parallel.
    // Uses a single composed request per pagination round when available.
    if (scopes && scopes.length > 0) {
      const operationsByScope: Record<string, RemoteOperation[]> = {};

      // Tracks scopes still being paginated, each with its own filter and cursor
      let pending = scopes.map((scope) => ({
        scope,
        filter: {
          documentId,
          branch: branch ?? null,
          sinceRevision: sinceRevision?.[scope] ?? 0,
          scopes: [scope],
        },
        cursor: null as string | null,
      }));

      while (pending.length > 0) {
        const pages = await this.fetchOperationPages(
          pending.map((p) => p.filter),
          pending.map((p) => ({ limit: this.pageSize, cursor: p.cursor })),
        );

        const nextPending: typeof pending = [];

        for (let i = 0; i < pending.length; i++) {
          const page = pages[i];
          for (const op of page.items) {
            (operationsByScope[op.action.scope] ??= []).push(op);
          }
          if (page.hasNextPage && page.cursor) {
            nextPending.push({ ...pending[i], cursor: page.cursor });
          }
        }

        pending = nextPending;
      }

      return { operationsByScope };
    }

    // No scopes specified — single query for all scopes (no per-scope sinceRevision)
    return this.fetchOperationsForScope(documentId, branch);
  }

  /**
   * Fetch one page of operations per filter.
   * Uses the composed query (single HTTP request) when available,
   * otherwise falls back to parallel individual requests.
   */
  private async fetchOperationPages(
    filters: Parameters<
      ReactorGraphQLClient["GetDocumentOperations"]
    >[0]["filter"][],
    pagings: Parameters<
      ReactorGraphQLClient["GetDocumentOperations"]
    >[0]["paging"][],
  ): Promise<RemoteOperationResultPage[]> {
    if (this.client.BatchGetDocumentOperations) {
      return this.client.BatchGetDocumentOperations(filters, pagings);
    }

    return Promise.all(
      filters.map((filter, i) =>
        this.client
          .GetDocumentOperations({ filter, paging: pagings[i] })
          .then((r) => r.documentOperations),
      ),
    );
  }

  /** Fetch all pages of operations for a single scope (or all scopes if none specified). */
  private async fetchOperationsForScope(
    documentId: string,
    branch?: string,
    sinceRevision?: number,
    scope?: string,
  ): Promise<GetOperationsResult> {
    const operationsByScope: Record<string, RemoteOperation[]> = {};
    let cursor: string | null | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await this.client.GetDocumentOperations({
        filter: {
          documentId,
          branch: branch ?? null,
          sinceRevision: sinceRevision ?? 0,
          scopes: scope ? [scope] : null,
        },
        paging: {
          limit: this.pageSize,
          cursor: cursor ?? null,
        },
      });

      const page = result.documentOperations;

      for (const op of page.items) {
        const s = op.action.scope;
        (operationsByScope[s] ??= []).push(op);
      }

      hasNextPage = page.hasNextPage;
      cursor = page.cursor;
    }

    return { operationsByScope };
  }

  /** Push actions to an existing document via MutateDocument. */
  async pushActions(
    documentIdentifier: string,
    actions: ReadonlyArray<NonNullable<unknown>>,
    branch?: string,
  ): Promise<RemoteDocumentData> {
    const result = await this.client.MutateDocument({
      documentIdentifier,
      actions,
      view: branch ? { branch } : undefined,
    });
    return result.mutateDocument;
  }

  /** Create a new document on the remote. */
  async createDocument(
    document: NonNullable<unknown>,
    parentIdentifier?: string,
  ): Promise<RemoteDocumentData> {
    const result = await this.client.CreateDocument({
      document,
      parentIdentifier: parentIdentifier ?? null,
    });
    return result.createDocument;
  }

  /** Create an empty document of a given type on the remote. */
  async createEmptyDocument(
    documentType: string,
    parentIdentifier?: string,
  ): Promise<RemoteDocumentData> {
    const result = await this.client.CreateEmptyDocument({
      documentType,
      parentIdentifier: parentIdentifier ?? null,
    });
    return result.createEmptyDocument;
  }

  /** Delete a document on the remote. Returns true if successful. */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
  ): Promise<boolean> {
    const result = await this.client.DeleteDocument({
      identifier,
      propagate,
    });
    return result.deleteDocument;
  }
}
