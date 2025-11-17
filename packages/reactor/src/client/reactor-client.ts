import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { actions } from "document-model";

import type { IReactor } from "../core/types.js";
import { type IJobAwaiter } from "../shared/awaiter.js";
import {
  RelationshipChangeType,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type SearchFilter,
  type ViewFilter,
} from "../shared/types.js";
import type { ISigner } from "../signer/types.js";
import type { IDocumentIndexer } from "../storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import {
  DocumentChangeType,
  type DocumentChangeEvent,
  type IReactorClient,
} from "./types.js";

/**
 * ReactorClient implementation that wraps lower-level APIs to provide
 * a simpler interface for document operations.
 *
 * Features:
 * - Wraps Jobs with Promises for easier async handling
 * - Manages signing of submitted Action objects
 * - Provides quality-of-life functions for common tasks
 * - Wraps subscription interface with ViewFilters
 */
export class ReactorClient implements IReactorClient {
  private reactor: IReactor;
  private signer: ISigner;
  private subscriptionManager: IReactorSubscriptionManager;
  private jobAwaiter: IJobAwaiter;
  private documentIndexer: IDocumentIndexer;

  constructor(
    reactor: IReactor,
    signer: ISigner,
    subscriptionManager: IReactorSubscriptionManager,
    jobAwaiter: IJobAwaiter,
    documentIndexer: IDocumentIndexer,
  ) {
    this.reactor = reactor;
    this.signer = signer;
    this.subscriptionManager = subscriptionManager;
    this.jobAwaiter = jobAwaiter;
    this.documentIndexer = documentIndexer;
  }

