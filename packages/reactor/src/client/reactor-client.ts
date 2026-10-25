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

  create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.write.create<TDocument>(document, parentIdentifier, signal);
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

  createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.write.createEmpty<TDocument>(
      documentModelType,
      options,
      signal,
    );
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

  upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.write.upgradeDocument<TDocument>(
      documentIdentifier,
      toVersion,
      options,
      signal,
    );
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

  execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    subject?: AuthSubject,
  ): Promise<TDocument> {
    return this.write.execute<TDocument>(
      documentIdentifier,
      branch,
      actions,
      signal,
      subject,
    );
  }

  executeAsync(
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
    return this.write.submitExecute(
      documentIdentifier,
      branch,
      actions,
      signal,
    );
  }

  executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    return this.write.executeBatch(request, signal);
  }

  rename(
    documentIdentifier: string,
    name: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.write.rename(documentIdentifier, name, branch, signal);
  }

  setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.write.setPreferredEditor(
      documentIdentifier,
      preferredEditor,
      branch,
      signal,
    );
  }

  addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.write.addRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
      signal,
    );
  }

  updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.write.updateRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
      signal,
    );
  }

  removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.write.removeRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
  }

  moveRelationship(
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
    return this.write.moveRelationship(
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
  }

  loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    return this.write.loadBatch(request, signal);
  }

  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.write.deleteDocument(identifier, propagate, signal);
  }

  deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.write.deleteDocuments(identifiers, propagate, signal);
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
