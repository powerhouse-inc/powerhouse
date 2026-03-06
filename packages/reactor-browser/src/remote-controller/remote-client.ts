import type {
  GetDocumentResult,
  IRemoteClient,
  PropagationMode,
  ReactorGraphQLClient,
  RemoteDocumentData,
  RemoteOperation,
} from "./types.js";

/**
 * Thin facade over the GraphQL SDK for remote document operations.
 */
export class RemoteClient implements IRemoteClient {
  constructor(private readonly client: ReactorGraphQLClient) {}

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
   * Fetch all operations for a document, paginating through all pages.
   * Returns operations grouped by scope.
   */
  async getAllOperations(
    documentId: string,
    branch?: string,
    sinceRevision?: number,
    scopes?: string[],
  ): Promise<Record<string, RemoteOperation[]>> {
    const operationsByScope: Record<string, RemoteOperation[]> = {};
    let cursor: string | null | undefined = undefined;
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
          limit: 100,
          cursor: cursor ?? null,
        },
      });

      const page = result.documentOperations;

      for (const op of page.items) {
        const scope = op.action.scope;
        if (!operationsByScope[scope]) {
          operationsByScope[scope] = [];
        }
        operationsByScope[scope].push(op);
      }

      hasNextPage = page.hasNextPage;
      cursor = page.cursor;
    }

    return operationsByScope;
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
