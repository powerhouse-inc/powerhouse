import type { Action, DocumentModelModule, PHDocument } from "document-model";

import type { IReactor } from "../core/types.js";
import { type IJobAwaiter } from "../shared/awaiter.js";
import {
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type SearchFilter,
  type ViewFilter,
} from "../shared/types.js";
import type { ISigner } from "../signer/types.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import type { DocumentChangeEvent, IReactorClient } from "./types.js";

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

  constructor(
    reactor: IReactor,
    signer: ISigner,
    subscriptionManager: IReactorSubscriptionManager,
    jobAwaiter: IJobAwaiter,
  ) {
    this.reactor = reactor;
    this.signer = signer;
    this.subscriptionManager = subscriptionManager;
    this.jobAwaiter = jobAwaiter;
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
    const jobInfo = await this.reactor.mutate(documentIdentifier, actions);

    await this.waitForJob(jobInfo, signal);

    const document = await this.get<TDocument>(
      documentIdentifier,
      view,
      signal,
    );
    return document.document;
  }

  /**
   * Submits a list of actions to a document
   */
  async mutateAsync(
    documentIdentifier: string,
    actions: Action[],
    view?: ViewFilter,
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
    throw new Error("Method not implemented.");
  }
}
