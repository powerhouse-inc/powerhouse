import type { BaseDocumentDriveServer, IDocumentStorage } from "document-drive";
import { AbortError } from "document-drive";
import type {
  Action,
  CreateDocumentActionInput,
  DeleteDocumentActionInput,
  DocumentModelModule,
  Operation,
  PHBaseState,
  PHDocument,
  UpgradeDocumentActionInput,
} from "document-model";
import { v4 as uuidv4 } from "uuid";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import type { IReadModelCoordinator } from "../read-models/interfaces.js";
import { createMutableShutdownStatus } from "../shared/factories.js";
import type {
  ConsistencyToken,
  JobInfo,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ShutdownStatus,
  ViewFilter,
} from "../shared/types.js";
import { JobStatus } from "../shared/types.js";
import { matchesScope } from "../shared/utils.js";
import type {
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
} from "../storage/interfaces.js";
import type {
  BatchMutationRequest,
  BatchMutationResult,
  IReactor,
  ReactorFeatures,
} from "./types.js";
import {
  filterByParentId,
  filterByType,
  toErrorInfo,
  topologicalSort,
  validateActionScopes,
  validateBatchRequest,
} from "./utils.js";

/**
 * This class implements the IReactor interface and serves as the main entry point
 * for the new Reactor architecture.
 */
export class Reactor implements IReactor {
  private driveServer: BaseDocumentDriveServer;
  private documentStorage: IDocumentStorage;
  private shutdownStatus: ShutdownStatus;
  private setShutdown: (value: boolean) => void;
  private queue: IQueue;
  private jobTracker: IJobTracker;
  private readModelCoordinator: IReadModelCoordinator;
  private features: ReactorFeatures;
  private documentView: IDocumentView;
  private documentIndexer: IDocumentIndexer;
  private operationStore: IOperationStore;

  constructor(
    driveServer: BaseDocumentDriveServer,
    documentStorage: IDocumentStorage,
    queue: IQueue,
    jobTracker: IJobTracker,
    readModelCoordinator: IReadModelCoordinator,
    features: ReactorFeatures,
    documentView: IDocumentView,
    documentIndexer: IDocumentIndexer,
    operationStore: IOperationStore,
  ) {
    // Store required dependencies
    this.driveServer = driveServer;
    this.documentStorage = documentStorage;
    this.queue = queue;
    this.jobTracker = jobTracker;
    this.readModelCoordinator = readModelCoordinator;
    this.features = features;
    this.documentView = documentView;
    this.documentIndexer = documentIndexer;
    this.operationStore = operationStore;

    // Start the read model coordinator
    this.readModelCoordinator.start();

    // Create mutable shutdown status using factory method
    const [status, setter] = createMutableShutdownStatus(false);
    this.shutdownStatus = status;
    this.setShutdown = setter;
  }

  /**
   * Signals that the reactor should shutdown.
   */
  kill(): ShutdownStatus {
    // Mark the reactor as shutdown
    this.setShutdown(true);

    // Stop the read model coordinator
    this.readModelCoordinator.stop();

    // TODO: Phase 3+ - Implement graceful shutdown for queue, executors, etc.
    // For now, we just mark as shutdown and return status

    return this.shutdownStatus;
  }

  /**
   * Retrieves a list of document model specifications
   */
  getDocumentModels(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    // Get document model modules from the drive server + filter
    const modules = this.driveServer.getDocumentModelModules();
    const filteredModels = modules.filter(
      (module) =>
        !namespace || module.documentModel.global.name.startsWith(namespace),
    );

    // Apply paging
    const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || filteredModels.length;
    const pagedModels = filteredModels.slice(startIndex, startIndex + limit);

    // Create paged results
    const hasMore = startIndex + limit < filteredModels.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    // even thought this is currently synchronous, they could have passed in an already-aborted signal
    if (signal?.aborted) {
      throw new AbortError();
    }

    return Promise.resolve({
      results: pagedModels,
      options: paging || { cursor: "0", limit: filteredModels.length },
      nextCursor,
      next: hasMore
        ? () =>
            this.getDocumentModels(
              namespace,
              { cursor: nextCursor!, limit },
              signal,
            )
        : undefined,
    });
  }

