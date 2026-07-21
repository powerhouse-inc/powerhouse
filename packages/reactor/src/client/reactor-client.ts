import type {
  Action,
  AuthSubject,
  CreateDocumentActionInput,
  DocumentModelModule,
  ISigner,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { actions } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  addRelationshipAction,
  createDocumentAction,
  upgradeDocumentAction,
} from "../actions/index.js";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  ExecutionJobPlan,
  IReactor,
} from "../core/types.js";
import { getSharedActionScope, signActions } from "../core/utils.js";
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
import type {
  IDocumentIndexer,
  IDocumentView,
  OperationFilter,
} from "../storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import {
  decodeCompositeCursor,
  encodeCompositeCursor,
  isCompositeCursor,
} from "./cursor.js";
import { DriveClient } from "./drive-client.js";
import {
  DocumentChangeType,
  type CreateDocumentOptions,
  type DocumentChangeEvent,
  type IDriveClient,
  type IReactorClient,
} from "./types.js";
import {
  authSubjectFromSigner,
  canReadScope,
  filterReadableScopes,
  withAuthScope,
} from "./util.js";

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
  private documentView: IDocumentView;

  readonly drives: IDriveClient;

  constructor(
    logger: ILogger,
    reactor: IReactor,
    signer: ISigner,
    subscriptionManager: IReactorSubscriptionManager,
    jobAwaiter: IJobAwaiter,
    documentIndexer: IDocumentIndexer,
    documentView: IDocumentView,
  ) {
    this.logger = logger;
    this.reactor = reactor;
    this.signer = signer;
    this.subscriptionManager = subscriptionManager;
    this.jobAwaiter = jobAwaiter;
    this.documentIndexer = documentIndexer;
    this.documentView = documentView;
    this.drives = new DriveClient(this, logger, reactor, signer);
    this.logger.verbose("ReactorClient initialized");
  }

  private readSubject(subject?: AuthSubject): AuthSubject {
    return subject ?? authSubjectFromSigner(this.signer);
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
  ): Promise<TDocument> {
    this.logger.verbose("get(@identifier, @view)", identifier, view);
    const document = await this.reactor.getByIdOrSlug<TDocument>(
      identifier,
      withAuthScope(view),
      undefined,
      signal,
    );
    return filterReadableScopes(document, this.readSubject(view?.subject));
  }

  /**
   * Resolves an identifier (id or slug) to the canonical document id, using the
   * same lookup as the data path. Resolves against the "main" branch. Throws if
   * the identifier cannot be resolved or is ambiguous.
   */
  async resolveIdOrSlug(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.documentView.resolveIdOrSlug(
      identifier,
      undefined,
      undefined,
      signal,
    );
  }

  /**
   * Retrieves operations for a document
   */
  async getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    this.logger.verbose(
      "getOperations(@documentIdentifier, @view, @filter, @paging)",
      documentIdentifier,
      view,
      filter,
      paging,
    );

    const documentId = await this.documentView.resolveIdOrSlug(
      documentIdentifier,
      view,
      undefined,
      signal,
    );

    // Read gate: exclude operations in scopes the subject may not read.
    const authDoc = (await this.reactor.getByIdOrSlug(
      documentId,
      { scopes: ["auth"] },
      undefined,
      signal,
    )) as PHDocument | undefined;
    const subject = this.readSubject(view?.subject);
    const canRead = (scope: string) =>
      canReadScope(authDoc?.state.auth, subject, scope);

    if (paging?.cursor && isCompositeCursor(paging.cursor)) {
      return this.getOperationsWithCompositeCursor(
        documentId,
        view,
        filter,
        paging,
        signal,
        canRead,
      );
    }

    const operationsByScope = await this.reactor.getOperations(
      documentId,
      view,
      filter,
      paging,
      undefined,
      signal,
    );

    for (const scope of Object.keys(operationsByScope)) {
      if (!canRead(scope)) {
        delete operationsByScope[scope];
      }
    }

    const scopeEntries = Object.entries(operationsByScope);
    const effectivePaging = paging || { cursor: "0", limit: 100 };

    if (scopeEntries.length <= 1) {
      const allOperations =
        scopeEntries.length === 1 ? [...scopeEntries[0][1].results] : [];
      allOperations.sort((a, b) => a.index - b.index);
      const nextCursor =
        scopeEntries.length === 1 ? scopeEntries[0][1].nextCursor : undefined;
      return { results: allOperations, options: effectivePaging, nextCursor };
    }

    const allOperations: Operation[] = [];
    const activeCursors: Record<string, string> = {};

    for (const [scopeName, scopeResults] of scopeEntries) {
      allOperations.push(...scopeResults.results);
      if (scopeResults.nextCursor) {
        activeCursors[scopeName] = scopeResults.nextCursor;
      }
    }

    allOperations.sort((a, b) => a.index - b.index);

    const nextCursor =
      Object.keys(activeCursors).length > 0
        ? encodeCompositeCursor(activeCursors)
        : undefined;

    return { results: allOperations, options: effectivePaging, nextCursor };
  }

  private async getOperationsWithCompositeCursor(
    documentId: string,
    view: ViewFilter | undefined,
    filter: OperationFilter | undefined,
    paging: PagingOptions,
    signal: AbortSignal | undefined,
    canRead: (scope: string) => boolean,
  ): Promise<PagedResults<Operation>> {
    const scopeCursors = decodeCompositeCursor(paging.cursor);
    const allOperations: Operation[] = [];
    const activeCursors: Record<string, string> = {};

    for (const [scopeName, cursor] of Object.entries(scopeCursors)) {
      if (!canRead(scopeName)) {
        continue;
      }
      const scopeView: ViewFilter = { ...view, scopes: [scopeName] };
      const scopePaging: PagingOptions = { cursor, limit: paging.limit };

      const operationsByScope = await this.reactor.getOperations(
        documentId,
        scopeView,
        filter,
        scopePaging,
        undefined,
        signal,
      );

      const scopeResult = operationsByScope[scopeName];
      allOperations.push(...scopeResult.results);
      if (scopeResult.nextCursor) {
        activeCursors[scopeName] = scopeResult.nextCursor;
      }
    }

    allOperations.sort((a, b) => a.index - b.index);

    const nextCursor =
      Object.keys(activeCursors).length > 0
        ? encodeCompositeCursor(activeCursors)
        : undefined;

    return { results: allOperations, options: paging, nextCursor };
  }

  /**
   * Retrieves outgoing relationships of a given type from a source document.
   */
  async getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose(
      "getOutgoingRelationships(@sourceIdentifier, @relationshipType, @view, @paging)",
      sourceIdentifier,
      relationshipType,
      view,
      paging,
    );

    const sourceId = await this.documentView.resolveIdOrSlug(
      sourceIdentifier,
      view,
      undefined,
      signal,
    );

    const relationships = await this.documentIndexer.getOutgoing(
      sourceId,
      [relationshipType],
      undefined,
      undefined,
      signal,
    );

    const targetIds = relationships.results.map((rel) => rel.targetId);

    if (targetIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.find({ ids: targetIds }, view, paging, signal);
  }

  /**
   * Retrieves incoming relationships of a given type to a target document.
   */
  async getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    this.logger.verbose(
      "getIncomingRelationships(@targetIdentifier, @relationshipType, @view, @paging)",
      targetIdentifier,
      relationshipType,
      view,
      paging,
    );

    const targetId = await this.documentView.resolveIdOrSlug(
      targetIdentifier,
      view,
      undefined,
      signal,
    );

    const relationships = await this.documentIndexer.getIncoming(
      targetId,
      [relationshipType],
      undefined,
      undefined,
      signal,
    );

    const sourceIds = relationships.results.map((rel) => rel.sourceId);

    if (sourceIds.length === 0) {
      return {
        results: [],
        options: paging || { cursor: "0", limit: 0 },
      };
    }

    return this.find({ ids: sourceIds }, view, paging, signal);
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
    const results = await this.reactor.find(
      search,
      withAuthScope(view),
      paging,
      undefined,
      signal,
    );
    const readSubject = this.readSubject(view?.subject);
    return {
      ...results,
      results: results.results.map((doc) =>
        filterReadableScopes(doc, readSubject),
      ),
    };
  }

  /**
   * Creates a document and waits for completion
   */
  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "create(@id, @parentIdentifier)",
      document.header.id,
      parentIdentifier,
    );

    const documentId = document.header.id;

    const createInput: CreateDocumentActionInput = {
      model: document.header.documentType,
      version: 0,
      documentId,
      signing: {
        signature: documentId,
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

    const createActions: Action[] = await signActions(
      [
        createDocumentAction(createInput),
        upgradeDocumentAction({
          documentId,
          model: document.header.documentType,
          fromVersion: 0,
          toVersion: document.state.document.version,
          initialState: document.state,
        }),
      ],
      this.signer,
      signal,
    );

    const jobs: ExecutionJobPlan[] = [
      {
        key: "create",
        documentId,
        scope: getSharedActionScope(createActions),
        branch: "main",
        actions: createActions,
        dependsOn: [],
      },
    ];

    if (parentIdentifier) {
      const parentActions: Action[] = await signActions(
        [addRelationshipAction(parentIdentifier, documentId, "child")],
        this.signer,
        signal,
      );

      jobs.push({
        key: "parent",
        documentId: parentIdentifier,
        scope: getSharedActionScope(parentActions),
        branch: "main",
        actions: parentActions,
        dependsOn: ["create"],
      });
    }

    const batchResult = await this.reactor.executeBatch({ jobs }, signal);

    const completedJobs = await Promise.all(
      Object.values(batchResult.jobs).map((job) =>
        this.waitForJob(job, signal),
      ),
    );

    for (const job of completedJobs) {
      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error?.message);
      }
    }

    return await this.reactor.get<TDocument>(documentId);
  }

  /**
   * Creates an empty document and waits for completion
   */
  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "createEmpty(@documentModelType, @options)",
      documentModelType,
      options,
    );
    const modulesResult = await this.reactor.getDocumentModels(
      undefined,
      undefined,
      signal,
    );

    const matchingModules = modulesResult.results.filter(
      (m) => m.documentModel.global.id === documentModelType,
    );

    let module: DocumentModelModule | undefined;
    if (options?.documentModelVersion !== undefined) {
      module = matchingModules.find(
        (m) => m.version === options.documentModelVersion,
      );
      if (!module) {
        throw new Error(
          `Document model not found for type: ${documentModelType} with version: ${options.documentModelVersion}`,
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
        throw new Error(
          `Document model not found for type: ${documentModelType}`,
        );
      }
    }

    const document = module.utils.createDocument();
    document.state.document.version = module.version ?? 1;

    return this.create<TDocument>(document, options?.parentIdentifier, signal);
  }

  /**
   * Creates an empty document in a drive as a single batched operation.
   * Delegates to {@link IDriveClient.addFile}.
   *
   * @deprecated Use `client.drives.addFile` instead. This method will be
   * removed in a future release.
   */
  async createDocumentInDrive<TDocument extends PHDocument>(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.drives.addFile<TDocument>(
      driveId,
      document,
      parentFolder,
      signal,
    );
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
    return result;
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

  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    this.logger.verbose("executeBatch(@count jobs)", request.jobs.length);

    const signedJobs: ExecutionJobPlan[] = await Promise.all(
      request.jobs.map(async (job) => ({
        ...job,
        actions: await signActions(job.actions, this.signer, signal),
      })),
    );

    const batchResult = await this.reactor.executeBatch(
      { jobs: signedJobs },
      signal,
    );

    const completedJobs = await Promise.all(
      Object.values(batchResult.jobs).map((job) =>
        this.waitForJob(job, signal),
      ),
    );

    for (const job of completedJobs) {
      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error?.message);
      }
    }

    return batchResult;
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
   * Updates the preferred editor recorded in the document header meta.
   * Pass `null` to clear it.
   */
  async setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "setPreferredEditor(@documentIdentifier, @preferredEditor, @branch)",
      documentIdentifier,
      preferredEditor,
      branch,
    );
    return this.execute(
      documentIdentifier,
      branch,
      [actions.setPreferredEditor(preferredEditor)],
      signal,
    );
  }

  /**
   * Adds multiple documents as children to another and waits for completion
   */
  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "addRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const jobInfo = await this.reactor.addRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const result = await this.reactor.getByIdOrSlug<PHDocument>(
      sourceIdentifier,
      { branch },
      completedJob.consistencyToken,
      signal,
    );
    return result;
  }

  /**
   * Removes a relationship between two documents and waits for completion.
   */
  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "removeRelationship(@sourceIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const jobInfo = await this.reactor.removeRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const completedJob = await this.waitForJob(jobInfo, signal);

    if (completedJob.status === JobStatus.FAILED) {
      throw new Error(completedJob.error?.message);
    }

    const result = await this.reactor.getByIdOrSlug<PHDocument>(
      sourceIdentifier,
      { branch },
      completedJob.consistencyToken,
      signal,
    );
    return result;
  }

  /**
   * Moves a relationship from one source document to another and waits for completion.
   */
  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<{
    source: PHDocument;
    target: PHDocument;
  }> {
    this.logger.verbose(
      "moveRelationship(@sourceParentIdentifier, @targetParentIdentifier, @targetIdentifier, @relationshipType, @branch)",
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
    );
    const removeJobInfo = await this.reactor.removeRelationship(
      sourceParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      this.signer,
      signal,
    );

    const removeCompletedJob = await this.waitForJob(removeJobInfo, signal);

    if (removeCompletedJob.status === JobStatus.FAILED) {
      throw new Error(removeCompletedJob.error?.message);
    }

    const addJobInfo = await this.reactor.addRelationship(
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
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
      source: sourceResult,
      target: targetResult,
    };
  }

  async loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    this.logger.verbose("loadBatch(@count jobs)", request.jobs.length);
    const result = await this.reactor.loadBatch(request, signal);

    const completedJobs = await Promise.all(
      Object.entries(result.jobs).map(async ([key, jobInfo]) => {
        const completed = await this.waitForJob(jobInfo, signal);
        return [key, completed] as const;
      }),
    );

    for (const [, completedJob] of completedJobs) {
      if (completedJob.status === JobStatus.FAILED) {
        throw new Error(completedJob.error?.message);
      }
    }

    return { jobs: Object.fromEntries(completedJobs) };
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
      const toDelete = new Set([identifier]);
      let changed = true;

      while (changed) {
        if (signal?.aborted) {
          throw new Error("Operation aborted");
        }
        changed = false;
        const orphans = await this.documentIndexer.getOrphanedChildren(
          [...toDelete],
          ["child"],
          signal,
        );
        for (const id of orphans) {
          if (!toDelete.has(id)) {
            toDelete.add(id);
            changed = true;
          }
        }
      }

      for (const descendantId of toDelete) {
        if (descendantId === identifier) {
          continue;
        }
        const removalJobs = await this.removeAllIncomingRelationships(
          descendantId,
          signal,
        );
        jobs.push(...removalJobs);

        const jobInfo = await this.reactor.deleteDocument(
          descendantId,
          this.signer,
          signal,
        );
        jobs.push(jobInfo);
      }
    }

    const removalJobs = await this.removeAllIncomingRelationships(
      identifier,
      signal,
    );
    jobs.push(...removalJobs);

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
                this.reactor.get(id, view, undefined, undefined),
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

  private async removeAllIncomingRelationships(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<JobInfo[]> {
    const incoming = await this.documentIndexer.getIncoming(
      documentId,
      undefined,
      undefined,
      undefined,
      signal,
    );

    const jobs: JobInfo[] = [];
    for (const rel of incoming.results) {
      const jobInfo = await this.reactor.removeRelationship(
        rel.sourceId,
        documentId,
        rel.relationshipType,
        "main",
        this.signer,
        signal,
      );
      jobs.push(jobInfo);
    }
    return jobs;
  }
}
