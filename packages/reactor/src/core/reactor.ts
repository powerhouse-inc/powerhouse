import {
  addRelationshipAction,
  createDocumentAction,
  deleteDocumentAction,
  removeRelationshipAction,
  upgradeDocumentAction,
} from "#actions/index.js";
import type { ILogger } from "#logging/types.js";
import type { BaseDocumentDriveServer } from "document-drive";
import { AbortError } from "document-drive";
import type {
  Action,
  CreateDocumentActionInput,
  DocumentModelModule,
  ISigner,
  Operation,
  PHBaseState,
  PHDocument,
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
  SearchFilter,
  ShutdownStatus,
  ViewFilter,
} from "../shared/types.js";
import { JobStatus } from "../shared/types.js";
import { matchesScope } from "../shared/utils.js";
import type {
  IConsistencyAwareStorage,
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
} from "../storage/interfaces.js";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  IReactor,
  ReactorFeatures,
} from "./types.js";
import {
  filterByType,
  getSharedScope,
  signAction,
  signActions,
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
  private logger: ILogger;
  private driveServer: BaseDocumentDriveServer;
  private documentStorage: IConsistencyAwareStorage;
  private shutdownStatus: ShutdownStatus;
  private setShutdown: (value: boolean) => void;
  private queue: IQueue;
  private jobTracker: IJobTracker;
  private readModelCoordinator: IReadModelCoordinator;
  private features: ReactorFeatures;
  private documentView: IDocumentView;
  private _documentIndexer: IDocumentIndexer;
  private operationStore: IOperationStore;

  constructor(
    logger: ILogger,
    driveServer: BaseDocumentDriveServer,
    documentStorage: IConsistencyAwareStorage,
    queue: IQueue,
    jobTracker: IJobTracker,
    readModelCoordinator: IReadModelCoordinator,
    features: ReactorFeatures,
    documentView: IDocumentView,
    documentIndexer: IDocumentIndexer,
    operationStore: IOperationStore,
  ) {
    // Store required dependencies
    this.logger = logger;
    this.driveServer = driveServer;
    this.documentStorage = documentStorage;
    this.queue = queue;
    this.jobTracker = jobTracker;
    this.readModelCoordinator = readModelCoordinator;
    this.features = features;
    this.documentView = documentView;
    this._documentIndexer = documentIndexer;
    this.operationStore = operationStore;

    // Create mutable shutdown status using factory method
    const [status, setter] = createMutableShutdownStatus(false);
    this.shutdownStatus = status;
    this.setShutdown = setter;

    this.logger.verbose(
      "Reactor({ legacyStorage: @legacy })",
      features.legacyStorageEnabled,
    );

    this.readModelCoordinator.start();
  }

  /**
   * Signals that the reactor should shutdown.
   */
  kill(): ShutdownStatus {
    this.logger.verbose("kill()");

    // Mark the reactor as shutdown
    this.setShutdown(true);

    // Stop the read model coordinator
    this.readModelCoordinator.stop();

    // Stop the job tracker
    this.jobTracker.shutdown();

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
    this.logger.verbose(
      "getDocumentModels(@namespace, @paging)",
      namespace,
      paging,
    );

    // Get document model modules from the drive server + filter
    const modules = this.driveServer.getDocumentModelModules();

    const filteredModels = modules.filter(
      (module) =>
        !namespace || module.documentModel.global.id.startsWith(namespace),
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
      totalCount: filteredModels.length,
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
    this.logger.verbose("get(@id, @view)", id, view);

    if (this.features.legacyStorageEnabled) {
      const document = await this.documentStorage.get<TDocument>(
        id,
        consistencyToken,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const childIds = await this.documentStorage.getChildren(
        id,
        consistencyToken,
        signal,
      );

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

      const relationships = await this._documentIndexer.getOutgoing(
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
    this.logger.verbose("getBySlug(@slug, @view)", slug, view);

    if (this.features.legacyStorageEnabled) {
      let ids: string[];
      try {
        ids = await this.documentStorage.resolveIds(
          [slug],
          consistencyToken,
          signal,
        );
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
   * Retrieves a specific PHDocument by identifier (either id or slug)
   */
  async getByIdOrSlug<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<{
    document: TDocument;
    childIds: string[];
  }> {
    this.logger.verbose("getByIdOrSlug(@identifier, @view)", identifier, view);

    if (this.features.legacyStorageEnabled) {
      try {
        return await this.get<TDocument>(
          identifier,
          view,
          consistencyToken,
          signal,
        );
      } catch {
        try {
          const ids = await this.documentStorage.resolveIds(
            [identifier],
            consistencyToken,
            signal,
          );

          if (ids.length === 0 || !ids[0]) {
            throw new Error(`Document not found: ${identifier}`);
          }

          return await this.get<TDocument>(
            ids[0],
            view,
            consistencyToken,
            signal,
          );
        } catch {
          throw new Error(`Document not found: ${identifier}`);
        }
      }
    } else {
      const document = await this.documentView.getByIdOrSlug<TDocument>(
        identifier,
        view,
        consistencyToken,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const relationships = await this._documentIndexer.getOutgoing(
        document.header.id,
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
   * Retrieves the operations for a document
   */
  async getOperations(
    documentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<Record<string, PagedResults<Operation>>> {
    this.logger.verbose(
      "getOperations(@documentId, @view, @paging)",
      documentId,
      view,
      paging,
    );

    if (this.features.legacyStorageEnabled) {
      // Use storage directly to get the document
      const document = await this.documentStorage.get(
        documentId,
        consistencyToken,
        signal,
      );

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
    this.logger.verbose("find(@search, @view, @paging)", search, view, paging);

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
  async create(
    document: PHDocument,
    signer?: ISigner,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "create(@id, @type, @slug)",
      document.header.id,
      document.header.documentType,
      document.header.slug,
    );
    const createdAtUtcIso = new Date().toISOString();

    if (signal?.aborted) {
      throw new AbortError();
    }

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

    const createAction = createDocumentAction(createInput);
    const upgradeAction = upgradeDocumentAction({
      documentId: document.header.id,
      model: document.header.documentType,
      fromVersion: 0,
      toVersion: 1,
      initialState: document.state,
    });

    // Sign actions if signer is provided
    let actions: Action[] = [createAction, upgradeAction];
    if (signer) {
      actions = await signActions(actions, signer, signal);
    }

    // Create a single job with both CREATE_DOCUMENT and UPGRADE_DOCUMENT actions
    const job: Job = {
      id: uuidv4(),
      kind: "mutation",
      documentId: document.header.id,
      scope: "document",
      branch: "main",
      actions,
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
      meta,
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
      meta,
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
    signer?: ISigner,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo> {
    this.logger.verbose("deleteDocument(@id)", id);
    const createdAtUtcIso = new Date().toISOString();

    if (signal?.aborted) {
      throw new AbortError();
    }

    let action = deleteDocumentAction(id);

    // Sign action if signer is provided
    if (signer) {
      action = await signAction(action, signer, signal);
    }

    const job: Job = {
      id: uuidv4(),
      kind: "mutation",
      documentId: id,
      scope: "document",
      branch: "main",
      actions: [action],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
      meta,
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
      meta,
    };
    this.jobTracker.registerJob(jobInfo);

    await this.queue.enqueue(job);

    return jobInfo;
  }

  /**
   * Applies a list of actions to a document
   */
  async execute(
    docId: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "execute(@docId, @branch, @actions)",
      docId,
      branch,
      actions,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    const createdAtUtcIso = new Date().toISOString();

    // Determine scope from first action (all actions should have the same scope)
    const scope = actions.length > 0 ? actions[0].scope || "global" : "global";

    // Create a single job with all actions
    const job: Job = {
      id: uuidv4(),
      kind: "mutation",
      documentId: docId,
      scope: scope,
      branch: branch,
      actions: actions,
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
      meta,
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
      meta,
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
   * Imports pre-existing operations that were produced by another reactor.
   * This function may cause a reshuffle, which will generate additional
   * operations.
   */
  async load(
    docId: string,
    branch: string,
    operations: Operation[],
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "load(@docId, @branch, @count, @operations)",
      docId,
      branch,
      operations.length,
      operations,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    if (operations.length === 0) {
      throw new Error("load requires at least one operation");
    }

    // validate the operations
    const scope = getSharedScope(operations);
    operations.forEach((operation, index) => {
      if (!operation.timestampUtcMs) {
        throw new Error(
          `Operation at position ${index} is missing timestampUtcMs`,
        );
      }
    });

    const createdAtUtcIso = new Date().toISOString();
    const job: Job = {
      id: uuidv4(),
      kind: "load",
      documentId: docId,
      scope,
      branch,
      actions: [],
      operations,
      createdAt: createdAtUtcIso,
      queueHint: [],
      maxRetries: 3,
      errorHistory: [],
      meta,
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
      meta,
    };
    this.jobTracker.registerJob(jobInfo);

    await this.queue.enqueue(job);

    if (signal?.aborted) {
      throw new AbortError();
    }

    return jobInfo;
  }

  /**
   * Applies multiple mutations across documents with dependency management
   */
  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<BatchExecutionResult> {
    this.logger.verbose("executeBatch(@count jobs)", request.jobs.length);

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
        meta,
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
          kind: "mutation",
          documentId: jobPlan.documentId,
          scope: jobPlan.scope,
          branch: jobPlan.branch,
          actions: jobPlan.actions,
          operations: [],
          createdAt: createdAtUtcIso,
          queueHint,
          maxRetries: 3,
          errorHistory: [],
          meta,
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
    const result: BatchExecutionResult = {
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
    branch: string = "main",
    signer?: ISigner,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "addChildren(@parentId, @count children, @branch)",
      parentId,
      documentIds.length,
      branch,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    let actions: Action[] = documentIds.map((childId) =>
      addRelationshipAction(parentId, childId, "child"),
    );

    // Sign actions if signer is provided
    if (signer) {
      actions = await signActions(actions, signer, signal);
    }

    return await this.execute(parentId, branch, actions, signal);
  }

  /**
   * Removes multiple documents as children from another
   */
  async removeChildren(
    parentId: string,
    documentIds: string[],
    branch: string = "main",
    signer?: ISigner,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    this.logger.verbose(
      "removeChildren(@parentId, @count children, @branch)",
      parentId,
      documentIds.length,
      branch,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    let actions: Action[] = documentIds.map((childId) =>
      removeRelationshipAction(parentId, childId, "child"),
    );

    // Sign actions if signer is provided
    if (signer) {
      actions = await signActions(actions, signer, signal);
    }

    return await this.execute(parentId, branch, actions, signal);
  }

  /**
   * Retrieves the status of a job
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    this.logger.verbose("getJobStatus(@jobId)", jobId);

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
    this.logger.verbose("findByIds(@count ids)", ids.length);

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
          document = await this.documentStorage.get<PHDocument>(
            id,
            consistencyToken,
            signal,
          );
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

      // totalCount reflects successfully fetched documents, not input array size
      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        totalCount: documents.length,
        next: hasMore
          ? () =>
              this.findByIds(
                ids,
                view,
                { cursor: nextCursor!, limit },
                consistencyToken,
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

      // totalCount reflects successfully fetched documents, not input array size
      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        totalCount: documents.length,
        next: hasMore
          ? () =>
              this.findByIds(
                ids,
                view,
                { cursor: nextCursor!, limit },
                consistencyToken,
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
    this.logger.verbose("findBySlugs(@count slugs)", slugs.length);

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
        ids = await this.documentStorage.resolveIds(
          slugs,
          consistencyToken,
          signal,
        );
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
          document = await this.documentStorage.get<PHDocument>(
            id,
            consistencyToken,
            signal,
          );
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

      // totalCount reflects successfully fetched documents, not input array size
      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        totalCount: documents.length,
        next: hasMore
          ? () =>
              this.findBySlugs(
                slugs,
                view,
                { cursor: nextCursor!, limit },
                consistencyToken,
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

      // totalCount reflects successfully fetched documents, not input array size
      return {
        results: pagedDocuments,
        options: paging || { cursor: "0", limit: documents.length },
        nextCursor,
        totalCount: documents.length,
        next: hasMore
          ? () =>
              this.findBySlugs(
                slugs,
                view,
                { cursor: nextCursor!, limit },
                consistencyToken,
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
    this.logger.verbose("findByParentId(@parentId)", parentId);

    // Get child relationships from indexer
    const relationships = await this._documentIndexer.getOutgoing(
      parentId,
      ["child"],
      undefined,
      signal,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    const documents: PHDocument[] = [];

    // Fetch each child document using the appropriate storage method
    for (const relationship of relationships) {
      if (signal?.aborted) {
        throw new AbortError();
      }

      try {
        let document: PHDocument;
        if (this.features.legacyStorageEnabled) {
          document = await this.documentStorage.get<PHDocument>(
            relationship.targetId,
          );

          // Apply view filter for legacy storage
          for (const scope in document.state) {
            if (!matchesScope(view, scope)) {
              delete document.state[scope as keyof PHBaseState];
            }
          }
        } else {
          document = await this.documentView.get<PHDocument>(
            relationship.targetId,
            view,
            undefined,
            signal,
          );
        }
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
      totalCount: documents.length,
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
    this.logger.verbose("findByType(@type)", type);

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
        await this.documentStorage.findByType(
          type,
          limit,
          cursor,
          consistencyToken,
          signal,
        );

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
          document = await this.documentStorage.get<PHDocument>(
            documentId,
            consistencyToken,
            signal,
          );
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
        totalCount: undefined, // Legacy storage doesn't provide total count
        next: nextCursor
          ? async () =>
              this.findByType(
                type,
                view,
                { cursor: nextCursor, limit },
                consistencyToken,
                signal,
              )
          : undefined,
      };
    } else {
      const result = await this.documentView.findByType(
        type,
        view,
        paging,
        consistencyToken,
        signal,
      );

      if (signal?.aborted) {
        throw new AbortError();
      }

      const cursor = paging?.cursor;
      const limit = paging?.limit || 100;

      // documentView.findByType returns storage/interfaces.PagedResults (with 'items')
      // Convert to shared/types.PagedResults (with 'results')
      return {
        results: result.items,
        options: paging || { cursor: cursor || "0", limit },
        nextCursor: result.nextCursor,
        totalCount: result.totalCount,
        next: result.nextCursor
          ? async () =>
              this.findByType(
                type,
                view,
                { cursor: result.nextCursor!, limit },
                consistencyToken,
                signal,
              )
          : undefined,
      };
    }
  }
}