  /**
   * Retrieves a specific PHDocument by id
   */
  async get<TDocument extends PHDocument>(
    id: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }> {
    if (this.features.legacyStorageEnabled) {
      const document = await this.documentStorage.get<TDocument>(id);

      if (signal?.aborted) {
        throw new AbortError();
      }

      const childIds = await this.documentStorage.getChildren(id);

      if (signal?.aborted) {
        throw new AbortError();
      }

      for (const scope in document.state) {
        if (!matchesScope(view, scope)) {
          delete document.state[scope as keyof PHBaseState];
        }
      }

      return {
        document,
        childIds,
      };
    } else {
      const document = await this.documentView.get<TDocument>(
        id,
        view,
        consistencyToken,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const relationships = await this.documentIndexer.getOutgoing(
        id,
        ["child"],
        consistencyToken,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const childIds = relationships.map((rel) => rel.targetId);

      return {
        document,
        childIds,
      };
    }
  }

  /**
   * Retrieves a specific PHDocument by slug
   */
  async getBySlug<TDocument extends PHDocument>(
    slug: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }> {
    if (this.features.legacyStorageEnabled) {
      let ids: string[];
      try {
        ids = await this.documentStorage.resolveIds([slug], signal);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw new Error(`Document not found with slug: ${slug}`);
        }

        throw error;
      }

      if (ids.length === 0 || !ids[0]) {
        throw new Error(`Document not found with slug: ${slug}`);
      }

      return await this.get<TDocument>(ids[0], view, consistencyToken, signal);
    } else {
      const documentId = await this.documentView.resolveSlug(
        slug,
        view,
        consistencyToken,
        signal,
      );

      if (!documentId) {
        throw new Error(`Document not found with slug: ${slug}`);
      }

      return await this.get<TDocument>(
        documentId,
        view,
        consistencyToken,
        signal,
      );
    }
  }

  /**
   * Retrieves the operations for a document
   */
  async getOperations(
    documentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<Record<string, PagedResults<Operation>>> {
    if (this.features.legacyStorageEnabled) {
      // Use storage directly to get the document
      const document = await this.documentStorage.get(documentId);

      if (signal?.aborted) {
        throw new AbortError();
      }

      const operations = document.operations;
      const result: Record<string, PagedResults<Operation>> = {};

      // apply view filter, per scope -- this will be removed when we pass the viewfilter along
      // to the underlying store, but is here now for the interface.
      for (const scope in operations) {
        if (matchesScope(view, scope)) {
          const scopeOperations = operations[scope];

          // apply paging too
          const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
          const limit = paging?.limit || scopeOperations.length;
          const pagedOperations = scopeOperations.slice(
            startIndex,
            startIndex + limit,
          );

          result[scope] = {
            results: pagedOperations,
            options: { cursor: String(startIndex + limit), limit },
          };
        }
      }

      return Promise.resolve(result);
    } else {
      // Use operation store to get operations
      const branch = view?.branch || "main";

      // Get all scopes for this document
      const revisions = await this.operationStore.getRevisions(
        documentId,
        branch,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const allScopes = Object.keys(revisions.revision);
      const result: Record<string, PagedResults<Operation>> = {};

      // Filter scopes based on view filter and query operations for each
      for (const scope of allScopes) {
        if (!matchesScope(view, scope)) {
          continue;
        }

        if (signal?.aborted) {
          throw new AbortError();
        }

        // Get operations for this scope
        const scopeResult = await this.operationStore.getSince(
          documentId,
          scope,
          branch,
          -1,
          paging,
          signal,
        );

        // Transform to Reactor's PagedResults format
        const currentCursor = paging?.cursor ? parseInt(paging.cursor) : 0;
        const currentLimit = paging?.limit || 100;

        result[scope] = {
          results: scopeResult.items,
          options: {
            cursor: scopeResult.nextCursor || String(currentCursor),
            limit: currentLimit,
          },
          nextCursor: scopeResult.nextCursor,
          next: scopeResult.hasMore
            ? async () => {
                const nextPage = await this.getOperations(
                  documentId,
                  view,
                  {
                    cursor: scopeResult.nextCursor!,
                    limit: currentLimit,
                  },
                  consistencyToken,
                  signal,
                );
                return nextPage[scope];
              }
            : undefined,
        };
      }

      return result;
    }
  }

  /**
   * Filters documents by criteria and returns a list of them
   */
  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    let results: PagedResults<PHDocument>;
    if (search.ids) {
      if (search.slugs && search.slugs.length > 0) {
        throw new Error("Cannot use both ids and slugs in the same search");
      }

      results = await this.findByIds(
        search.ids,
        view,
        paging,
        consistencyToken,
        signal,
      );

      if (search.parentId) {
        results = filterByParentId(results, search.parentId);
      }

      if (search.type) {
        results = filterByType(results, search.type);
      }
    } else if (search.slugs) {
      results = await this.findBySlugs(
        search.slugs,
        view,
        paging,
        consistencyToken,
        signal,
      );

      if (search.parentId) {
        results = filterByParentId(results, search.parentId);
      }

      if (search.type) {
        results = filterByType(results, search.type);
      }
    } else if (search.parentId) {
      results = await this.findByParentId(
        search.parentId,
        view,
        paging,
        signal,
      );

      if (search.type) {
        results = filterByType(results, search.type);
      }
    } else if (search.type) {
      results = await this.findByType(
        search.type,
        view,
        paging,
        consistencyToken,
        signal,
      );
    } else {
      throw new Error("No search criteria provided");
    }

    if (signal?.aborted) {
      throw new AbortError();
    }

    return results;
  }

  /**
   * Creates a document
   */
  async create(document: PHDocument, signal?: AbortSignal): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();

    if (signal?.aborted) {
      throw new AbortError();
    }

    // Create a CREATE_DOCUMENT action with proper CreateDocumentActionInput
    const input: CreateDocumentActionInput = {
      model: document.header.documentType,
      version: "0.0.0",
      documentId: document.header.id,
    };

    // Add signing info
    input.signing = {
      signature: document.header.id,
      publicKey: document.header.sig.publicKey,
      nonce: document.header.sig.nonce,
      createdAtUtcIso: document.header.createdAtUtcIso,
      documentType: document.header.documentType,
    };

    // Add optional mutable header fields (always include even if empty/undefined)
    input.slug = document.header.slug;
    input.name = document.header.name;
    input.branch = document.header.branch;
    input.meta = document.header.meta;

    const createAction: Action = {
      id: `${document.header.id}-create`,
      type: "CREATE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input,
    };

    // Create an UPGRADE_DOCUMENT action to set the initial state
    const upgradeInput: UpgradeDocumentActionInput = {
      model: document.header.documentType,
      fromVersion: "0.0.0",
      toVersion: "0.0.0", // Same version since we're just setting initial state
      documentId: document.header.id,
      initialState: document.state,
    };

    const upgradeAction: Action = {
      id: `${document.header.id}-upgrade`,
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: upgradeInput,
    };

    // Create a single job with both CREATE_DOCUMENT and UPGRADE_DOCUMENT actions
    const job: Job = {
      id: uuidv4(),
      documentId: document.header.id,
      scope: "document",
      branch: "main",
      actions: [createAction, upgradeAction],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
    };

    // Create job info and register with tracker
    const jobInfo: JobInfo = {
      id: job.id,
      status: JobStatus.PENDING,
      createdAtUtcIso,
      consistencyToken: {
        version: 1,
        createdAtUtcIso,
        coordinates: [],
      },
    };
    this.jobTracker.registerJob(jobInfo);

    // Enqueue the job
    await this.queue.enqueue(job);

    return jobInfo;
  }

  /**
   * Deletes a document
   */
  async deleteDocument(
    id: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const createdAtUtcIso = new Date().toISOString();

    if (signal?.aborted) {
      throw new AbortError();
    }

    const deleteInput: DeleteDocumentActionInput = {
      documentId: id,
      propagate,
    };

    const action: Action = {
      id: `${id}-delete`,
      type: "DELETE_DOCUMENT",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: deleteInput,
    };

    const job: Job = {
      id: uuidv4(),
      documentId: id,
      scope: "document",
      branch: "main",
      actions: [action],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
    };

    const jobInfo: JobInfo = {
      id: job.id,
      status: JobStatus.PENDING,
      createdAtUtcIso,
      consistencyToken: {
        version: 1,
        createdAtUtcIso,
        coordinates: [],
      },
    };
    this.jobTracker.registerJob(jobInfo);

    await this.queue.enqueue(job);

    return jobInfo;
  }

  /**
   * Applies a list of actions to a document
   */
  async mutate(
    docId: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new AbortError();
    }

    const createdAtUtcIso = new Date().toISOString();

    // Determine scope from first action (all actions should have the same scope)
    const scope = actions.length > 0 ? actions[0].scope || "global" : "global";

    // Create a single job with all actions
    const job: Job = {
      id: uuidv4(),
      documentId: docId,
      scope: scope,
      branch: branch,
      actions: actions,
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
    };

    // Create job info and register with tracker
    const jobInfo: JobInfo = {
      id: job.id,
      status: JobStatus.PENDING,
      createdAtUtcIso,
      consistencyToken: {
        version: 1,
        createdAtUtcIso,
        coordinates: [],
      },
    };
    this.jobTracker.registerJob(jobInfo);

    // Enqueue the job
    await this.queue.enqueue(job);

    if (signal?.aborted) {
      throw new AbortError();
    }

    return jobInfo;
  }

