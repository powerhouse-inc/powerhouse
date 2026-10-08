import {
  buildCreateJobs,
  createEmptyDocument,
  JOB_NOT_FOUND_ERROR_NAME,
  JobStatus,
  selectDocumentModelModule,
  upgradeDocumentWith,
  type ActionCandidate,
  type ActionEvaluations,
  type BatchExecutionRequest,
  type BatchExecutionResult,
  type BatchLoadRequest,
  type BatchLoadResult,
  type CreateDocumentOptions,
  type DocumentChangeEvent,
  type DocumentRelationship,
  type IReactorClient,
  type JobInfo,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
  type SearchFilter,
  type UpgradeDocumentOptions,
  type ViewFilter,
} from "@powerhousedao/reactor";
import {
  actions as documentActions,
  normalizeDocumentModelVersion,
  UnsupportedDocumentModelVersionError,
  type Action,
  type AuthSubject,
  type DocumentModelModule,
  type ISigner,
  type Operation,
  type PHDocument,
  type ProtocolVersions,
  type Signature,
  type SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import {
  RouterBackend,
  UnsupportedByBackendError,
  type IRoutableBackend,
  type RoutableBackendConfig,
} from "./backend.js";
import { ATTEMPT, RouteDispatcher } from "./dispatcher.js";
import {
  CrossBackendBatchError,
  CrossBackendRelationshipError,
  messageOf,
  rethrow,
} from "./errors.js";
import {
  fanInExistence,
  mergePaged,
  pagedParticipants,
  supportingBackends,
} from "./fan-in.js";
import { resolveOn, RoutingDriveClient } from "./routing-drive-client.js";
import { subscribeAll } from "./subscribe-mux.js";
import {
  DEFAULT_SUBSCRIPTION_DEDUP_SIZE,
  type RouterTableSnapshot,
  type RoutingOptions,
} from "./types.js";

/** Members a backend may leave out; calling one it left out is refused. */
type OptionalMember =
  | "isDocumentIdTaken"
  | "resolveIdOrSlug"
  | "evaluateActions"
  | "loadBatch"
  | "addRelationship"
  | "updateRelationship"
  | "removeRelationship"
  | "moveRelationship"
  | "getDocumentModelModules"
  | "getDocumentModelModule";

function declared<K extends OptionalMember>(
  backend: RouterBackend,
  member: K,
): NonNullable<IRoutableBackend[K]> {
  const value = backend.api[member];
  if (value === undefined) {
    throw new UnsupportedByBackendError(
      backend.name,
      member,
      "the backend does not declare it",
    );
  }
  return value.bind(backend.api) as NonNullable<IRoutableBackend[K]>;
}

/** Refuses a point-in-time read on a backend that does not declare them. */
function assertView(
  backend: RouterBackend,
  view: ViewFilter | undefined,
  member: string,
): void {
  if (view?.revision === undefined || backend.api.supports.pointInTimeViews) {
    return;
  }
  throw new UnsupportedByBackendError(
    backend.name,
    member,
    "the backend does not serve point-in-time views",
  );
}

function sharedScope(actions: readonly Action[]): string {
  const scope = actions[0]?.scope ?? "";
  if (actions.some((action) => action.scope !== scope)) {
    throw new Error("All actions of one job must share a scope");
  }
  return scope;
}

/** The failed job a batch error carries, when it carries one. */
function failedBatchJob(error: unknown, key: string): JobInfo | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const candidate = error as {
    name?: unknown;
    jobs?: Record<string, JobInfo | undefined>;
  };
  if (candidate.name !== "BatchJobFailedError") {
    return undefined;
  }
  return candidate.jobs?.[key];
}

const documentIdentity = (document: PHDocument): string => document.header.id;

/** The reactor's answer for a job no backend knows. */
function unknownJob(jobId: string): JobInfo {
  const now = new Date().toISOString();
  return {
    id: jobId,
    documentId: "",
    status: JobStatus.FAILED,
    createdAtUtcIso: now,
    completedAtUtcIso: now,
    error: {
      name: JOB_NOT_FOUND_ERROR_NAME,
      message: "Job not found",
      stack: "",
    },
    consistencyToken: { version: 1, createdAtUtcIso: now, coordinates: [] },
    meta: { batchId: jobId, batchJobIds: [jobId] },
  };
}

