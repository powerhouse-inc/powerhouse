import { addFile } from "document-drive";
import type {
  Action,
  CreateDocumentActionInput,
  DocumentModelModule,
  ISigner,
  PHDocument,
} from "document-model";
import { actions } from "document-model";

import {
  addRelationshipAction,
  createDocumentAction,
  upgradeDocumentAction,
} from "#actions/index.js";
import { signActions } from "#core/utils.js";
import type { ILogger } from "#logging/types.js";
import type { IReactor } from "../core/types.js";
import { type IJobAwaiter } from "../shared/awaiter.js";
import {
  JobStatus,
  PropagationMode,
  RelationshipChangeType,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ViewFilter,
} from "../shared/types.js";
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
  private logger: ILogger;
  private reactor: IReactor;
  private signer: ISigner;
  private subscriptionManager: IReactorSubscriptionManager;
  private jobAwaiter: IJobAwaiter;
  private documentIndexer: IDocumentIndexer;

  constructor(
    logger: ILogger,
    reactor: IReactor,
    signer: ISigner,
    subscriptionManager: IReactorSubscriptionManager,
    jobAwaiter: IJobAwaiter,
    documentIndexer: IDocumentIndexer,
  ) {
    this.logger = logger;
    this.reactor = reactor;
    this.signer = signer;
    this.subscriptionManager = subscriptionManager;
    this.jobAwaiter = jobAwaiter;
    this.documentIndexer = documentIndexer;
    this.logger.verbose("ReactorClient initialized");
  }

  /**
   * Retrieves a list of document model modules.
   */
  async getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    this.logger.verbose(
      "getDocumentModels(@namespace, @paging)",
      namespace,
      paging,
    );
    return this.reactor.getDocumentModels(namespace, paging, signal);
  }

  /**
   * Retrieves a specific document model module by document type.
   *
   * @param documentType - The document type identifier
   * @returns The document model module
   */
  async getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>> {
    const modules = await this.reactor.getDocumentModels();
    const module = modules.results.find(
      (m) => m.documentModel.global.id === documentType,
    );

    if (!module) {
      throw new Error(
        `Document model module not found for type: ${documentType}`,
      );
    }

    return module as DocumentModelModule<any>;
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
    this.logger.verbose("get(@identifier, @view)", identifier, view);
    return await this.reactor.getByIdOrSlug<TDocument>(
      identifier,
      view,
      undefined,
      signal,
    );
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
    this.logger.verbose(
      "getChildren(@parentIdentifier, @view, @paging)",
      parentIdentifier,
      view,
      paging,
    );
    const parentDoc = await this.reactor.getByIdOrSlug(
      parentIdentifier,
      view,
      undefined,
      signal,
    );
    const parentId = parentDoc.document.header.id;

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
    this.logger.verbose(
      "getParents(@childIdentifier, @view, @paging)",
      childIdentifier,
      view,
      paging,
    );
    const childDoc = await this.reactor.getByIdOrSlug(
      childIdentifier,
      view,
      undefined,
      signal,
    );
    const childId = childDoc.document.header.id;

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
    this.logger.verbose("find(@search, @view, @paging)", search, view, paging);
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
    this.logger.verbose(
      "create(@id, @parentIdentifier)",
      document.header.id,
      parentIdentifier,
    );
    const jobInfo = await this.reactor.create(document, this.signer, signal);

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const documentId = document.header.id;

    if (parentIdentifier) {
      await this.addChildren(parentIdentifier, [documentId], undefined, signal);
    }

    const result = await this.reactor.get<PHDocument>(
      documentId,
      undefined,
      completedJob.consistencyToken,
      signal,
    );

    return result.document;
  }

  /**
   * Creates an empty document and waits for completion
   */
  async createEmpty<TDocument extends PHDocument>(
    documentType: string,
    parentIdentifier?: string,
    version?: number,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "createEmpty(@documentType, @parentIdentifier)",
      documentType,
      parentIdentifier,
    );
    const modulesResult = await this.reactor.getDocumentModels(
      undefined,
      undefined,
      signal,
    );

    const matchingModules = modulesResult.results.filter(
      (m) => m.documentModel.global.id === documentType,
    );

    let module: DocumentModelModule | undefined;
    if (version !== undefined) {
      module = matchingModules.find((m) => m.version === version);
      if (!module) {
        throw new Error(
          `Document model not found for type: ${documentType} with version: ${version}`,
        );
      }
    } else {
      module = matchingModules.reduce<DocumentModelModule | undefined>(
        (latest, current) => {
          if (latest === undefined) return current;
          const currentVersion = current.version ?? 0;
          const latestVersion = latest.version ?? 0;
          return currentVersion > latestVersion ? current : latest;
        },
        undefined,
      );
      if (!module) {
        throw new Error(`Document model not found for type: ${documentType}`);
      }
    }

    const document = module.utils.createDocument();

    return this.create(
      document,
      parentIdentifier,
      signal,
    ) as Promise<TDocument>;
  }

  /**
   * Creates an empty document in a drive as a single batched operation.
   */
  async createDocumentInDrive<TDocument extends PHDocument>(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "createDocumentInDrive(@driveId, @document, @parentFolder)",
      driveId,
      document,
      parentFolder,
    );

    const documentId = document.header.id;

    const createInput: CreateDocumentActionInput = {
      model: document.header.documentType,
      version: 0,
      documentId: document.header.id,
      signing: {
        signature: document.header.id,
        publicKey: document.header.sig.publicKey,
        nonce: document.header.sig.nonce,
        createdAtUtcIso: document.header.createdAtUtcIso,
        documentType: document.header.documentType,
      },
      slug: document.header.slug,
      name: document.header.name,
      branch: document.header.branch,
      meta: document.header.meta,
      protocolVersions: document.header.protocolVersions ?? {
        "base-reducer": 2,
      },
    };

    const documentActions: Action[] = await signActions(
      [
        createDocumentAction(createInput),
        upgradeDocumentAction({
          documentId: document.header.id,
          model: document.header.documentType,
          fromVersion: 0,
          toVersion: 1,
          initialState: document.state,
        }),
        addRelationshipAction(driveId, documentId, "child"),
      ],
      this.signer,
      signal,
    );

    const driveActions: Action[] = await signActions(
      [
        addFile({
          id: documentId,
          name: document.header.name,
          documentType: document.header.documentType,
          parentFolder,
        }),
      ],
      this.signer,
      signal,
    );

    const documentJob = await this.reactor.execute(
      documentId,
      "main",
      documentActions,
      signal,
    );
    const completedDocumentJob = await this.waitForJob(documentJob, signal);
    if (completedDocumentJob.status === JobStatus.FAILED) {
      throw new Error(completedDocumentJob.error?.message);
    }

    const driveJob = await this.reactor.execute(
      driveId,
      "main",
      driveActions,
      signal,
    );
    const completedDriveJob = await this.waitForJob(driveJob, signal);
    if (completedDriveJob.status === JobStatus.FAILED) {
      this.logger.error(
        "Document was created but the drive operation failed for (@driveId, @documentId) with @error",
        driveId,
        documentId,
        completedDriveJob.error?.message,
      );

      // TODO: rollback?

      throw new Error(completedDriveJob.error?.message);
    }

    // since we waited for the job to complete we don't need the consistency token
    const resultingDocument = await this.reactor.get<TDocument>(documentId);
    return resultingDocument.document;
  }

  /**
   * Applies a list of actions to a document and waits for completion
   */
  async execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "execute(@documentIdentifier, @branch, @count actions)",
      documentIdentifier,
      branch,
      actions.length,
    );
    const signedActions = await signActions(actions, this.signer, signal);

    const jobInfo = await this.reactor.execute(
      documentIdentifier,
      branch,
      signedActions,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const view: ViewFilter = { branch };
    const result = await this.reactor.getByIdOrSlug<TDocument>(
      documentIdentifier,
      view,
      completedJob.consistencyToken,
      signal,
    );
    return result.document;
  }

  /**
   * Submits a list of actions to a document
   */
  async executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "executeAsync(@documentIdentifier, @branch, @count actions)",
      documentIdentifier,
      branch,
      actions.length,
    );
    const signedActions = await signActions(actions, this.signer, signal);

    return this.reactor.execute(
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
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "rename(@documentIdentifier, @name, @branch)",
      documentIdentifier,
      name,
      branch,
    );
    return this.execute(
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
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "addChildren(@parentIdentifier, @count children, @branch)",
      parentIdentifier,
      documentIdentifiers.length,
      branch,
    );
    const jobInfo = await this.reactor.addChildren(
      parentIdentifier,
      documentIdentifiers,
      branch,
      this.signer,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const result = await this.reactor.getByIdOrSlug<PHDocument>(
      parentIdentifier,
      { branch },
      completedJob.consistencyToken,
      signal,
    );
    return result.document;
  }

  /**
   * Removes multiple documents as children from another and waits for completion
   */
  async removeChildren(
    parentIdentifier: string,
    documentIdentifiers: string[],
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "removeChildren(@parentIdentifier, @count children, @branch)",
      parentIdentifier,
      documentIdentifiers.length,
      branch,
    );
    const jobInfo = await this.reactor.removeChildren(
      parentIdentifier,
      documentIdentifiers,
      branch,
      this.signer,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const result = await this.reactor.getByIdOrSlug<PHDocument>(
      parentIdentifier,
      { branch },
      completedJob.consistencyToken,
      signal,
    );
    return result.document;
  }

  /**
   * Moves multiple documents from one parent to another and waits for completion
   */
  async moveChildren(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    documentIdentifiers: string[],
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<{
    source: PHDocument;
    target: PHDocument;
  }> {
    this.logger.verbose(
      "moveChildren(@sourceParentIdentifier, @targetParentIdentifier, @count children, @branch)",
      sourceParentIdentifier,
      targetParentIdentifier,
      documentIdentifiers.length,
      branch,
    );
    const removeJobInfo = await this.reactor.removeChildren(
      sourceParentIdentifier,
      documentIdentifiers,
      branch,
      this.signer,
      signal,
    );

    const removeCompletedJob = await this.waitForJob(removeJobInfo, signal);

    if (removeCompletedJob.status === JobStatus.FAILED) {
      throw new Error(removeCompletedJob.error?.message);
    }

    const addJobInfo = await this.reactor.addChildren(
      targetParentIdentifier,
      documentIdentifiers,
      branch,
      this.signer,
      signal,
    );

    const addCompletedJob = await this.waitForJob(addJobInfo, signal);

    if (addCompletedJob.status === JobStatus.FAILED) {
      throw new Error(addCompletedJob.error?.message);
    }

    const sourceResult = await this.reactor.getByIdOrSlug<PHDocument>(
      sourceParentIdentifier,
      { branch },
      removeCompletedJob.consistencyToken,
      signal,
    );

    const targetResult = await this.reactor.getByIdOrSlug<PHDocument>(
      targetParentIdentifier,
      { branch },
      addCompletedJob.consistencyToken,
      signal,
    );

    return {
      source: sourceResult.document,
      target: targetResult.document,
    };
  }

  /**
   * Deletes a document and waits for completion
   */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    this.logger.verbose(
      "deleteDocument(@identifier, @propagate)",
      identifier,
      propagate,
    );
    const jobs: JobInfo[] = [];

    if (propagate === PropagationMode.Cascade) {
      const descendants: string[] = [];
      const queue: string[] = [identifier];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const currentId = queue.shift()!;

        if (visited.has(currentId)) {
          continue;
        }

        visited.add(currentId);

        if (signal?.aborted) {
          throw new Error("Operation aborted");
        }

        const relationships = await this.documentIndexer.getOutgoing(
          currentId,
          ["child"],
          undefined,
          signal,
        );

        for (const rel of relationships) {
          if (!visited.has(rel.targetId)) {
            descendants.push(rel.targetId);
            queue.push(rel.targetId);
          }
        }
      }

      for (const descendantId of descendants) {
        const jobInfo = await this.reactor.deleteDocument(
          descendantId,
          this.signer,
          signal,
        );
        jobs.push(jobInfo);
      }
    }

    const jobInfo = await this.reactor.deleteDocument(
      identifier,
      this.signer,
      signal,
    );
    jobs.push(jobInfo);

    const completedJobs = await Promise.all(
      jobs.map((job) => this.waitForJob(job, signal)),
    );

    for (const completedJob of completedJobs) {
      if (completedJob.status === JobStatus.FAILED) {
        throw new Error(completedJob.error?.message);
      }
    }
  }

  /**
   * Deletes documents and waits for completion
   */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    this.logger.verbose(
      "deleteDocuments(@count identifiers, @propagate)",
      identifiers.length,
      propagate,
    );
    const deletePromises = identifiers.map((identifier) =>
      this.deleteDocument(identifier, propagate, signal),
    );

    await Promise.all(deletePromises);
  }

  /**
   * Retrieves the status of a job
   */
  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    this.logger.verbose("getJobStatus(@jobId)", jobId);
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
    this.logger.verbose("waitForJob(@id)", id);
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
    this.logger.verbose("subscribe(@search, @view)", search, view);
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
