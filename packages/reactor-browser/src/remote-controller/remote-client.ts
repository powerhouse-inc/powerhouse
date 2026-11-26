import type {
  GetDocumentResult,
  GetDocumentWithOperationsResult,
  GetOperationsResult,
  IRemoteClient,
  PropagationMode,
  RemoteControllerGraphQLClient,
  RemoteDocumentData,
  RemoteOperation,
  RemoteOperationResultPage,
} from "./types.js";
import type { ActionInput } from "../graphql/gen/schema.js";
import { addFile } from "@powerhousedao/shared/document-drive";
import {
  actionSigningTarget,
  createVersionsOf,
  creationActions,
  toTransportAction,
  type ISigner,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { phDocumentFromGetDocument } from "../graphql-client/adapter.js";
import { readCreateProtocolVersions } from "../graphql-client/create-defaults.js";
import {
  prepareSignedActions,
  signStampedAction,
} from "../graphql-client/signing.js";
import {
  addRelationshipAction,
  deleteDocumentAction,
} from "../graphql-client/system-actions.js";

/**
 * Thin facade over the GraphQL SDK for remote document operations.
 */
const DEFAULT_PAGE_SIZE = 100;

const DOCUMENT_DRIVE_TYPE = "powerhouse/document-drive";
const REACTOR_DRIVE_TYPE = "powerhouse/reactor-drive";
const DRIVE_CHILD_TYPE = "drive/child";

export class RemoteClient implements IRemoteClient {
  private readonly pageSize: number;

  /** With `signer`, the creates and deletes it sends are signed here. */
  constructor(
    private readonly client: RemoteControllerGraphQLClient,
    pageSize?: number,
    private readonly signer?: ISigner,
  ) {
    this.pageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  }

  /** Fetch a document by identifier. Returns null if not found. */
  async getDocument(
    identifier: string,
    branch?: string,
  ): Promise<GetDocumentResult | null> {
    const result = await this.client.GetDocument({
      idOrSlug: identifier,
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
      idOrSlug: identifier,
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
      documentIdOrSlug: identifier,
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
          documentIdOrSlug: documentId,
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
      RemoteControllerGraphQLClient["GetDocumentOperations"]
    >[0]["filter"][],
    pagings: Parameters<
      RemoteControllerGraphQLClient["GetDocumentOperations"]
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
          documentIdOrSlug: documentId,
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

  /**
   * Push actions to an existing document via MutateDocument.
   *
   * Takes the wire shape rather than an in-process `Action`: a signature is a
   * tuple in one and a string in the other, so the caller projects before it
   * gets here.
   */
  async pushActions(
    documentIdentifier: string,
    actions: ReadonlyArray<ActionInput>,
    branch?: string,
  ): Promise<RemoteDocumentData> {
    const result = await this.client.MutateDocument({
      documentIdOrSlug: documentIdentifier,
      actions,
      branch,
    });
    return result.mutateDocument;
  }

  /**
   * Create a new document on the remote. With a signer every action of the
   * creation is signed here, as the GraphQL client's `create` signs it: the
   * create with its parent's relationship in one job and, under a document
   * drive, the drive's ADD_FILE once the create landed. Without one the
   * remote is asked to build the creation, which a remote that signs no
   * writes for its callers refuses.
   */
  async createDocument(
    document: NonNullable<unknown>,
    parentIdentifier?: string,
  ): Promise<RemoteDocumentData> {
    if (this.signer) {
      return this.createSigned(
        document as PHDocument,
        parentIdentifier,
        this.signer,
      );
    }
    const result = await this.client.CreateDocument({
      document,
      parentIdOrSlug: parentIdentifier ?? null,
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
      parentIdOrSlug: parentIdentifier ?? null,
    });
    return result.createEmptyDocument;
  }

  /**
   * Delete a document on the remote. Returns true if successful. With a
   * signer the delete is signed here (`signedDelete`) and the remote
   * completes it as its own work; without one the remote is asked to build
   * it.
   */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
  ): Promise<boolean> {
    if (this.signer) {
      return this.deleteSigned(identifier, propagate, this.signer);
    }
    const result = await this.client.DeleteDocument({
      idOrSlug: identifier,
      propagate,
    });
    return result.deleteDocument;
  }

  private async createSigned(
    document: PHDocument,
    parentIdentifier: string | undefined,
    signer: ISigner,
  ): Promise<RemoteDocumentData> {
    const executeBatch = this.client.ExecuteBatch;
    if (!executeBatch) {
      throw new Error(
        "Cannot create a signed document: this GraphQL client has no ExecuteBatch",
      );
    }
    const documentId = document.header.id;
    const branch = document.header.branch || "main";
    const parent =
      parentIdentifier === undefined
        ? undefined
        : await this.getDocument(parentIdentifier);
    if (parentIdentifier !== undefined && !parent) {
      throw new Error(
        `Cannot create under "${parentIdentifier}": no document with that identifier on the remote`,
      );
    }
    const parentId = parent?.document.id;
    const parentType = parent?.document.documentType;
    const protocolVersions = await createVersionsOf(
      document,
      (options) => readCreateProtocolVersions(this.client, options, []),
      parentId,
    );
    const link =
      parentId === undefined
        ? []
        : parentType === REACTOR_DRIVE_TYPE
          ? [
              addRelationshipAction(parentId, documentId, DRIVE_CHILD_TYPE, {
                kind: "file",
                parentFolderId: null,
                documentType: document.header.documentType,
              }),
            ]
          : [addRelationshipAction(parentId, documentId, "child")];
    const actions = await Promise.all(
      [...creationActions(document, protocolVersions), ...link].map((action) =>
        signStampedAction(
          action,
          signer,
          actionSigningTarget(action, documentId, branch),
        ),
      ),
    );
    const result = await executeBatch({
      jobs: [
        {
          key: "create",
          documentIdOrSlug: documentId,
          scope: "document",
          branch,
          actions: actions.map(toTransportAction),
          dependsOn: [],
        },
      ],
    });
    const job = result.executeBatch.jobs.find(
      (entry) => entry.key === "create",
    )?.job;
    if (!job || job.status === "FAILED") {
      throw new Error(
        `The remote did not create ${documentId}: ${job?.error ?? "no job came back"}`,
      );
    }
    if (parent && parentType === DOCUMENT_DRIVE_TYPE) {
      await this.fileInDrive(parent.document, document, signer);
    }
    const created = await this.getDocument(documentId, branch);
    if (!created) {
      throw new Error(`The remote does not serve ${documentId} it created`);
    }
    return created.document;
  }

  /** The drive's ADD_FILE of `document`, signed for the drive's log. */
  private async fileInDrive(
    drive: RemoteDocumentData,
    document: PHDocument,
    signer: ISigner,
  ): Promise<void> {
    const [action] = await prepareSignedActions(
      [
        addFile({
          id: document.header.id,
          name: document.header.name || document.header.id,
          documentType: document.header.documentType,
        }),
      ],
      phDocumentFromGetDocument(drive),
      signer,
    );
    await this.client.MutateDocument({
      documentIdOrSlug: drive.id,
      actions: [toTransportAction(action)],
    });
  }

  private async deleteSigned(
    identifier: string,
    propagate: PropagationMode | undefined,
    signer: ISigner,
  ): Promise<boolean> {
    const deleteSigned = this.client.DeleteDocumentSigned;
    if (!deleteSigned) {
      throw new Error(
        "Cannot delete as the signer: this GraphQL client has no DeleteDocumentSigned",
      );
    }
    const found = await this.getDocument(identifier);
    if (!found) {
      throw new Error(
        `Cannot delete "${identifier}": no document with that identifier on the remote`,
      );
    }
    const documentId = found.document.id;
    const action = deleteDocumentAction(documentId);
    const signed = await signStampedAction(
      action,
      signer,
      actionSigningTarget(action, documentId, "main"),
    );
    const result = await deleteSigned({
      idOrSlug: documentId,
      propagate,
      signedDelete: toTransportAction(signed),
    });
    return result.deleteDocument;
  }
}
