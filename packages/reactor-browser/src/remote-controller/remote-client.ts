import type {
  GetDocumentResult,
  GetDocumentWithOperationsResult,
  GetOperationsResult,
  IRemoteClient,
  PropagationMode,
  ReactorGraphQLClient,
  RemoteDocumentData,
  RemoteOperation,
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
   * Fetch a document and its first page of operations in a single query.
   * Returns null if the document is not found.
   */
  async getDocumentWithOperations(
    identifier: string,
    branch?: string,
    operationsCursor?: string,
  ): Promise<GetDocumentWithOperationsResult | null> {
    const result = await this.client.GetDocumentWithOperations({
      identifier,
      view: branch ? { branch } : undefined,
      operationsPaging: {
        limit: this.pageSize,
        cursor: operationsCursor ?? null,
      },
    });

    if (!result.document) return null;

    const doc = result.document.document;
    const opsPage = doc.operations;
    const operationsByScope: Record<string, RemoteOperation[]> = {};

    if (opsPage) {
      for (const op of opsPage.items) {
        const scope = op.action.scope;
        (operationsByScope[scope] ??= []).push(op);
      }
    }

    return {
      document: doc,
      childIds: result.document.childIds,
      operations: {
        operationsByScope,
        cursor: opsPage?.cursor ?? undefined,
      },
      hasMoreOperations: opsPage?.hasNextPage ?? false,
    };
  }

  /**
   * Fetch all operations for a document, paginating through all pages.
   * Returns operations grouped by scope and the final cursor for incremental fetches.
   *
   * @param startCursor - If provided, resume fetching from this cursor position
   *   (for incremental pulls after the initial fetch).
   */
  async getAllOperations(
    documentId: string,
    branch?: string,
    sinceRevision?: number,
    scopes?: string[],
    startCursor?: string,
  ): Promise<GetOperationsResult> {
    const operationsByScope: Record<string, RemoteOperation[]> = {};
    let cursor: string | null | undefined = startCursor ?? undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await this.client.GetDocumentOperations({
        filter: {
          documentId,
          branch: branch ?? null,
          sinceRevision: sinceRevision ?? 0,
          scopes: scopes ?? null,
        },
        paging: {
          limit: this.pageSize,
          cursor: cursor ?? null,
        },
      });

      const page = result.documentOperations;

      for (const op of page.items) {
        const scope = op.action.scope;
        (operationsByScope[scope] ??= []).push(op);
      }

      hasNextPage = page.hasNextPage;
      cursor = page.cursor;
    }

    return {
      operationsByScope,
      cursor: cursor ?? undefined,
    };
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