class UnsignedSigner implements ISigner {
  publicKey = {} as CryptoKey;

  sign(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(0));
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }

  signAction(): Promise<Signature> {
    return Promise.resolve(["", "", "", "", ""]);
  }
}

export type RoutingClientOptions = RoutingOptions & {
  readonly logger?: ILogger;
};

/** One IReactorClient over many backends; spanning writes are refused. */
export class RoutingReactorClient implements IReactorClient {
  readonly drives: RoutingDriveClient;
  private readonly dispatcher: RouteDispatcher;
  private readonly dedupSize: number;
  private readonly signer: ISigner;
  private readonly registry: readonly DocumentModelModule[] | undefined;

  constructor(
    backends: readonly RoutableBackendConfig[],
    options: RoutingClientOptions = {},
  ) {
    this.dispatcher = new RouteDispatcher(
      backends.map((config) => new RouterBackend(config)),
      options,
    );
    this.signer = options.signer ?? new UnsignedSigner();
    this.registry = options.documentModelModules;
    this.dedupSize =
      options.subscriptionDedupSize ?? DEFAULT_SUBSCRIPTION_DEDUP_SIZE;
    this.drives = new RoutingDriveClient(
      this.dispatcher,
      options.logger ?? childLogger(["reactor-router"]),
      this.signer,
    );
  }

  get backends(): readonly RouterBackend[] {
    return this.dispatcher.backends;
  }

  describeRouting(): RouterTableSnapshot {
    return this.dispatcher.table.describe();
  }

  /** Re-reads the facts of the named backend, or of every backend. */
  refreshFacts(name?: string): Promise<void> {
    return this.dispatcher.refreshFacts(name);
  }

  // Registry and creation defaults: no collection owns these.

