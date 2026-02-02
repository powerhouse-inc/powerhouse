import {
  addRelationshipAction,
  createDocumentAction,
  deleteDocumentAction,
  removeRelationshipAction,
  upgradeDocumentAction,
} from "#actions/index.js";
import type { ILogger } from "#logging/types.js";
import { AbortError } from "document-drive";
import type {
  Action,
  CreateDocumentActionInput,
  DocumentModelModule,
  ISigner,
  Operation,
  PHDocument,
} from "document-model";
import { v4 as uuidv4 } from "uuid";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobPendingEvent } from "../events/types.js";
import type { IJobExecutorManager } from "../executor/interfaces.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import type { IReadModelCoordinator } from "../read-models/interfaces.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
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
  IDocumentIndexer,
  IDocumentView,
  IOperationStore,
  OperationFilter,
} from "../storage/interfaces.js";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  IReactor,
  ReactorFeatures,
} from "./types.js";
import {
  filterByType,
  getSharedActionScope,
  getSharedOperationScope,
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
  private documentModelRegistry: IDocumentModelRegistry;
  private shutdownStatus: ShutdownStatus;
  private setShutdown: (value: boolean) => void;
  private setCompleted: (completed: Promise<void>) => void;
  private queue: IQueue;
  private jobTracker: IJobTracker;
  private readModelCoordinator: IReadModelCoordinator;
  private features: ReactorFeatures;
  private documentView: IDocumentView;
  private documentIndexer: IDocumentIndexer;
  private operationStore: IOperationStore;
  private eventBus: IEventBus;
  private executorManager: IJobExecutorManager;

  constructor(
    logger: ILogger,
    documentModelRegistry: IDocumentModelRegistry,
    queue: IQueue,
    jobTracker: IJobTracker,
    readModelCoordinator: IReadModelCoordinator,
    features: ReactorFeatures,
    documentView: IDocumentView,
    documentIndexer: IDocumentIndexer,
    operationStore: IOperationStore,
    eventBus: IEventBus,
    executorManager: IJobExecutorManager,
  ) {
    this.logger = logger;
    this.documentModelRegistry = documentModelRegistry;
    this.queue = queue;
    this.jobTracker = jobTracker;
    this.readModelCoordinator = readModelCoordinator;
    this.features = features;
    this.documentView = documentView;
    this.documentIndexer = documentIndexer;
    this.operationStore = operationStore;
    this.eventBus = eventBus;
    this.executorManager = executorManager;

    const [status, setShutdown, setCompleted] =
      createMutableShutdownStatus(false);
    this.shutdownStatus = status;
    this.setShutdown = setShutdown;
    this.setCompleted = setCompleted;

    this.readModelCoordinator.start();
  }

  kill(): ShutdownStatus {
    this.logger.verbose("kill()");

    if (this.shutdownStatus.isShutdown) {
      return this.shutdownStatus;
    }

    this.setShutdown(true);

    const shutdownAsync = async () => {
      await this.executorManager.stop(true);

      this.readModelCoordinator.stop();
      this.jobTracker.shutdown();
    };

    this.setCompleted(shutdownAsync());

    return this.shutdownStatus;
  }

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

    if (signal?.aborted) {
      throw new AbortError();
    }

    const modules = this.documentModelRegistry.getAllModules();
    const filteredModels = modules.filter(
      (module: DocumentModelModule) =>
        !namespace || module.documentModel.global.id.startsWith(namespace),
    );

    const startIndex = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || filteredModels.length;
    const pagedModels = filteredModels.slice(startIndex, startIndex + limit);

    const hasMore = startIndex + limit < filteredModels.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

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

  async get<TDocument extends PHDocument>(
    id: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose("get(@id, @view)", id, view);

    return await this.documentView.get<TDocument>(
      id,
      view,
      consistencyToken,
      signal,
    );
  }

  async getBySlug<TDocument extends PHDocument>(
    slug: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose("getBySlug(@slug, @view)", slug, view);

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

  async getByIdOrSlug<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose("getByIdOrSlug(@identifier, @view)", identifier, view);

    return await this.documentView.getByIdOrSlug<TDocument>(
      identifier,
      view,
      consistencyToken,
      signal,
    );
  }

  async getChildren(
    documentId: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const relationships = await this.documentIndexer.getOutgoing(
      documentId,
      ["child"],
      undefined,
      consistencyToken,
      signal,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    return relationships.results.map((rel) => rel.targetId);
  }

  async getParents(
    childId: string,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const relationships = await this.documentIndexer.getIncoming(
      childId,
      ["parent"],
      undefined,
      consistencyToken,
      signal,
    );

    if (signal?.aborted) {
      throw new AbortError();
    }

    return relationships.results.map((rel) => rel.sourceId);
  }

  async getOperations(
    documentId: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<Record<string, PagedResults<Operation>>> {
    this.logger.verbose(
      "getOperations(@documentId, @view, @filter, @paging)",
      documentId,
      view,
      filter,
      paging,
    );

    const branch = view?.branch || "main";

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

    for (const scope of allScopes) {
      if (!matchesScope(view, scope)) {
        continue;
      }

      if (signal?.aborted) {
        throw new AbortError();
      }

      const scopeResult = await this.operationStore.getSince(
        documentId,
        scope,
        branch,
        -1,
        filter,
        paging,
        signal,
      );

      result[scope] = {
        results: scopeResult.results,
        options: scopeResult.options,
        nextCursor: scopeResult.nextCursor,
        next: scopeResult.next
          ? async () => {
              const nextPage = await this.getOperations(
                documentId,
                view,
                filter,
                {
                  cursor: scopeResult.nextCursor!,
                  limit: scopeResult.options.limit,
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
        consistencyToken,
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
      toVersion: document.state.document.version,
      initialState: document.state,
    });

    let actions: Action[] = [createAction, upgradeAction];
    if (signer) {
      actions = await signActions(actions, signer, signal);
    }

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
    this.emitJobPending(jobInfo.id, meta);

    await this.queue.enqueue(job);

    return jobInfo;
  }

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
    this.emitJobPending(jobInfo.id, meta);

    await this.queue.enqueue(job);

    return jobInfo;
  }

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
    const scope = getSharedActionScope(actions);

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
    this.emitJobPending(jobInfo.id, meta);

    await this.queue.enqueue(job);

    if (signal?.aborted) {
      throw new AbortError();
    }

    return jobInfo;
  }

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

    const scope = getSharedOperationScope(operations);
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
    this.emitJobPending(jobInfo.id, meta);

    await this.queue.enqueue(job);

    if (signal?.aborted) {
      throw new AbortError();
    }

    return jobInfo;
  }

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
      this.emitJobPending(jobInfo.id, meta);
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

    if (signer) {
      actions = await signActions(actions, signer, signal);
    }

    return await this.execute(parentId, branch, actions, signal);
  }

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

    if (signer) {
      actions = await signActions(actions, signer, signal);
    }

    return await this.execute(parentId, branch, actions, signal);
  }

  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    this.logger.verbose("getJobStatus(@jobId)", jobId);

    if (signal?.aborted) {
      throw new AbortError();
    }

    const jobInfo = this.jobTracker.getJobStatus(jobId);

    if (!jobInfo) {
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

  private async findByIds(
    ids: string[],
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose("findByIds(@count ids)", ids.length);

    const startIndex = paging?.cursor ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || ids.length;
    const pagedIds = ids.slice(startIndex, startIndex + limit);

    const results = await this.documentView.getMany<PHDocument>(
      pagedIds,
      view,
      consistencyToken,
      signal,
    );

    const hasMore = startIndex + limit < ids.length;
    const nextCursor = hasMore ? String(startIndex + limit) : undefined;

    return {
      results,
      options: paging || { cursor: "0", limit: ids.length },
      nextCursor,
    };
  }

  private async findBySlugs(
    slugs: string[],
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose("findBySlugs(@count slugs)", slugs.length);

    const ids = await this.documentView.resolveSlugs(
      slugs,
      view,
      consistencyToken,
      signal,
    );

    return await this.findByIds(ids, view, paging, consistencyToken, signal);
  }

  private async findByParentId(
    parentId: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose("findByParentId(@parentId)", parentId);

    const relationships = await this.documentIndexer.getOutgoing(
      parentId,
      ["child"],
      paging,
      consistencyToken,
      signal,
    );

    const ids = relationships.results.map((rel) => rel.targetId);
    return await this.findByIds(ids, view, paging, undefined, signal);
  }

  private async findByType(
    type: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    consistencyToken?: ConsistencyToken,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose("findByType(@type)", type);

    return await this.documentView.findByType(
      type,
      view,
      paging,
      consistencyToken,
      signal,
    );
  }

  private emitJobPending(jobId: string, meta?: Record<string, unknown>): void {
    const event: JobPendingEvent = {
      jobId,
      jobMeta: meta,
    };
    this.eventBus.emit(ReactorEventTypes.JOB_PENDING, event).catch(() => {
      // Ignore event emission errors
    });
  }
}