  /**
   * Applies multiple mutations across documents with dependency management
   */
  async mutateBatch(
    request: BatchMutationRequest,
    signal?: AbortSignal,
  ): Promise<BatchMutationResult> {
    if (signal?.aborted) {
      throw new AbortError();
    }
    validateBatchRequest(request.jobs);
    for (const jobPlan of request.jobs) {
      validateActionScopes(jobPlan);
    }
    const createdAtUtcIso = new Date().toISOString();
    const planKeyToJobId = new Map<string, string>();
    for (const jobPlan of request.jobs) {
      planKeyToJobId.set(jobPlan.key, uuidv4());
    }
    const jobInfos = new Map<string, JobInfo>();
    for (const jobPlan of request.jobs) {
      const jobId = planKeyToJobId.get(jobPlan.key)!;
      const jobInfo: JobInfo = {
        id: jobId,
        status: JobStatus.PENDING,
        createdAtUtcIso,
        consistencyToken: {
          version: 1,
          createdAtUtcIso,
          coordinates: [],
        },
      };
      this.jobTracker.registerJob(jobInfo);
      jobInfos.set(jobPlan.key, jobInfo);
    }
    const sortedKeys = topologicalSort(request.jobs);
    const enqueuedKeys: string[] = [];
    try {
      for (const key of sortedKeys) {
        if (signal?.aborted) {
          throw new AbortError();
        }
        const jobPlan = request.jobs.find((j) => j.key === key)!;
        const jobId = planKeyToJobId.get(key)!;
        const queueHint = jobPlan.dependsOn.map(
          (depKey) => planKeyToJobId.get(depKey)!,
        );
        const job: Job = {
          id: jobId,
          documentId: jobPlan.documentId,
          scope: jobPlan.scope,
          branch: jobPlan.branch,
          actions: jobPlan.actions,
          createdAt: createdAtUtcIso,
          queueHint,
          maxRetries: 3,
          errorHistory: [],
        };
        await this.queue.enqueue(job);
        enqueuedKeys.push(key);
      }
    } catch (error) {
      for (const key of enqueuedKeys) {
        const jobId = planKeyToJobId.get(key)!;
        try {
          await this.queue.remove(jobId);
        } catch {
          // Ignore removal errors during cleanup
        }
      }
      for (const jobInfo of jobInfos.values()) {
        this.jobTracker.markFailed(
          jobInfo.id,
          toErrorInfo("Batch enqueue failed"),
        );
      }
      throw error;
    }
    const result: BatchMutationResult = {
      jobs: Object.fromEntries(jobInfos),
    };
    return result;
  }

