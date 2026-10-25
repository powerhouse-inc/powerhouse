import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  ISigner,
  Operation,
  PHDocument,
  ProtocolVersions,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  DEFAULT_SIGNATURE_POLICY,
  PEER_CAPABILITIES,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  IReactor,
} from "../core/types.js";
import type { IReadGate } from "../decision/read-gate.js";
import { BareReadGate } from "../decision/read-gate.js";
import type { IJobAwaiter } from "../shared/awaiter.js";
import type {
  ConsistencyToken,
  JobInfo,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";
import type {
  DocumentRelationship,
  IDocumentIndexer,
  IDocumentView,
  OperationFilter,
} from "../storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import { DriveClient } from "./drive-client.js";
import type { ActionEvaluationConfig } from "./internal/evaluation.js";
import type { ReactorClientParts } from "./internal/parts.js";
import { ReactorReadClient } from "./read-client.js";
import type {
  ActionCandidate,
  ActionEvaluations,
  CreateDocumentOptions,
  DocumentChangeEvent,
  IDriveClient,
  IReactorClient,
  ProtocolSelection,
  UpgradeDocumentOptions,
} from "./types.js";
import { ReactorWriteClient } from "./write-client.js";

export type { ActionEvaluationConfig } from "./internal/evaluation.js";

/**
 * ReactorClient implementation that wraps lower-level APIs to provide
 * a simpler interface for document operations.
 *
 * It is the facade over {@link ReactorReadClient} and
 * {@link ReactorWriteClient}: it builds both halves from the parts it is
 * given and answers every method from one of them.
 *
 * Features:
 * - Wraps Jobs with Promises for easier async handling
 * - Manages signing of submitted Action objects
 * - Provides quality-of-life functions for common tasks
 * - Wraps subscription interface with ViewFilters
 */
export class ReactorClient implements IReactorClient {
  readonly read: ReactorReadClient;
  readonly write: ReactorWriteClient;
  readonly drives: IDriveClient;

  private readonly logger: ILogger;
  private readonly reactor: IReactor;

  constructor(
    logger: ILogger,
    reactor: IReactor,
    signer: ISigner,
    subscriptionManager: IReactorSubscriptionManager,
    jobAwaiter: IJobAwaiter,
    documentIndexer: IDocumentIndexer,
    documentView: IDocumentView,
    readGate: IReadGate = new BareReadGate(),
    actionEvaluation?: ActionEvaluationConfig,
    createSignaturePolicy: SignaturePolicy = DEFAULT_SIGNATURE_POLICY,
    protocolSelection: ProtocolSelection = {
      capabilities: PEER_CAPABILITIES,
      flags: {},
      collectionsOf: () => Promise.resolve({}),
    },
  ) {
    const parts: ReactorClientParts = {
      logger,
      reactor,
      signer,
      subscriptionManager,
      jobAwaiter,
      documentIndexer,
      documentView,
      readGate,
      actionEvaluation,
      createSignaturePolicy,
      protocolSelection,
    };
    this.logger = logger;
    this.reactor = reactor;
    this.read = new ReactorReadClient(parts);
    this.write = new ReactorWriteClient(parts, this.read);
    this.drives = new DriveClient(
      this,
      logger,
      (request, signal) => reactor.executeBatch(request, signal),
      signer,
      (id, signal) => this.write.resolveReference(id, "main", signal),
    );
    this.logger.verbose("ReactorClient initialized");
  }

  getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    return this.read.getDocumentModelModules(namespace, paging, signal);
  }

  getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>> {
    return this.read.getDocumentModelModule(documentType);
  }

  getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule<any>> {
    return this.read.getDocumentModelModuleForDocument(document);
  }

  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument> {
    return this.read.get<TDocument>(identifier, view, signal, consistencyToken);
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

  resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<string> {
    return this.read.resolveIdOrSlug(
      identifier,
      view,
      signal,
      consistencyToken,
    );
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
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<PHDocument>> {
    return this.read.getOutgoingRelationships(
      sourceIdentifier,
      relationshipType,
      view,
      paging,
      signal,
      consistencyToken,
    );
  }

  getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<PHDocument>> {
    return this.read.getIncomingRelationships(
      targetIdentifier,
      relationshipType,
      view,
      paging,
      signal,
      consistencyToken,
    );
  }

  getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.read.getOutgoingRelationshipEdges(
      sourceIdentifier,
      relationshipType,
      view,
      paging,
      signal,
      consistencyToken,
    );
  }

  getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.read.getIncomingRelationshipEdges(
      targetIdentifier,
      relationshipType,
      view,
      paging,
      signal,
      consistencyToken,
    );
  }

  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<PagedResults<PHDocument>> {
    return this.read.find(search, view, paging, signal, consistencyToken);
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

  getCreateSignaturePolicy(): Promise<SignaturePolicy> {
    return this.read.getCreateSignaturePolicy();
  }

  getCreateProtocolVersions(
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    return this.read.getCreateProtocolVersions(parentIdentifier, signal);
  }

  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.write.create(document, parentIdentifier, signal);
    return handle.document<TDocument>(undefined, signal);
  }

  createAsync(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    this.logger.verbose(
      "createAsync(@id, @parentIdentifier)",
      document.header.id,
      parentIdentifier,
    );
    return this.write.submitCreate(document, parentIdentifier, signal);
  }

  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.write.createEmpty(
      documentModelType,
      options,
      signal,
    );
    return handle.document<TDocument>(undefined, signal);
  }

  async createEmptyAsync(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    this.logger.verbose(
      "createEmptyAsync(@documentModelType, @options)",
      documentModelType,
      options,
    );
    const document = await this.write.emptyDocument(
      documentModelType,
      options,
      signal,
    );
    return this.write.submitCreate(document, options?.parentIdentifier, signal);
  }

  async upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.write.upgradeDocument(
      documentIdentifier,
      toVersion,
      options,
      signal,
    );
    return handle.document<TDocument>(undefined, signal);
  }

  /**
   * Creates an empty document in a drive as a single batched operation.
   * Delegates to {@link IDriveClient.addFile}.
   *
   * @deprecated Use `client.drives.addFile` instead. This method will be
   * removed in a future release.
   */
  createDocumentInDrive<TDocument extends PHDocument>(
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

  async execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    subject?: AuthSubject,
  ): Promise<TDocument> {
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
    const submitted = await this.write.submitExecute(
      documentIdentifier,
      branch,
      actions,
      signal,
    );
    return submitted.job;
  }

  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const batch = await this.write.executeBatch(request, signal);
    await batch.readable;
    return { jobs: batch.jobs };
  }

  async rename(
    documentIdentifier: string,
    name: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const handle = await this.write.rename(
      documentIdentifier,
      name,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  async setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const handle = await this.write.setPreferredEditor(
      documentIdentifier,
      preferredEditor,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
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

  async updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
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

  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    const handle = await this.write.removeRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
    return handle.document(undefined, signal);
  }

  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<{
    source: PHDocument;
    target: PHDocument;
  }> {
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

  loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    return this.write.loadBatch(request, signal);
  }

  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    const handle = await this.write.deleteDocument(
      identifier,
      propagate,
      signal,
    );
    await handle.readable;
  }

  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    const handles = await this.write.deleteDocuments(
      identifiers,
      propagate,
      signal,
    );
    await Promise.all(handles.map((handle) => handle.readable));
  }

  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    return this.read.getJobStatus(jobId, signal);
  }

  waitForJob(jobId: string | JobInfo, signal?: AbortSignal): Promise<JobInfo> {
    return this.read.waitForJob(jobId, signal);
  }

  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    return this.read.subscribe(search, callback, view);
  }
}
