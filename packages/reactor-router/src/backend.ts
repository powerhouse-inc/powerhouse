import type {
  ActionCandidate,
  ActionEvaluations,
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  DocumentChangeEvent,
  DocumentRelationship,
  IReactorClient,
  JobInfo,
  OperationFilter,
  PagedResults,
  PagingOptions,
  PropagationMode,
  ReactorInfo,
  SearchFilter,
  ViewFilter,
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
import { messageOf } from "./errors.js";
import {
  UNKNOWN_REACTOR_INFO,
  type BackendFacts,
  type ReactorReach,
  type RouterDiagnostic,
} from "./types.js";

/** Whether a backend can answer this `find`; it depends on the arguments. */
export type FindSupport = (search: SearchFilter, view?: ViewFilter) => boolean;

export type BackendSupports = {
  readonly find: FindSupport;
  /** Reads with `view.revision`. */
  readonly pointInTimeViews: boolean;
};

export type BatchSubmitter = (
  request: BatchExecutionRequest,
  signal?: AbortSignal,
) => Promise<BatchExecutionResult>;

/** An absent optional member declares non-support; never use a catch-all Proxy. */
export interface IRoutableBackend {
  readonly supports: BackendSupports;

  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument>;
  getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>>;
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;
  /** Cheap, and honours the view. */
  isServed(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<boolean>;
  getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;
  getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>>;
  getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;
  getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>>;
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void;
  getCreateSignaturePolicy(): Promise<SignaturePolicy>;
  getCreateProtocolVersions(
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions>;

  create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument>;
  execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    subject?: AuthSubject,
  ): Promise<TDocument>;
  executeBatch: BatchSubmitter;
  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void>;
  setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;

  /** `undefined` when this backend does not know the job. */
  getJob(jobId: string, signal?: AbortSignal): Promise<JobInfo | undefined>;
  waitForJob(job: string | JobInfo, signal?: AbortSignal): Promise<JobInfo>;

  isDocumentIdTaken?(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
  resolveIdOrSlug?(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string>;
  evaluateActions?(
    documentIdentifier: string,
    branch: string,
    candidates: ActionCandidate[],
    subject?: AuthSubject,
    signal?: AbortSignal,
  ): Promise<ActionEvaluations>;
  loadBatch?(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult>;
  addRelationship?(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;
  updateRelationship?(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;
  removeRelationship?(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument>;
  moveRelationship?(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<{ source: PHDocument; target: PHDocument }>;
  getDocumentModelModules?(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>>;
  getDocumentModelModule?(documentType: string): Promise<DocumentModelModule>;
}

export type RoutableBackendConfig = {
  /** Unique within one router, and stable for its life. */
  readonly name: string;
  readonly backend: IRoutableBackend;
  readonly facts: ReactorInfo | (() => Promise<ReactorInfo>);
  readonly reach: ReactorReach;
  /** True when the backend itself refuses a misroute with WrongBackendError. */
  readonly refusesMisroutes: boolean;
};

/** The backend cannot serve this call, by declaration. Nothing was sent. */
export class UnsupportedByBackendError extends Error {
  constructor(
    readonly backend: string,
    readonly member: string,
    readonly reason: string,
  ) {
    super(
      `${member} is not supported by reactor backend ${JSON.stringify(backend)}: ${reason}`,
    );
    this.name = "UnsupportedByBackendError";
  }
}

const SUPPORTS_EVERYTHING: BackendSupports = Object.freeze({
  find: () => true,
  pointInTimeViews: true,
});

/** An explicit adapter, so it stays honest over a worker RPC proxy. */
export function fromReactorClient(client: IReactorClient): IRoutableBackend {
  return {
    supports: SUPPORTS_EVERYTHING,
    get: (identifier, view, signal) => client.get(identifier, view, signal),
    getOperations: (identifier, view, filter, paging, signal) =>
      client.getOperations(identifier, view, filter, paging, signal),
    find: (search, view, paging, signal) =>
      client.find(search, view, paging, signal),
    isServed: (identifier, view, signal) =>
      client.isServed(identifier, view, signal),
    getOutgoingRelationships: (source, type, view, paging, signal) =>
      client.getOutgoingRelationships(source, type, view, paging, signal),
    getIncomingRelationships: (target, type, view, paging, signal) =>
      client.getIncomingRelationships(target, type, view, paging, signal),
    getOutgoingRelationshipEdges: (source, type, view, paging, signal) =>
      client.getOutgoingRelationshipEdges(source, type, view, paging, signal),
    getIncomingRelationshipEdges: (target, type, view, paging, signal) =>
      client.getIncomingRelationshipEdges(target, type, view, paging, signal),
    subscribe: (search, callback, view) =>
      client.subscribe(search, callback, view),
    getCreateSignaturePolicy: () => client.getCreateSignaturePolicy(),
    getCreateProtocolVersions: (parent, signal) =>
      client.getCreateProtocolVersions(parent, signal),
    create: (document, parent, signal) =>
      client.create(document, parent, signal),
    execute: (identifier, branch, actions, signal, subject) =>
      client.execute(identifier, branch, actions, signal, subject),
    executeBatch: (request, signal) => client.executeBatch(request, signal),
    deleteDocument: (identifier, propagate, signal) =>
      client.deleteDocument(identifier, propagate, signal),
    setPreferredEditor: (identifier, editor, branch, signal) =>
      client.setPreferredEditor(identifier, editor, branch, signal),
    getJob: (jobId, signal) => client.getJobStatus(jobId, signal),
    waitForJob: (job, signal) => client.waitForJob(job, signal),
    isDocumentIdTaken: (documentId, signal) =>
      client.isDocumentIdTaken(documentId, signal),
    resolveIdOrSlug: (identifier, view, signal) =>
      client.resolveIdOrSlug(identifier, view, signal),
    evaluateActions: (identifier, branch, candidates, subject, signal) =>
      client.evaluateActions(identifier, branch, candidates, subject, signal),
    loadBatch: (request, signal) => client.loadBatch(request, signal),
    addRelationship: (source, target, type, metadata, branch, signal) =>
      client.addRelationship(source, target, type, metadata, branch, signal),
    updateRelationship: (source, target, type, metadata, branch, signal) =>
      client.updateRelationship(source, target, type, metadata, branch, signal),
    removeRelationship: (source, target, type, branch, signal) =>
      client.removeRelationship(source, target, type, branch, signal),
    moveRelationship: (
      sourceParent,
      targetParent,
      target,
      type,
      branch,
      signal,
    ) =>
      client.moveRelationship(
        sourceParent,
        targetParent,
        target,
        type,
        branch,
        signal,
      ),
    getDocumentModelModules: (namespace, paging, signal) =>
      client.getDocumentModelModules(namespace, paging, signal),
    getDocumentModelModule: (documentType) =>
      client.getDocumentModelModule(documentType),
  };
}

/** One configured backend as the router holds it, with its current facts. */
export class RouterBackend {
  readonly name: string;
  readonly api: IRoutableBackend;
  readonly reach: ReactorReach;
  readonly refusesMisroutes: boolean;
  private readonly source: RoutableBackendConfig["facts"];
  private current: BackendFacts;

  constructor(config: RoutableBackendConfig) {
    this.name = config.name;
    this.api = config.backend;
    this.reach = config.reach;
    this.refusesMisroutes = config.refusesMisroutes;
    this.source = config.facts;
    this.current =
      typeof config.facts === "function"
        ? { reactor: UNKNOWN_REACTOR_INFO, reach: config.reach, known: false }
        : { reactor: config.facts, reach: config.reach, known: true };
  }

  get facts(): BackendFacts {
    return this.current;
  }

  /** Re-reads the facts; a failed read leaves them unknown and says so. */
  async refreshFacts(onDiagnostic: RouterDiagnostic): Promise<void> {
    if (typeof this.source !== "function") {
      return;
    }
    try {
      const reactor = await this.source();
      this.current = { reactor, reach: this.reach, known: true };
    } catch (error) {
      this.current = {
        reactor: UNKNOWN_REACTOR_INFO,
        reach: this.reach,
        known: false,
      };
      onDiagnostic(
        `facts: backend ${this.name} could not report its facts (${messageOf(error)}); placing it as unknown`,
        error,
      );
    }
  }
}