  /**
   * Adds multiple documents as children to another
   */
  async addChildren(
    parentId: string,
    documentIds: string[],
    _view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new AbortError();
    }

    const actions: Action[] = documentIds.map((childId) => ({
      id: uuidv4(),
      type: "ADD_RELATIONSHIP",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: {
        sourceId: parentId,
        targetId: childId,
        relationshipType: "child",
      },
    }));

    const branch = _view?.branch || "main";
    return await this.mutate(parentId, branch, actions, signal);
  }

  /**
   * Removes multiple documents as children from another
   */
  async removeChildren(
    parentId: string,
    documentIds: string[],
    _view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new AbortError();
    }

    const actions: Action[] = documentIds.map((childId) => ({
      id: uuidv4(),
      type: "REMOVE_RELATIONSHIP",
      scope: "document",
      timestampUtcMs: new Date().toISOString(),
      input: {
        sourceId: parentId,
        targetId: childId,
        relationshipType: "child",
      },
    }));

    const branch = _view?.branch || "main";
    return await this.mutate(parentId, branch, actions, signal);
  }

  /**
   * Retrieves the status of a job
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    if (signal?.aborted) {
      throw new AbortError();
    }

    const jobInfo = this.jobTracker.getJobStatus(jobId);

    if (!jobInfo) {
      // Job not found - return FAILED status with appropriate error
      const now = new Date().toISOString();
      return Promise.resolve({
        id: jobId,
        status: JobStatus.FAILED,
        createdAtUtcIso: now,
        completedAtUtcIso: now,
        error: toErrorInfo("Job not found"),
        consistencyToken: {
          version: 1,
          createdAtUtcIso: now,
          coordinates: [],
        },
      });
    }

    return Promise.resolve(jobInfo);
  }

  /**
   * Finds documents by their IDs
   */
  private async findByIds(
    ids: string[],
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    if (consistencyToken) {
      await this.documentView.waitForConsistency(
        consistencyToken,
        undefined,
        signal,
      );
    }
    if (this.features.legacyStorageEnabled) {
      const documents: PHDocument[] = [];

      // Fetch each document by ID using storage directly
      for (const id of ids) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        let document: PHDocument;
        try {
          document = await this.documentStorage.get<PHDocument>(id);
        } catch {
          // Skip documents that don't exist or can't be accessed
          // This matches the behavior expected from a search operation
          continue;
        }

        // Apply view filter - This will be removed when we pass the viewfilter along
        // to the underlying store, but is here now for the interface.
        for (const scope in document.state) {
          if (!matchesScope(view, scope)) {
            delete document.state[scope as keyof PHBaseState];
          }
        }

        documents.push(document);
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Apply paging
      const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
      const limit = paging?.limit || documents.length;
      const pagedDocuments = documents.slice(startIndex, startIndex + limit);

      // Create paged results
      const hasMore = startIndex + limit < documents.length;
      const nextCursor = hasMore ? String(startIndex + limit) : undefined;

      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        next: hasMore
          ? () =>
              this.findByIds(
                ids,
                view,
                { cursor: nextCursor!, limit },
                undefined,
                signal,
              )
          : undefined,
      };
    } else {
      const documents: PHDocument[] = [];

      // Fetch each document by ID using documentView
      for (const id of ids) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        try {
          const document = await this.documentView.get<PHDocument>(
            id,
            view,
            undefined,
            signal,
          );
          documents.push(document);
        } catch {
          // Skip documents that don't exist or can't be accessed
          continue;
        }
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Apply paging
      const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
      const limit = paging?.limit || documents.length;
      const pagedDocuments = documents.slice(startIndex, startIndex + limit);

      // Create paged results
      const hasMore = startIndex + limit < documents.length;
      const nextCursor = hasMore ? String(startIndex + limit) : undefined;

      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        next: hasMore
          ? () =>
              this.findByIds(
                ids,
                view,
                { cursor: nextCursor!, limit },
                undefined,
                signal,
              )
          : undefined,
      };
    }
  }

  /**
   * Finds documents by their slugs
   */
  private async findBySlugs(
    slugs: string[],
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    if (consistencyToken) {
      await this.documentView.waitForConsistency(
        consistencyToken,
        undefined,
        signal,
      );
    }
    if (this.features.legacyStorageEnabled) {
      const documents: PHDocument[] = [];

      // Use storage to resolve slugs to IDs
      let ids: string[];
      try {
        ids = await this.documentStorage.resolveIds(slugs, signal);
      } catch {
        // If slug resolution fails, return empty results
        // This matches the behavior expected from a search operation
        ids = [];
      }

      // Fetch each document by resolved ID
      for (const id of ids) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        let document: PHDocument;
        try {
          document = await this.documentStorage.get<PHDocument>(id);
        } catch {
          // Skip documents that don't exist or can't be accessed
          continue;
        }

        // Apply view filter - This will be removed when we pass the viewfilter along
        // to the underlying store, but is here now for the interface.
        for (const scope in document.state) {
          if (!matchesScope(view, scope)) {
            delete document.state[scope as keyof PHBaseState];
          }
        }

        documents.push(document);
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Apply paging - this will be removed when we pass the paging along
      // to the underlying store, but is here now for the interface.
      const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
      const limit = paging?.limit || documents.length;
      const pagedDocuments = documents.slice(startIndex, startIndex + limit);

      // Create paged results
      const hasMore = startIndex + limit < documents.length;
      const nextCursor = hasMore ? String(startIndex + limit) : undefined;

      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        next: hasMore
          ? () =>
              this.findBySlugs(
                slugs,
                view,
                { cursor: nextCursor!, limit },
                undefined,
                signal,
              )
          : undefined,
      };
    } else {
      const documents: PHDocument[] = [];

      // Resolve each slug to a document ID
      const documentIds: string[] = [];
      for (const slug of slugs) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        const documentId = await this.documentView.resolveSlug(
          slug,
          view,
          undefined,
          signal,
        );

        if (documentId) {
          documentIds.push(documentId);
        }
      }

      // Fetch each document
      for (const documentId of documentIds) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        try {
          const document = await this.documentView.get<PHDocument>(
            documentId,
            view,
            undefined,
            signal,
          );
          documents.push(document);
        } catch {
          // Skip documents that don't exist or can't be accessed
          continue;
        }
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Apply paging
      const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
      const limit = paging?.limit || documents.length;
      const pagedDocuments = documents.slice(startIndex, startIndex + limit);

      // Create paged results
      const hasMore = startIndex + limit < documents.length;
      const nextCursor = hasMore ? String(startIndex + limit) : undefined;

      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        next: hasMore
          ? () =>
              this.findBySlugs(
                slugs,
                view,
                { cursor: nextCursor!, limit },
                undefined,
                signal,
              )
          : undefined,
      };
    }
  }

  /**
   * Finds documents by parent ID
   */
  private async findByParentId(
    parentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    if (this.features.legacyStorageEnabled) {
      // Get child document IDs from storage
      const childIds = await this.documentStorage.getChildren(parentId);

      if (signal?.aborted) {
        throw new AbortError();
      }

      const documents: PHDocument[] = [];

      // Fetch each child document
      for (const childId of childIds) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        let document: PHDocument;
        try {
          document = await this.documentStorage.get<PHDocument>(childId);
        } catch {
          // Skip documents that don't exist or can't be accessed
          // This matches the behavior expected from a search operation
          continue;
        }

        // Apply view filter - This will be removed when we pass the viewfilter along
        // to the underlying store, but is here now for the interface.
        for (const scope in document.state) {
          if (!matchesScope(view, scope)) {
            delete document.state[scope as keyof PHBaseState];
          }
        }

        documents.push(document);
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Apply paging
      const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
      const limit = paging?.limit || documents.length;
      const pagedDocuments = documents.slice(startIndex, startIndex + limit);

      // Create paged results
      const hasMore = startIndex + limit < documents.length;
      const nextCursor = hasMore ? String(startIndex + limit) : undefined;

      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        next: hasMore
          ? () =>
              this.findByParentId(
                parentId,
                view,
                { cursor: nextCursor!, limit },
                signal,
              )
          : undefined,
      };
    } else {
      // Get child relationships from indexer
      const relationships = await this.documentIndexer.getOutgoing(
        parentId,
        ["child"],
        undefined,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const documents: PHDocument[] = [];

      // Fetch each child document
      for (const relationship of relationships) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        try {
          const document = await this.documentView.get<PHDocument>(
            relationship.targetId,
            view,
            undefined,
            signal,
          );
          documents.push(document);
        } catch {
          // Skip documents that don't exist or can't be accessed
          continue;
        }
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Apply paging
      const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
      const limit = paging?.limit || documents.length;
      const pagedDocuments = documents.slice(startIndex, startIndex + limit);

      // Create paged results
      const hasMore = startIndex + limit < documents.length;
      const nextCursor = hasMore ? String(startIndex + limit) : undefined;

      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        next: hasMore
          ? () =>
              this.findByParentId(
                parentId,
                view,
                { cursor: nextCursor!, limit },
                signal,
              )
          : undefined,
      };
    }
  }

  /**
   * Finds documents by type
   */
  private async findByType(
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    if (consistencyToken) {
      await this.documentView.waitForConsistency(
        consistencyToken,
        undefined,
        signal,
      );
    }
    if (this.features.legacyStorageEnabled) {
      const documents: PHDocument[] = [];

      // Use storage's findByType method directly
      const cursor = paging?.cursor;
      const limit = paging?.limit || 100;

      // Get document IDs of the specified type
      const { documents: documentIds, nextCursor } =
        await this.documentStorage.findByType(type, limit, cursor);

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Fetch each document by its ID
      for (const documentId of documentIds) {
        if (signal?.aborted) {
          throw new AbortError();
        }

        let document: PHDocument;
        try {
          document = await this.documentStorage.get<PHDocument>(documentId);
        } catch {
          // Skip documents that can't be retrieved
          continue;
        }

        // Apply view filter
        for (const scope in document.state) {
          if (!matchesScope(view, scope)) {
            delete document.state[scope as keyof PHBaseState];
          }
        }

        documents.push(document);
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      // Results are already paged from the storage layer
      return {
        results: documents,
        options: paging || { cursor: cursor || "0", limit },
        nextCursor,
        next: nextCursor
          ? async () =>
              this.findByType(
                type,
                view,
                { cursor: nextCursor, limit },
                undefined,
                signal,
              )
          : undefined,
      };
    } else {
      const result = await this.documentView.findByType(
        type,
        view,
        paging,
        undefined,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const cursor = paging?.cursor;
      const limit = paging?.limit || 100;

      return {
        results: result.items,
        options: paging || { cursor: cursor || "0", limit },
        nextCursor: result.nextCursor,
        next: result.nextCursor
          ? async () =>
              this.findByType(
                type,
                view,
                { cursor: result.nextCursor!, limit },
                undefined,
                signal,
              )
          : undefined,
      };
    }
  }
}
