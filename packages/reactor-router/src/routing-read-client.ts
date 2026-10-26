import {
  createEmptyDocument,
  selectDocumentModelModule,
  type ConsistencyToken,
  type CreateProtocolVersionsOptions,
  type DocumentChangeEvent,
  type DocumentRelationship,
  type IReactorReadClient,
  type JobInfo,
  type NewDocumentOptions,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ViewFilter,
} from "@powerhousedao/reactor";
import {
  normalizeDocumentModelVersion,
  UnsupportedDocumentModelVersionError,
  type DocumentModelModule,
  type Operation,
  type PHDocument,
  type ProtocolVersions,
  type SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { UnsupportedByBackendError, type RouterBackend } from "./backend.js";
import { ATTEMPT, type RouteDispatcher } from "./dispatcher.js";
import { messageOf, rethrow } from "./errors.js";
import {
  fanInExistence,
  mergePaged,
  pagedParticipants,
  supportingBackends,
} from "./fan-in.js";
import {
  assertView,
  declared,
  unknownJob,
  type RoutingContext,
} from "./routing-context.js";
import {
  resolveOn,
  RoutingDriveReadClient,
  type BackendDrives,
} from "./routing-drive-client.js";
import { subscribeAll } from "./subscribe-mux.js";

const documentIdentity = (document: PHDocument): string => document.header.id;

/**
 * The read half of the router: each read goes to the backend that holds its
 * document (or collection), and searches, existence checks and subscriptions
 * fan in over every backend. Reads never enqueue.
 *
 * `get` and `getMany` honour a consistency token: it is passed to the owning
 * backend, through its read half when it has one. The router's other reads
 * accept a token and do not wait for it.
 */
export class RoutingReadClient implements IReactorReadClient {
  readonly drives: RoutingDriveReadClient;
  private readonly dispatcher: RouteDispatcher;

  constructor(
    private readonly context: RoutingContext,
    drives: BackendDrives,
  ) {
    this.dispatcher = context.dispatcher;
    this.drives = new RoutingDriveReadClient(this.dispatcher, drives);
  }

  // Registry and creation defaults: no collection owns these.

  async getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    const modules = this.context.modules;
    if (modules === undefined) {
      const primary = this.dispatcher.primary;
      return declared(primary, "getDocumentModelModules")(
        namespace,
        paging,
        signal,
      );
    }
    const matching = modules().filter(
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
    const modules = this.context.modules;
    if (modules !== undefined) {
      return selectDocumentModelModule(modules(), documentType);
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
    options: CreateProtocolVersionsOptions,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    const parentIdentifier = options.parentIdentifier;
    if (parentIdentifier === undefined) {
      return this.dispatcher.onBackend(
        "getCreateProtocolVersions",
        this.dispatcher.primary,
        (backend) => backend.api.getCreateProtocolVersions(options, signal),
        ATTEMPT.read,
      );
    }
    return this.dispatcher.onDocument(
      "getCreateProtocolVersions",
      parentIdentifier,
      (backend) => backend.api.getCreateProtocolVersions(options, signal),
      ATTEMPT.read,
    );
  }

  /** Versions from the parent's backend, the module from this client's models. */
  async newDocument<TDocument extends PHDocument = PHDocument>(
    documentModelType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const module = selectDocumentModelModule(
      await this.allModules(signal),
      documentModelType,
      options?.documentModelVersion,
    );
    const [policy, versions] = await Promise.all([
      this.getCreateSignaturePolicy(),
      this.getCreateProtocolVersions(
        {
          documentType: documentModelType,
          parentIdentifier: options?.parentIdentifier,
        },
        signal,
      ),
    ]);
    return createEmptyDocument(module, options, policy, versions) as TDocument;
  }

  // Documents

  /** Each id read as `get` reads it, in the order given. */
  getMany<TDocument extends PHDocument>(
    documentIds: string[],
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument[]> {
    return Promise.all(
      documentIds.map((id) =>
        this.get<TDocument>(id, view, signal, consistencyToken),
      ),
    );
  }

  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument> {
    return this.dispatcher.onDocument(
      "get",
      identifier,
      (backend) => {
        assertView(backend, view, "get");
        if (consistencyToken === undefined) {
          return backend.api.get<TDocument>(identifier, view, signal);
        }
        const read = backend.api.read;
        return read === undefined
          ? backend.api.get<TDocument>(
              identifier,
              view,
              signal,
              consistencyToken,
            )
          : read.get<TDocument>(identifier, view, signal, consistencyToken);
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
  async find(
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
    return await mergePaged(
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
      return unknownJob(jobId);
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
      this.context.dedupSize,
      this.dispatcher.onDiagnostic,
    );
  }

  /** The registry, or the primary backend's modules without one. */
  async allModules(
    signal?: AbortSignal,
  ): Promise<readonly DocumentModelModule[]> {
    const modules = this.context.modules;
    if (modules !== undefined) {
      return modules();
    }
    const page = await this.getDocumentModelModules(
      undefined,
      undefined,
      signal,
    );
    return page.results;
  }

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

  private primaryFirst(): readonly RouterBackend[] {
    const primary = this.dispatcher.primary;
    return [
      primary,
      ...this.dispatcher.backends.filter((backend) => backend !== primary),
    ];
  }
}
