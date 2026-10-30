import {
  warnOnce,
  type ActionCandidate,
  type ActionEvaluations,
  type BatchExecutionRequest,
  type BatchExecutionResult,
  type BatchLoadRequest,
  type BatchLoadResult,
  type ConsistencyToken,
  type CreateProtocolVersionsOptions,
  type DocumentChangeEvent,
  type DocumentRelationship,
  type IReactorClient,
  type JobInfo,
  type NewDocumentOptions,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type SearchFilter,
  type UndoRedoAvailability,
  type UndoRedoTargets,
  type UpgradeDocumentOptions,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  Operation,
  PHDocument,
  ProtocolVersions,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import { RouterBackend, type RoutableBackendConfig } from "./backend.js";
import { RouteDispatcher } from "./dispatcher.js";
import { UnsignedSigner, type RoutingContext } from "./routing-context.js";
import { BackendDrives, RoutingDriveClient } from "./routing-drive-client.js";
import { RoutingReadClient } from "./routing-read-client.js";
import { RoutingWriteClient } from "./routing-write-client.js";
import {
  DEFAULT_SUBSCRIPTION_DEDUP_SIZE,
  type RouterTableSnapshot,
  type RoutingChangeListener,
  type RoutingOptions,
} from "./types.js";

export type RoutingClientOptions = RoutingOptions & {
  readonly logger?: ILogger;
};

/** What each deprecated facade write points at, for its one-time warning. */
const DEPRECATED_WRITES = {
  create:
    "Use write.create(...), then handle.document() or read.get(receipt.documentId, view, signal, receipt.token).",
  createEmpty:
    "Use write.createEmpty(...), then handle.document() or read.get(receipt.documentId, view, signal, receipt.token).",
  upgradeDocument: "Use write.upgradeDocument(...), then handle.document().",
  createDocumentInDrive:
    "Use write.drives.addFile(...), then handle.document().",
  execute:
    "Use write.execute(...), then handle.document(view) or read.get(receipt.documentId, view, signal, receipt.token).",
  executeBatch: "Use write.executeBatch(...) and await batch.readable.",
  rename:
    "Use write.rename(...); read back with handle.document() only if the document is needed.",
  setPreferredEditor:
    "Use write.setPreferredEditor(...); read back with handle.document() only if the document is needed.",
  addRelationship:
    "Use write.addRelationship(...), then handle.document() for the source.",
  updateRelationship:
    "Use write.updateRelationship(...), then handle.document() for the source.",
  removeRelationship:
    "Use write.removeRelationship(...), then handle.document() for the source.",
  moveRelationship:
    "Use write.moveRelationship(...), then removed.document() and added.document().",
  deleteDocument: "Use write.deleteDocument(...) and await handle.readable.",
  deleteDocuments:
    "Use write.deleteDocuments(...) and await each handle's readable.",
  loadBatch: "Use write.loadBatch(...).",
} as const;

/**
 * One IReactorClient over many backends; spanning writes are refused.
 *
 * It is the facade over {@link RoutingReadClient} and
 * {@link RoutingWriteClient}, which share one route dispatcher: every read is
 * the read half's, and every write that returns a document is the write
 * half's, then `handle.document()`, with the same one-time deprecation warning
 * as the reactor's own facade.
 *
 * executeAsync, createAsync and createEmptyAsync submit through a backend's
 * `submit` and do not wait. On a backend without `submit` they fall back to
 * executeBatch, which waits for the jobs: they then return each job's terminal
 * state, a failed job carried by a BatchJobFailedError as its FAILED JobInfo,
 * and rethrow a failure that carries no job.
 */
export class RoutingReactorClient implements IReactorClient {
  readonly read: RoutingReadClient;
  readonly write: RoutingWriteClient;
  readonly drives: RoutingDriveClient;
  private readonly dispatcher: RouteDispatcher;
  private readonly logger: ILogger;

  constructor(
    backends: readonly RoutableBackendConfig[],
    options: RoutingClientOptions = {},
  ) {
    this.dispatcher = new RouteDispatcher(
      backends.map((config) => new RouterBackend(config)),
      options,
    );
    this.logger = options.logger ?? childLogger(["reactor-router"]);
    const signer = options.signer ?? new UnsignedSigner();
    const registry = options.documentModelModules;
    const context: RoutingContext = {
      dispatcher: this.dispatcher,
      signer,
      logger: this.logger,
      modules:
        typeof registry === "function"
          ? registry
          : registry && ((): readonly DocumentModelModule[] => registry),
      dedupSize:
        options.subscriptionDedupSize ?? DEFAULT_SUBSCRIPTION_DEDUP_SIZE,
      answerFailedIdCheck: options.answerFailedIdCheck,
    };
    const drives = new BackendDrives(this.logger, signer);
    this.read = new RoutingReadClient(context, drives);
    this.write = new RoutingWriteClient(context, this.read, drives);
    this.drives = new RoutingDriveClient(
      this.read.drives,
      this.write.drives,
      this.dispatcher,
    );
  }

  get backends(): readonly RouterBackend[] {
    return this.dispatcher.backends;
  }

  describeRouting(): RouterTableSnapshot {
    return this.dispatcher.table.describe();
  }

  /**
   * Places a collection (a collection key or a bare drive id, as in
   * `collections`) on a backend for this client only, above the config;
   * `undefined` removes the runtime placement. Precedence: corrected, runtime,
   * config, learned, placed. A refusal still corrects it, and a later
   * `setPlacement` for the same key replaces that correction.
   */
  setPlacement(key: string, backend: string | undefined): void {
    this.dispatcher.table.setPlacement(key, backend);
  }

  /** A late `collections` entry, below runtime; `undefined` removes it. */
  setConfiguredPlacement(key: string, backend: string | undefined): void {
    this.dispatcher.table.setConfiguredPlacement(key, backend);
  }

  /**
   * Calls `listener` whenever a collection route changes: a placement, a
   * learned or corrected route, or a route forgotten after a refusal.
   * Returns the unsubscribe.
   */
  onRoutingChange(listener: RoutingChangeListener): () => void {
    return this.dispatcher.table.onChange(listener);
  }

  /**
   * The name of the backend a call for this document would go to, by its
   * route, a probe or, for an id no backend holds, its placement; it does
   * not throw for an unknown id.
   */
  async locate(identifier: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const backend = await this.dispatcher.resolveDocumentBackend(identifier);
    signal?.throwIfAborted();
    return backend.name;
  }

  /** Re-reads the facts of the named backend, or of every backend. */
  refreshFacts(name?: string): Promise<void> {
    return this.dispatcher.refreshFacts(name);
  }

  // Reads

  getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    return this.read.getDocumentModelModules(namespace, paging, signal);
  }

  getDocumentModelModule(documentType: string): Promise<DocumentModelModule> {
    return this.read.getDocumentModelModule(documentType);
  }

  getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule> {
    return this.read.getDocumentModelModuleForDocument(document);
  }

  getCreateSignaturePolicy(): Promise<SignaturePolicy> {
    return this.read.getCreateSignaturePolicy();
  }

  getCreateProtocolVersions(
    options: CreateProtocolVersionsOptions,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    return this.read.getCreateProtocolVersions(options, signal);
  }

  newDocument<TDocument extends PHDocument = PHDocument>(
    documentModelType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.read.newDocument<TDocument>(documentModelType, options, signal);
  }

  getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument[]> {
    return this.read.getMany<TDocument>(
      documentIds,
      view,
      signal,
      consistencyToken,
    );
  }

  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument> {
    return this.read.get<TDocument>(identifier, view, signal, consistencyToken);
  }

  resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.read.resolveIdOrSlug(identifier, view, signal);
  }

  isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.write.isDocumentIdTaken(documentId, signal);
  }

  getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    return this.read.getOperations(
      documentIdentifier,
      view,
      filter,
      paging,
      signal,
    );
  }

  getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.read.getOutgoingRelationships(
      sourceIdentifier,
      relationshipType,
      view,
      paging,
      signal,
    );
  }

  getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.read.getIncomingRelationships(
      targetIdentifier,
      relationshipType,
      view,
      paging,
      signal,
    );
  }

  getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.read.getOutgoingRelationshipEdges(
      sourceIdentifier,
      relationshipType,
      view,
      paging,
      signal,
    );
  }

  getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.read.getIncomingRelationshipEdges(
      targetIdentifier,
      relationshipType,
      view,
      paging,
      signal,
    );
  }

  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.read.find(search, view, paging, signal);
  }

  isServed(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.read.isServed(identifier, view, signal);
  }

  evaluateActions(
    documentIdentifier: string,
    branch: string,
    candidates: ActionCandidate[],
    subject?: AuthSubject,
    signal?: AbortSignal,
  ): Promise<ActionEvaluations> {
    return this.write.evaluateActions(
      documentIdentifier,
      branch,
      candidates,
      subject,
      signal,
    );
  }

  // Creation

  /**
   * @deprecated Use write.create(...), then handle.document() or read.get(receipt.documentId, view, signal, receipt.token).
   */
  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    warnOnce("IReactorClient.create", DEPRECATED_WRITES.create, this.logger);
    const handle = await this.write.create(document, parentIdentifier, signal);
    return handle.document<TDocument>(undefined, signal);
  }

  createAsync(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    return this.write.submitCreate(document, parentIdentifier, signal);
  }

  /**
   * @deprecated Use write.createEmpty(...), then handle.document() or read.get(receipt.documentId, view, signal, receipt.token).
   */
  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    warnOnce(
      "IReactorClient.createEmpty",
      DEPRECATED_WRITES.createEmpty,
      this.logger,
    );
    const handle = await this.write.createEmpty(
      documentModelType,
      options,
      signal,
    );
    return handle.document<TDocument>(undefined, signal);
  }

  async createEmptyAsync(
    documentModelType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const document = await this.read.newDocument(
      documentModelType,
      options,
      signal,
    );
    return this.write.submitCreate(document, options?.parentIdentifier, signal);
  }

  /**
   * @deprecated Use write.drives.addFile(...), then handle.document(). This
   * method will be removed in a future release.
   */
  createDocumentInDrive<TDocument extends PHDocument>(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    warnOnce(
      "IReactorClient.createDocumentInDrive",
      DEPRECATED_WRITES.createDocumentInDrive,
      this.logger,
    );
    return this.drives.addFile<TDocument>(
      driveId,
      document,
      parentFolder,
      signal,
    );
  }

  // Mutations

  /**
   * @deprecated Use write.upgradeDocument(...), then handle.document().
   */
  async upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    warnOnce(
      "IReactorClient.upgradeDocument",
      DEPRECATED_WRITES.upgradeDocument,
      this.logger,
    );
    const handle = await this.write.upgradeDocument(
      documentIdentifier,
      toVersion,
      options,
      signal,
    );
    return handle.document<TDocument>(undefined, signal);
  }

  /**
   * @deprecated Use write.execute(...), then handle.document(view) or read.get(receipt.documentId, view, signal, receipt.token).
   */
  async execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    subject?: AuthSubject,
  ): Promise<TDocument> {
    warnOnce("IReactorClient.execute", DEPRECATED_WRITES.execute, this.logger);
    const handle = await this.write.execute(
      documentIdentifier,
      branch,
      actions,
      signal,
    );
    return handle.document<TDocument>(
      subject === undefined ? undefined : { subject },
      signal,
    );
  }

  executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    return this.write.submitJob(
      "executeAsync",
      documentIdentifier,
      branch,
      actions,
      signal,
    );
  }

  /**
   * Every job's document must resolve to one backend; nothing is sent otherwise.
   *
   * @deprecated Use write.executeBatch(...) and await batch.readable.
   */
  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    warnOnce(
      "IReactorClient.executeBatch",
      DEPRECATED_WRITES.executeBatch,
      this.logger,
    );
    const batch = await this.write.executeBatch(request, signal);
    await batch.readable;
    return { jobs: batch.jobs };
  }

  /** The owning backend resolves the target and signs the write. */
  async undo<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.write.undo(
      documentIdentifier,
      scope,
      branch,
      signal,
    );
    return handle.document<TDocument>(undefined, signal);
  }

  /** See {@link undo}. */
  async redo<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.write.redo(
      documentIdentifier,
      scope,
      branch,
      signal,
    );
    return handle.document<TDocument>(undefined, signal);
  }

  undoRedoTargets(
    documentIdentifier: string,
    scope?: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<UndoRedoTargets> {
    return this.write.undoRedoTargets(documentIdentifier, scope, view, signal);
  }

  undoRedoAvailability(
    documentIdentifier: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<UndoRedoAvailability> {
    return this.write.undoRedoAvailability(
      documentIdentifier,
      scope,
      branch,
      signal,
    );
  }

  /**
   * @deprecated Use write.loadBatch(...).
   */
  loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    warnOnce(
      "IReactorClient.loadBatch",
      DEPRECATED_WRITES.loadBatch,
      this.logger,
    );
    return this.write.loadBatch(request, signal);
  }

  /**
   * @deprecated Use write.rename(...); read back with handle.document() only if the document is needed.
   */
  async rename(
    documentIdentifier: string,
    name: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    warnOnce("IReactorClient.rename", DEPRECATED_WRITES.rename, this.logger);
    const handle = await this.write.rename(
      documentIdentifier,
      name,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  /**
   * @deprecated Use write.setPreferredEditor(...); read back with handle.document() only if the document is needed.
   */
  async setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    warnOnce(
      "IReactorClient.setPreferredEditor",
      DEPRECATED_WRITES.setPreferredEditor,
      this.logger,
    );
    const handle = await this.write.setPreferredEditor(
      documentIdentifier,
      preferredEditor,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  /**
   * @deprecated Use write.addRelationship(...), then handle.document() for the source.
   */
  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    warnOnce(
      "IReactorClient.addRelationship",
      DEPRECATED_WRITES.addRelationship,
      this.logger,
    );
    const handle = await this.write.addRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  /**
   * @deprecated Use write.updateRelationship(...), then handle.document() for the source.
   */
  async updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    warnOnce(
      "IReactorClient.updateRelationship",
      DEPRECATED_WRITES.updateRelationship,
      this.logger,
    );
    const handle = await this.write.updateRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  /**
   * @deprecated Use write.removeRelationship(...), then handle.document() for the source.
   */
  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    warnOnce(
      "IReactorClient.removeRelationship",
      DEPRECATED_WRITES.removeRelationship,
      this.logger,
    );
    const handle = await this.write.removeRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  /**
   * Both parents and the target share a backend: it is one write.
   *
   * @deprecated Use write.moveRelationship(...), then removed.document() and added.document().
   */
  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<{ source: PHDocument; target: PHDocument }> {
    warnOnce(
      "IReactorClient.moveRelationship",
      DEPRECATED_WRITES.moveRelationship,
      this.logger,
    );
    const moved = await this.write.moveRelationship(
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
    await moved.added.readable;
    const source = await moved.removed.document(undefined, signal);
    const target = await moved.added.document(undefined, signal);
    return { source, target };
  }

  /**
   * @deprecated Use write.deleteDocument(...) and await handle.readable.
   */
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    warnOnce(
      "IReactorClient.deleteDocument",
      DEPRECATED_WRITES.deleteDocument,
      this.logger,
    );
    const handle = await this.write.deleteDocument(
      identifier,
      propagate,
      signal,
    );
    await handle.readable;
  }

  /**
   * Every identifier must resolve to one backend; nothing is deleted otherwise.
   *
   * @deprecated Use write.deleteDocuments(...) and await each handle's readable.
   */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    warnOnce(
      "IReactorClient.deleteDocuments",
      DEPRECATED_WRITES.deleteDocuments,
      this.logger,
    );
    const handles = await this.write.deleteDocuments(
      identifiers,
      propagate,
      signal,
    );
    await Promise.all(handles.map((handle) => handle.readable));
  }

  // Jobs

  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    return this.read.getJobStatus(jobId, signal);
  }

  waitForJob(job: string | JobInfo, signal?: AbortSignal): Promise<JobInfo> {
    return this.read.waitForJob(job, signal);
  }

  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    return this.read.subscribe(search, callback, view);
  }
}

/** Builds a router and reads every backend's facts before returning it. */
export async function createRoutingClient(
  backends: readonly RoutableBackendConfig[],
  options: RoutingClientOptions = {},
): Promise<RoutingReactorClient> {
  const client = new RoutingReactorClient(backends, options);
  await client.refreshFacts();
  return client;
}
