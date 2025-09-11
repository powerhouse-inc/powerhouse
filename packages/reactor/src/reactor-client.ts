import type {
  Action,
  DocumentModelState,
  PHDocument,
  Signature,
} from "document-model";

import type { IReactorClient } from "./interfaces/reactor-client.js";
import type { IReactor } from "./interfaces/reactor.js";
import {
  JobStatus,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type SearchFilter,
  type ViewFilter,
} from "./shared/types.js";

/**
 * Interface for signing actions before submission to the reactor.
 */
export interface ISigner {
  /**
   * Signs an action
   *
   * @param action - The action to sign
   * @param abortSignal - Optional abort signal to cancel the signing
   * @returns The signature
   */
  sign(action: Action, abortSignal?: AbortSignal): Promise<Signature>;
}

/**
 * Interface for managing subscriptions to document changes.
 */
export interface IReactorSubscriptionManager {
  // To be defined based on the subscription planning docs
}

/**
 * Describes the types of document changes that can occur.
 */
export enum DocumentChangeType {
  Created = "created",
  Deleted = "deleted",
  Updated = "updated",
  ParentAdded = "parent_added",
  ParentRemoved = "parent_removed",
  ChildAdded = "child_added",
  ChildRemoved = "child_removed",
}

/**
 * Represents a change event for documents.
 */
export type DocumentChangeEvent = {
  type: DocumentChangeType;
  documents: PHDocument[];
  context?: {
    parentId?: string;
    childId?: string;
  };
};

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
  private signer?: ISigner;
  private subscriptionManager?: IReactorSubscriptionManager;

  constructor(
    reactor: IReactor,
    signer?: ISigner,
    subscriptionManager?: IReactorSubscriptionManager,
  ) {
    this.reactor = reactor;
    this.signer = signer;
    this.subscriptionManager = subscriptionManager;
  }

  /**
   * Retrieves a list of document model specifications
   */
  async getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelState>> {
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
      return await this.reactor.get<TDocument>(identifier, view, signal);
    } catch (error) {
      // If failed, try to get by slug
      return await this.reactor.getBySlug<TDocument>(identifier, view, signal);
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
    throw new Error("Method not implemented.");
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
    throw new Error("Method not implemented.");
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
    return this.reactor.find(search, view, paging, signal);
  }

  /**
   * Creates a document and waits for completion
   */
  async create(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    throw new Error("Method not implemented.");
  }

  /**
   * Creates an empty document and waits for completion
   */
  async createEmpty<TDocument extends PHDocument>(
    documentType: string,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    throw new Error("Method not implemented.");
  }

  /**
   * Applies a list of actions to a document and waits for completion
   */
  async mutate<TDocument extends PHDocument>(
    documentIdentifier: string,
    actions: Action[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    throw new Error("Method not implemented.");
  }

  /**
   * Submits a list of actions to a document
   */
  async mutateAsync<TDocument extends PHDocument>(
    documentIdentifier: string,
    actions: Action[],
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    // Sign actions if signer is provided
    let signedActions = actions;
    if (this.signer) {
      signedActions = await Promise.all(
        actions.map(async (action) => {
          const signature = await this.signer!.sign(action, signal);
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
    }

    // Note: reactor.mutate doesn't use view or signal currently
    return this.reactor.mutate(documentIdentifier, signedActions);
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
    throw new Error("Method not implemented.");
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
    // Call reactor.addChildren to get JobInfo
    const jobInfo = await this.reactor.addChildren(
      parentIdentifier,
      documentIdentifiers,
      view,
      signal,
    );

    // Wait for job completion
    await this.waitForJob(jobInfo, signal);

    // Fetch and return updated parent document
    const result = await this.get<PHDocument>(parentIdentifier, view, signal);
    return result.document;
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
    // Call reactor.removeChildren to get JobInfo
    const jobInfo = await this.reactor.removeChildren(
      parentIdentifier,
      documentIdentifiers,
      view,
      signal,
    );

    // Wait for job completion
    await this.waitForJob(jobInfo, signal);

    // Fetch and return updated parent document
    const result = await this.get<PHDocument>(parentIdentifier, view, signal);
    return result.document;
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
    throw new Error("Method not implemented.");
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
    throw new Error("Method not implemented.");
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

    // Poll job status until completion
    while (true) {
      // Check if aborted
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      const jobInfo = await this.reactor.getJobStatus(id, signal);

      // Check if job is complete (success or failure)
      if (
        jobInfo.status === JobStatus.COMPLETED ||
        jobInfo.status === JobStatus.FAILED
      ) {
        return jobInfo;
      }

      // Wait a bit before polling again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Subscribes to changes for documents matching specified filters
   */
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    throw new Error("Method not implemented.");
  }
}