  async getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    if (this.registry === undefined) {
      const primary = this.dispatcher.primary;
      return declared(primary, "getDocumentModelModules")(
        namespace,
        paging,
        signal,
      );
    }
    const matching = this.registry.filter(
      (module) =>
        !namespace || module.documentModel.global.id.startsWith(namespace),
    );
    const start = paging ? parseInt(paging.cursor) || 0 : 0;
    const limit = paging?.limit || matching.length;
    const results = matching.slice(start, start + limit);
    const more = start + limit < matching.length;
    return {
      results,
      options: paging ?? { cursor: "0", limit: matching.length },
      nextCursor: more ? String(start + limit) : undefined,
    };
  }

  /** The latest registered module; without a registry, the first backend's. */
  async getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule> {
    if (this.registry !== undefined) {
      return selectDocumentModelModule(this.registry, documentType);
    }
    let first: unknown = undefined;
    for (const backend of this.primaryFirst()) {
      if (backend.api.getDocumentModelModule === undefined) {
        continue;
      }
      try {
        return await backend.api.getDocumentModelModule(documentType);
      } catch (error) {
        first = first ?? error;
      }
    }
    if (first !== undefined) {
      rethrow(first);
    }
    throw new UnsupportedByBackendError(
      this.dispatcher.primary.name,
      "getDocumentModelModule",
      "no backend declares it",
    );
  }

  async getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule> {
    const documentType = document.header.documentType;
    const version = normalizeDocumentModelVersion(
      (document.state as Partial<typeof document.state>).document?.version,
    );
    const available: number[] = [];
    for (const module of await this.allModules()) {
      if (module.documentModel.global.id !== documentType) {
        continue;
      }
      const moduleVersion = normalizeDocumentModelVersion(module.version);
      if (moduleVersion === version) {
        return module;
      }
      available.push(moduleVersion);
    }
    throw new UnsupportedDocumentModelVersionError(
      documentType,
      version,
      available.sort((a, b) => a - b),
    );
  }

  getCreateSignaturePolicy(): Promise<SignaturePolicy> {
    return this.dispatcher.onBackend(
      "getCreateSignaturePolicy",
      this.dispatcher.primary,
      (backend) => backend.api.getCreateSignaturePolicy(),
      ATTEMPT.read,
    );
  }

  /** Asked of the parent's backend: the answer is about its collections. */
  getCreateProtocolVersions(
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    if (parentIdentifier === undefined) {
      return this.dispatcher.onBackend(
        "getCreateProtocolVersions",
        this.dispatcher.primary,
        (backend) => backend.api.getCreateProtocolVersions(undefined, signal),
        ATTEMPT.read,
      );
    }
    return this.dispatcher.onDocument(
      "getCreateProtocolVersions",
      parentIdentifier,
      (backend) =>
        backend.api.getCreateProtocolVersions(parentIdentifier, signal),
      ATTEMPT.read,
    );
  }

  // Reads

  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.dispatcher.onDocument(
      "get",
      identifier,
      (backend) => {
        assertView(backend, view, "get");
        return backend.api.get<TDocument>(identifier, view, signal);
      },
      ATTEMPT.read,
    );
  }

  resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.dispatcher.onDocument(
      "resolveIdOrSlug",
      identifier,
      (backend) => {
        assertView(backend, view, "resolveIdOrSlug");
        return resolveOn(backend, identifier, signal, view);
      },
      ATTEMPT.read,
    );
  }

  /** Taken where it is held; otherwise asked of the primary. */
  async isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const serving = await this.dispatcher.servingBackends(documentId);
    if (serving.length > 0) {
      return true;
    }
    return declared(this.dispatcher.primary, "isDocumentIdTaken")(
      documentId,
      signal,
    );
  }

  getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    return this.dispatcher.onDocument(
      "getOperations",
      documentIdentifier,
      (backend) => {
        assertView(backend, view, "getOperations");
        return backend.api.getOperations(
          documentIdentifier,
          view,
          filter,
          paging,
          signal,
        );
      },
      ATTEMPT.read,
    );
  }

  /** Edges are written on their document, so they are read from its owner. */
  getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.dispatcher.onDocument(
      "getOutgoingRelationships",
      sourceIdentifier,
      (backend) => {
        assertView(backend, view, "getOutgoingRelationships");
        return backend.api.getOutgoingRelationships(
          sourceIdentifier,
          relationshipType,
          view,
          paging,
          signal,
        );
      },
      ATTEMPT.read,
    );
  }

  getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.dispatcher.onDocument(
      "getIncomingRelationships",
      targetIdentifier,
      (backend) => {
        assertView(backend, view, "getIncomingRelationships");
        return backend.api.getIncomingRelationships(
          targetIdentifier,
          relationshipType,
          view,
          paging,
          signal,
        );
      },
      ATTEMPT.read,
    );
  }

  getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.dispatcher.onDocument(
      "getOutgoingRelationshipEdges",
      sourceIdentifier,
      (backend) => {
        assertView(backend, view, "getOutgoingRelationshipEdges");
        return backend.api.getOutgoingRelationshipEdges(
          sourceIdentifier,
          relationshipType,
          view,
          paging,
          signal,
        );
      },
      ATTEMPT.read,
    );
  }

  getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.dispatcher.onDocument(
      "getIncomingRelationshipEdges",
      targetIdentifier,
      (backend) => {
        assertView(backend, view, "getIncomingRelationshipEdges");
        return backend.api.getIncomingRelationshipEdges(
          targetIdentifier,
          relationshipType,
          view,
          paging,
          signal,
        );
      },
      ATTEMPT.read,
    );
  }

  /** Strict: a backend that fails would leave the page silently short. */
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    const onDiagnostic = this.dispatcher.onDiagnostic;
    const backends = supportingBackends(
      "find",
      this.dispatcher.backends,
      (backend) => {
        if (!backend.api.supports.find(search, view)) {
          return "the backend does not serve this search";
        }
        if (
          view?.revision !== undefined &&
          !backend.api.supports.pointInTimeViews
        ) {
          return "the backend does not serve point-in-time views";
        }
        return "";
      },
      onDiagnostic,
    );
    const options = { mode: "strict", onDiagnostic } as const;
    return mergePaged(
      pagedParticipants("find", backends, paging, options),
      (backend, backendPaging) =>
        backend.api.find(search, view, backendPaging, signal),
      { ...options, operation: "find", identify: documentIdentity, paging },
    );
  }

  /** True when any backend serves it; false only when every one answered. */
  isServed(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const asked: RouterBackend[] = [];
    const gaps: { backend: string; error: unknown }[] = [];
    for (const backend of this.dispatcher.backends) {
      try {
        assertView(backend, view, "isServed");
        asked.push(backend);
      } catch (error) {
        gaps.push({ backend: backend.name, error });
      }
    }
    return fanInExistence(
      "isServed",
      asked,
      (backend) => backend.api.isServed(identifier, view, signal),
      this.dispatcher.onDiagnostic,
      gaps,
    );
  }

  evaluateActions(
    documentIdentifier: string,
    branch: string,
    candidates: ActionCandidate[],
    subject?: AuthSubject,
    signal?: AbortSignal,
  ): Promise<ActionEvaluations> {
    return this.dispatcher.onDocument(
      "evaluateActions",
      documentIdentifier,
      (backend) =>
        declared(backend, "evaluateActions")(
          documentIdentifier,
          branch,
          candidates,
          subject,
          signal,
        ),
      ATTEMPT.read,
    );
  }

  // Creation

  /** On the parent's backend; parentless, placed by the document id. */
  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const backend = await this.placeNewDocument(
      document.header.id,
      parentIdentifier,
    );
    const created = await this.dispatcher.onBackend(
      "create",
      backend,
      (target) =>
        target.api.create<TDocument>(document, parentIdentifier, signal),
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(created.header.id, backend.name);
    return created;
  }

  async createAsync(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const backend = await this.placeNewDocument(
      document.header.id,
      parentIdentifier,
    );
    const result = await this.dispatcher.onBackend(
      "createAsync",
      backend,
      async (target) => {
        const parentId =
          parentIdentifier === undefined || parentIdentifier === ""
            ? undefined
            : await resolveOn(target, parentIdentifier, signal);
        const jobs = await buildCreateJobs(
          document,
          parentId,
          this.signer,
          signal,
        );
        return target.api.executeBatch({ jobs }, signal);
      },
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(document.header.id, backend.name);
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const document = await this.emptyDocument(
      documentModelType,
      options,
      signal,
    );
    return this.create<TDocument>(document, options?.parentIdentifier, signal);
  }

  async createEmptyAsync(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const document = await this.emptyDocument(
      documentModelType,
      options,
      signal,
    );
    return this.createAsync(document, options?.parentIdentifier, signal);
  }

  /** @deprecated Use `drives.addFile`. */
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

  // Mutations

  upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return upgradeDocumentWith<TDocument>(
      {
        signer: this.signer,
        read: <T extends PHDocument>(
          identifier: string,
          branch: string | undefined,
          _token: unknown,
          readSignal?: AbortSignal,
        ) =>
          this.get<T>(
            identifier,
            branch === undefined ? undefined : { branch },
            readSignal,
          ),
        getDocumentModelModule: (documentType) =>
          this.getDocumentModelModule(documentType),
        submit: (documentId, branch, actions, submitSignal) =>
          this.submitJob(
            "upgradeDocument",
            documentId,
            branch,
            actions,
            submitSignal,
          ),
        waitForJob: (job, waitSignal) =>
          job.status === JobStatus.FAILED || job.status === JobStatus.READ_READY
            ? Promise.resolve(job)
            : this.waitForJob(job, waitSignal),
      },
      documentIdentifier,
      toVersion,
      options,
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
    return this.dispatcher.onDocument(
      "execute",
      documentIdentifier,
      (backend) =>
        backend.api.execute<TDocument>(
          documentIdentifier,
          branch,
          actions,
          signal,
          subject,
        ),
      ATTEMPT.write,
    );
  }

  executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    return this.submitJob(
      "executeAsync",
      documentIdentifier,
      branch,
      actions,
      signal,
    );
  }

  /** Every job's document must resolve to one backend; nothing is sent otherwise. */
  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const backend = await this.singleBackendFor(
      "executeBatch",
      request.jobs.map((job) => job.documentId),
    );
    const result = await this.dispatcher.onBackend(
      "executeBatch",
      backend,
      (target) => target.api.executeBatch(request, signal),
      ATTEMPT.write,
    );
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  async loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    const backend = await this.singleBackendFor(
      "loadBatch",
      request.jobs.map((job) => job.documentId),
    );
    const load = declared(backend, "loadBatch");
    const result = await this.dispatcher.onBackend(
      "loadBatch",
      backend,
      () => load(request, signal),
      ATTEMPT.write,
    );
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  rename(
    documentIdentifier: string,
    name: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.execute(
      documentIdentifier,
      branch,
      [documentActions.setName(name)],
      signal,
    );
  }

  setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.dispatcher.onDocument(
      "setPreferredEditor",
      documentIdentifier,
      (backend) =>
        backend.api.setPreferredEditor(
          documentIdentifier,
          preferredEditor,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    await this.assertSameBackend(
      "addRelationship",
      sourceIdentifier,
      targetIdentifier,
    );
    return this.dispatcher.onDocument(
      "addRelationship",
      sourceIdentifier,
      (backend) =>
        declared(backend, "addRelationship")(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          metadata,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  async updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    await this.assertSameBackend(
      "updateRelationship",
      sourceIdentifier,
      targetIdentifier,
    );
    return this.dispatcher.onDocument(
      "updateRelationship",
      sourceIdentifier,
      (backend) =>
        declared(backend, "updateRelationship")(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          metadata,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    await this.assertSameBackend(
      "removeRelationship",
      sourceIdentifier,
      targetIdentifier,
    );
    return this.dispatcher.onDocument(
      "removeRelationship",
      sourceIdentifier,
      (backend) =>
        declared(backend, "removeRelationship")(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  /** Both parents and the target share a backend: it is one write. */
  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<{ source: PHDocument; target: PHDocument }> {
    await this.assertSameBackend(
      "moveRelationship",
      sourceParentIdentifier,
      targetParentIdentifier,
    );
    await this.assertSameBackend(
      "moveRelationship",
      sourceParentIdentifier,
      targetIdentifier,
    );
    return this.dispatcher.onDocument(
      "moveRelationship",
      sourceParentIdentifier,
      (backend) =>
        declared(backend, "moveRelationship")(
          sourceParentIdentifier,
          targetParentIdentifier,
          targetIdentifier,
          relationshipType,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.dispatcher.onDocument(
      "deleteDocument",
      identifier,
      (backend) => backend.api.deleteDocument(identifier, propagate, signal),
      ATTEMPT.write,
    );
  }

  /** Every identifier must resolve to one backend; nothing is deleted otherwise. */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    const backend = await this.singleBackendFor("deleteDocuments", identifiers);
    await this.dispatcher.onBackend(
      "deleteDocuments",
      backend,
      async (target) => {
        await Promise.all(
          identifiers.map((identifier) =>
            target.api.deleteDocument(identifier, propagate, signal),
          ),
        );
      },
      ATTEMPT.write,
    );
  }

  // Jobs

  async getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    const found = await this.findJob(jobId, signal);
    return found?.job ?? unknownJob(jobId);
  }

  async waitForJob(
    job: string | JobInfo,
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const jobId = typeof job === "string" ? job : job.id;
    const remembered = this.dispatcher.table.jobBackend(jobId);
    if (remembered !== "" && this.dispatcher.table.has(remembered)) {
      const backend = this.dispatcher.table.backend(remembered, `job ${jobId}`);
      return backend.api.waitForJob(job, signal);
    }
    const found = await this.findJob(jobId, signal);
    if (found === undefined) {
      throw new Error(
        `waitForJob: no backend of this router knows job ${JSON.stringify(jobId)}`,
      );
    }
    return found.backend.api.waitForJob(job, signal);
  }

  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    return subscribeAll(
      this.dispatcher.backends,
      search,
      callback,
      view,
      this.dedupSize,
      this.dispatcher.onDiagnostic,
    );
  }

  // Internals

  /** The recorded backend first, then each backend, until one knows the job. */
  private async findJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<{ backend: RouterBackend; job: JobInfo } | undefined> {
    const remembered = this.dispatcher.table.jobBackend(jobId);
    const ordered = [...this.dispatcher.backends].sort(
      (a, b) => Number(b.name === remembered) - Number(a.name === remembered),
    );
    let first: unknown = undefined;
    for (const backend of ordered) {
      try {
        const job = await backend.api.getJob(jobId, signal);
        if (job !== undefined) {
          this.dispatcher.recordJob(jobId, backend.name);
          return { backend, job };
        }
      } catch (error) {
        first = first ?? error;
        this.dispatcher.onDiagnostic(
          `job ${jobId}: backend ${backend.name} could not answer (${messageOf(error)})`,
          error,
        );
      }
    }
    if (first !== undefined) {
      rethrow(first);
    }
    return undefined;
  }

  /** Submits one job on the document's backend and records where it went. */
  private async submitJob(
    operation: string,
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const key = "job";
    let owner = "";
    const job = await this.dispatcher.onDocument(
      operation,
      documentIdentifier,
      async (backend) => {
        owner = backend.name;
        const request: BatchExecutionRequest = {
          jobs: [
            {
              key,
              documentId: documentIdentifier,
              scope: sharedScope(actions),
              branch,
              actions,
              dependsOn: [],
            },
          ],
        };
        try {
          const result = await backend.api.executeBatch(request, signal);
          return result.jobs[key];
        } catch (error) {
          const failed = failedBatchJob(error, key);
          if (failed === undefined) {
            throw error;
          }
          return failed;
        }
      },
      ATTEMPT.write,
    );
    this.dispatcher.recordJob(job.id, owner);
    return job;
  }

  private async emptyDocument(
    documentModelType: string,
    options: CreateDocumentOptions | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PHDocument> {
    const module = selectDocumentModelModule(
      await this.allModules(signal),
      documentModelType,
      options?.documentModelVersion,
    );
    const [policy, versions] = await Promise.all([
      this.getCreateSignaturePolicy(),
      this.getCreateProtocolVersions(options?.parentIdentifier, signal),
    ]);
    return createEmptyDocument(module, options, policy, versions);
  }

  private async allModules(
    signal?: AbortSignal,
  ): Promise<readonly DocumentModelModule[]> {
    if (this.registry !== undefined) {
      return this.registry;
    }
    const page = await this.getDocumentModelModules(
      undefined,
      undefined,
      signal,
    );
    return page.results;
  }

  private primaryFirst(): readonly RouterBackend[] {
    const primary = this.dispatcher.primary;
    return [
      primary,
      ...this.dispatcher.backends.filter((backend) => backend !== primary),
    ];
  }

  private async placeNewDocument(
    documentId: string,
    parentIdentifier?: string,
  ): Promise<RouterBackend> {
    if (parentIdentifier !== undefined && parentIdentifier !== "") {
      return this.dispatcher.resolveDocumentBackend(parentIdentifier);
    }
    if (documentId !== "") {
      return this.dispatcher.placed(() =>
        this.dispatcher.table.standaloneRoute(documentId),
      );
    }
    return this.dispatcher.primary;
  }

  private recordBatchJobs(
    jobs: Record<string, JobInfo>,
    backend: string,
  ): void {
    for (const job of Object.values(jobs)) {
      this.dispatcher.recordJob(job.id, backend);
    }
  }

  private async singleBackendFor(
    operation: string,
    identifiers: readonly string[],
  ): Promise<RouterBackend> {
    const distinct = [...new Set(identifiers.filter((id) => id !== ""))];
    if (distinct.length === 0) {
      return this.dispatcher.primary;
    }
    const resolved = await Promise.all(
      distinct.map(async (documentId) => ({
        documentId,
        backend: await this.dispatcher.resolveDocumentBackend(documentId),
      })),
    );
    const first = resolved[0];
    if (resolved.some((entry) => entry.backend !== first.backend)) {
      throw new CrossBackendBatchError(
        operation,
        resolved.map((entry) => ({
          documentId: entry.documentId,
          backend: entry.backend.name,
        })),
      );
    }
    return first.backend;
  }

  private async assertSameBackend(
    operation: string,
    source: string,
    target: string,
  ): Promise<void> {
    const [sourceBackend, targetBackend] = await Promise.all([
      this.dispatcher.resolveDocumentBackend(source),
      this.dispatcher.resolveDocumentBackend(target),
    ]);
    if (sourceBackend === targetBackend) {
      return;
    }
    throw new CrossBackendRelationshipError(
      operation,
      source,
      sourceBackend.name,
      target,
      targetBackend.name,
    );
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