  /**
   * Retrieves a list of document model modules.
   */
  async getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    return this.reactor.getDocumentModels(namespace, paging, signal);
  }

  /**
   * Retrieves a specific PHDocument
   */
  async get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }> {
    // First try to get by ID
    try {
      return await this.reactor.get<TDocument>(
        identifier,
        view,
        undefined,
        signal,
      );
    } catch (error) {
      // If failed, try to get by slug
      return await this.reactor.getBySlug<TDocument>(
        identifier,
        view,
        undefined,
        signal,
      );
    }
  }

  /**
   * Retrieves children of a document
   */
  async getChildren(
    parentIdentifier: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    let parentId: string;

    try {
      const parentDoc = await this.reactor.get(
        parentIdentifier,
        view,
        undefined,
        signal,
      );
      parentId = parentDoc.document.header.id;
    } catch {
      const parentDoc = await this.reactor.getBySlug(
        parentIdentifier,
        view,
        undefined,
        signal,
      );
      parentId = parentDoc.document.header.id;
    }

    const relationships = await this.documentIndexer.getOutgoing(
      parentId,
      undefined,
      undefined,
      signal,
    );

    const childIds = relationships.map((rel) => rel.targetId);

    if (childIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.reactor.find(
      { ids: childIds },
      view,
      paging,
      undefined,
      signal,
    );
  }

  /**
   * Retrieves parents of a document
   */
  async getParents(
    childIdentifier: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    let childId: string;

    try {
      const childDoc = await this.reactor.get(
        childIdentifier,
        view,
        undefined,
        signal,
      );
      childId = childDoc.document.header.id;
    } catch {
      const childDoc = await this.reactor.getBySlug(
        childIdentifier,
        view,
        undefined,
        signal,
      );
      childId = childDoc.document.header.id;
    }

    const relationships = await this.documentIndexer.getIncoming(
      childId,
      undefined,
      undefined,
      signal,
    );

    const parentIds = relationships.map((rel) => rel.sourceId);

    if (parentIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.reactor.find(
      { ids: parentIds },
      view,
      paging,
      undefined,
      signal,
    );
  }

  /**
   * Filters documents by criteria and returns a list of them
   */
  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.reactor.find(search, view, paging, undefined, signal);
  }

  /**
   * Creates a document and waits for completion
   */
  async create(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const jobInfo = await this.reactor.create(document, signal);

    const completedJob = await this.waitForJob(jobInfo, signal);

    const documentId = document.header.id;

    const result = await this.reactor.get<PHDocument>(
      documentId,
      undefined,
      completedJob.consistencyToken,
      signal,
    );

    if (parentIdentifier) {
      await this.addChildren(parentIdentifier, [documentId], undefined, signal);
    }

    return result.document;
  }

  /**
   * Creates an empty document and waits for completion
   */
  async createEmpty<TDocument extends PHDocument>(
    documentType: string,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const modulesResult = await this.reactor.getDocumentModels(
      undefined,
      undefined,
      signal,
    );

    const module = modulesResult.results.find(
      (m) => m.documentModel.global.id === documentType,
    );

    if (!module) {
      throw new Error(`Document model not found for type: ${documentType}`);
    }

    const document = module.utils.createDocument();

    return this.create(
      document,
      parentIdentifier,
      signal,
    ) as Promise<TDocument>;
  }

  /**
   * Applies a list of actions to a document and waits for completion
   */
  async mutate<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const jobInfo = await this.reactor.mutate(
      documentIdentifier,
      branch,
      actions,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    const view: ViewFilter = { branch };
    try {
      const result = await this.reactor.get<TDocument>(
        documentIdentifier,
        view,
        completedJob.consistencyToken,
        signal,
      );
      return result.document;
    } catch {
      const result = await this.reactor.getBySlug<TDocument>(
        documentIdentifier,
        view,
        completedJob.consistencyToken,
        signal,
      );
      return result.document;
    }
  }

  /**
   * Submits a list of actions to a document
   */
  async mutateAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    // Sign actions with the required signer
    const signedActions = await Promise.all(
      actions.map(async (action) => {
        const signature = await this.signer.sign(action, signal);
        return {
          ...action,
          context: {
            ...action.context,
            signer: {
              user: {
                address: signature[0],
                networkId: "",
                chainId: 0,
              },
              app: {
                name: "",
                key: "",
              },
              signatures: [signature],
            },
          },
        };
      }),
    );

    return this.reactor.mutate(
      documentIdentifier,
      branch,
      signedActions,
      signal,
    );
  }

  /**
   * Renames a document and waits for completion
   */
  async rename(
    documentIdentifier: string,
    name: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const branch = view?.branch || "main";
    return this.mutate(
      documentIdentifier,
      branch,
      [actions.setName(name)],
      signal,
    );
  }

  /**
   * Adds multiple documents as children to another and waits for completion
   */
  async addChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const jobInfo = await this.reactor.addChildren(
      parentIdentifier,
      documentIdentifiers,
      view,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    try {
      const result = await this.reactor.get<PHDocument>(
        parentIdentifier,
        view,
        completedJob.consistencyToken,
        signal,
      );
      return result.document;
    } catch {
      const result = await this.reactor.getBySlug<PHDocument>(
        parentIdentifier,
        view,
        completedJob.consistencyToken,
        signal,
      );
      return result.document;
    }
  }

  /**
   * Removes multiple documents as children from another and waits for completion
   */
  async removeChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const jobInfo = await this.reactor.removeChildren(
      parentIdentifier,
      documentIdentifiers,
      view,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    try {
      const result = await this.reactor.get<PHDocument>(
        parentIdentifier,
        view,
        completedJob.consistencyToken,
        signal,
      );
      return result.document;
    } catch {
      const result = await this.reactor.getBySlug<PHDocument>(
        parentIdentifier,
        view,
        completedJob.consistencyToken,
        signal,
      );
      return result.document;
    }
  }

  /**
   * Moves multiple documents from one parent to another and waits for completion
   */
  async moveChildren(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    documentIdentifiers: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<{
    source: PHDocument;
    target: PHDocument;
  }> {
    const removeJobInfo = await this.reactor.removeChildren(
      sourceParentIdentifier,
      documentIdentifiers,
      view,
      signal,
    );

    const removeCompletedJob = await this.waitForJob(removeJobInfo, signal);

    const addJobInfo = await this.reactor.addChildren(
      targetParentIdentifier,
      documentIdentifiers,
      view,
      signal,
    );

    const addCompletedJob = await this.waitForJob(addJobInfo, signal);

    try {
      const sourceResult = await this.reactor.get<PHDocument>(
        sourceParentIdentifier,
        view,
        removeCompletedJob.consistencyToken,
        signal,
      );

      const targetResult = await this.reactor.get<PHDocument>(
        targetParentIdentifier,
        view,
        addCompletedJob.consistencyToken,
        signal,
      );

      return {
        source: sourceResult.document,
        target: targetResult.document,
      };
    } catch {
      const sourceResult = await this.reactor.getBySlug<PHDocument>(
        sourceParentIdentifier,
        view,
        removeCompletedJob.consistencyToken,
        signal,
      );

      const targetResult = await this.reactor.getBySlug<PHDocument>(
        targetParentIdentifier,
        view,
        addCompletedJob.consistencyToken,
        signal,
      );

      return {
        source: sourceResult.document,
        target: targetResult.document,
      };
    }
  }

  /**
   * Deletes a document and waits for completion
   */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    // Call reactor.deleteDocument to get JobInfo
    const jobInfo = await this.reactor.deleteDocument(
      identifier,
      propagate,
      signal,
    );

    // Wait for job completion
    await this.waitForJob(jobInfo, signal);

    // Return void
    return;
  }

  /**
   * Deletes documents and waits for completion
   */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    const deletePromises = identifiers.map((identifier) =>
      this.deleteDocument(identifier, propagate, signal),
    );

    await Promise.all(deletePromises);
  }

  /**
   * Retrieves the status of a job
   */
  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    return this.reactor.getJobStatus(jobId, signal);
  }

  /**
   * Waits for a job to complete
   */
  async waitForJob(
    jobId: string | JobInfo,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const id = typeof jobId === "string" ? jobId : jobId.id;
    return this.jobAwaiter.waitForJob(id, signal);
  }

  /**
   * Subscribes to changes for documents matching specified filters
   */
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    const unsubscribeCreated = this.subscriptionManager.onDocumentCreated(
      (result) => {
        void (async () => {
          try {
            const documents = await Promise.all(
              result.results.map((id) =>
                this.reactor
                  .get(id, view, undefined, undefined)
                  .then((res) => res.document),
              ),
            );

            callback({
              type: DocumentChangeType.Created,
              documents,
            });
          } catch {
            // Silently ignore errors when fetching created documents
          }
        })();
      },
      search,
    );

    const unsubscribeDeleted = this.subscriptionManager.onDocumentDeleted(
      (documentIds) => {
        callback({
          type: DocumentChangeType.Deleted,
          documents: [],
          context: { childId: documentIds[0] },
        });
      },
      search,
    );

    const unsubscribeUpdated = this.subscriptionManager.onDocumentStateUpdated(
      (result) => {
        callback({
          type: DocumentChangeType.Updated,
          documents: result.results,
        });
      },
      search,
      view,
    );

    const unsubscribeRelationship =
      this.subscriptionManager.onRelationshipChanged(
        (parentId, childId, changeType) => {
          callback({
            type:
              changeType === RelationshipChangeType.Added
                ? DocumentChangeType.ChildAdded
                : DocumentChangeType.ChildRemoved,
            documents: [],
            context: {
              parentId,
              childId,
            },
          });
        },
        search,
      );

    return () => {
      unsubscribeCreated();
      unsubscribeDeleted();
      unsubscribeUpdated();
      unsubscribeRelationship();
    };
  }
}
