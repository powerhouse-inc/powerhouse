import type {
  ActionCandidate,
  ActionEvaluations,
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  CreateDocumentOptions,
  DocumentChangeEvent,
  DocumentRelationship,
  IDriveClient,
  IReactorClient,
  JobInfo,
  OperationFilter,
  PagedResults,
  PagingOptions,
  PropagationMode,
  SearchFilter,
  UpgradeDocumentOptions,
  ViewFilter,
} from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  DriveInput,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  Operation,
  PHDocument,
  ProtocolVersions,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { ATTEMPT, RouteDispatcher } from "./dispatcher.js";
import {
  CrossBackendBatchError,
  CrossBackendRelationshipError,
  messageOf,
  rethrow,
} from "./errors.js";
import {
  fanIn,
  mergePaged,
  pagedParticipants,
  type FanInMode,
} from "./fan-in.js";
import {
  DEFAULT_BRANCH,
  DEFAULT_SUBSCRIPTION_DEDUP_SIZE,
  type ReactorBackend,
  type RouterTableSnapshot,
  type RoutingOptions,
} from "./types.js";

/** The identity two backends' copies of one document share. */
function documentIdentity(document: PHDocument): string {
  return document.header.id;
}

/** The identity two backends' copies of one relationship edge share. */
function relationshipIdentity(edge: DocumentRelationship): string {
  return `${edge.sourceId}|${edge.relationshipType}|${edge.targetId}`;
}

/**
 * The drive-aware half of the routing client.
 *
 * Every method here names a drive, which IS a collection, so this is where
 * placement actually decides something: `drives.create` places a new drive, and
 * every other method routes to the backend that holds the named one. The one
 * exception is {@link setPreferredEditorOnNode}, which names a node (a
 * document) and no drive, and therefore routes as a document.
 */
class RoutingDriveClient implements IDriveClient {
  constructor(private readonly dispatcher: RouteDispatcher) {}

  /**
   * Places a NEW drive and creates it there.
   *
   * Placement keys on the drive id the input carries, so the drive lands where
   * every later operation on it will be routed, with no probe and no
   * correction. An input with no id keys on the slug; with neither, the primary
   * backend takes it, because there is nothing to hash and an arbitrary backend
   * would be a coin flip the caller cannot predict or override.
   *
   * **Known gap, measured rather than assumed**: the reference `DriveClient`
   * (`packages/reactor/src/client/drive-client.ts`) IGNORES `DriveInput.id` and
   * `slug` -- it builds the drive document with `driveCreateDocument` and lets
   * the header mint an id. So against that client every `drives.create` with no
   * other placement signal lands on the primary backend, and the `id`/`slug`
   * keys above only bite for a client that honours them. It costs nothing:
   * whatever id the drive comes back with is recorded against the backend that
   * created it, so every LATER operation on that drive routes correctly with no
   * probe. A host that wants a specific drive on a specific reactor configures
   * a `collections` override, which it can only do by id anyway.
   */
  async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const backend = this.placeNewDrive(input);
    const drive = await this.dispatcher.onBackend(
      "drives.create",
      backend,
      (target) => target.client.drives.create(input, signal),
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(drive.header.id, backend.name);
    if (drive.header.slug !== "") {
      this.dispatcher.recordDocument(drive.header.slug, backend.name);
    }
    this.dispatcher.table.recordLearnedCollection(
      this.dispatcher.collectionFor(drive.header.id, drive.header.branch),
      backend.name,
    );
    return drive;
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const created = await this.dispatcher.onCollection(
      "drives.addFile",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.addFile<TDocument>(
          driveIdentifier,
          document,
          parentFolder,
          signal,
        ),
      ATTEMPT.write,
    );
    // The file is a member of the drive's collection, so it is known to live
    // where the drive does -- one less probe for every later operation on it.
    const owner = this.dispatcher.table.documentBackend(driveIdentifier);
    this.dispatcher.recordDocument(created.header.id, owner);
    return created;
  }

  addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    return this.dispatcher.onCollection(
      "drives.addFolder",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.addFolder(
          driveIdentifier,
          name,
          parentFolder,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.dispatcher.onCollection(
      "drives.removeNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.removeNode(driveIdentifier, nodeId, signal),
      ATTEMPT.write,
    );
  }

  renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    return this.dispatcher.onCollection(
      "drives.renameNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.renameNode(driveIdentifier, nodeId, name, signal),
      ATTEMPT.write,
    );
  }

  /** Names a node and no drive, so it routes as a document. */
  setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.dispatcher.onDocument(
      "drives.setPreferredEditorOnNode",
      nodeId,
      (backend) =>
        backend.client.drives.setPreferredEditorOnNode(
          nodeId,
          preferredEditor,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    return this.dispatcher.onCollection(
      "drives.moveNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.moveNode(
          driveIdentifier,
          srcNodeId,
          targetParentFolderId,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    return this.dispatcher.onCollection(
      "drives.copyNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.copyNode(
          driveIdentifier,
          srcNodeId,
          targetParentFolderId,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    return this.dispatcher.onCollection(
      "drives.getNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.getNode(driveIdentifier, nodeId, signal),
      ATTEMPT.read,
    );
  }

  /**
   * Routed to the drive's own backend rather than fanned in: a drive's nodes
   * live in that drive's document state, so another backend's copy is either
   * the same state (it syncs the drive) or nothing. Merging would add
   * de-duplication work to produce the same list.
   */
  listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    return this.dispatcher.onCollection(
      "drives.listNodes",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.drives.listNodes(
          driveIdentifier,
          parentFolder,
          paging,
          signal,
        ),
      ATTEMPT.read,
    );
  }

  private placeNewDrive(input: DriveInput): ReactorBackend {
    const key = input.id ?? input.slug ?? "";
    if (key === "") {
      return this.dispatcher.primary;
    }
    const collection = this.dispatcher.collectionFor(key, DEFAULT_BRANCH);
    return this.dispatcher.table.backend(
      this.dispatcher.table.collectionRoute(collection).backend,
      `placement for a new drive keyed ${JSON.stringify(key)}`,
    );
  }
}

/**
 * One `IReactorClient` over a SET of reactors.
 *
 * Application code holds this and never learns there is more than one reactor:
 * every operation is aimed at the backend that holds its drive or document,
 * reads that span collections are fanned in and merged, and the two things that
 * cannot be made to work across reactors in v1 -- a batch and a relationship
 * WRITE -- are refused by name rather than silently half-done.
 *
 * **Why this is a class and not a `Proxy`.** `reactor-browser`'s
 * `createReactorClientProxy` forwards every method identically to one target,
 * so a Proxy is exactly right there. Here each method differs in which argument
 * names the target, whether it is a read or a write (which decides whether a
 * failure may be retried elsewhere), and whether it fans in -- so a Proxy would
 * need a per-method routing table at least as large as these method bodies, and
 * would lose the one thing that matters most for a facade over an interface this
 * wide: `implements IReactorClient` makes the compiler refuse an incomplete
 * surface. The Proxy pattern IS reused where it pays, in
 * `withOwnershipGuard` (`guard.ts`), whose behaviour is uniform.
 *
 * **Routing rules**, in one place:
 * - a method naming a DRIVE routes to that collection's backend (placement
 *   decides, the table remembers);
 * - a method naming a DOCUMENT routes to the backend that holds it (resolved by
 *   probe, then cached);
 * - `find` and the relationship reads fan in across backends and merge;
 * - the registry and creation-default questions, which belong to no collection,
 *   go to the primary backend;
 * - `executeBatch`, `loadBatch` and `deleteDocuments` refuse to span backends;
 * - a relationship WRITE refuses to span backends; relationship READS merge.
 *
 * Routing is ADVISORY throughout. Every rule above is allowed to be wrong: a
 * backend that does not own the target refuses with a structured misroute, the
 * router corrects its table and re-aims, and the operation lands where it
 * belongs (plan agreed decision 4).
 */
export class RoutingReactorClient implements IReactorClient {
  readonly drives: IDriveClient;
  private readonly dispatcher: RouteDispatcher;
  private readonly dedupSize: number;

  constructor(
    backends: readonly ReactorBackend[],
    options: RoutingOptions = {},
  ) {
    this.dispatcher = new RouteDispatcher(backends, options);
    this.drives = new RoutingDriveClient(this.dispatcher);
    this.dedupSize =
      options.subscriptionDedupSize ?? DEFAULT_SUBSCRIPTION_DEDUP_SIZE;
  }

  /** Everything the router currently believes. For tests, operators and demos. */
  describeRouting(): RouterTableSnapshot {
    return this.dispatcher.table.describe();
  }

  /** The backends this client routes over, in its stable order. */
  get backends(): readonly ReactorBackend[] {
    return this.dispatcher.backends;
  }

  // ---------------------------------------------------------------------------
  // Document model registry and creation defaults: no collection owns these.
  // ---------------------------------------------------------------------------

  /**
   * The primary backend's registry, NOT a merge of every backend's.
   *
   * A merged registry would hand a caller a module that some backends cannot
   * execute, which is a worse answer than one backend's truthful list: document
   * models are a property of how a reactor was built, and a topology whose
   * reactors disagree about them has a provisioning problem the router must not
   * paper over.
   */
  getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    return this.dispatcher.onBackend(
      "getDocumentModelModules",
      this.dispatcher.primary,
      (backend) =>
        backend.client.getDocumentModelModules(namespace, paging, signal),
      ATTEMPT.read,
    );
  }

  /**
   * The primary backend's module for the type, falling back to the others.
   *
   * A single lookup can fall back where the list cannot: a module that exists
   * on a non-primary backend is a usable answer, and throwing when one backend
   * happens to lack it would make the router less capable than the reactors
   * behind it.
   */
  async getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule> {
    const ordered = [
      this.dispatcher.primary,
      ...this.dispatcher.backends.filter(
        (backend) => backend !== this.dispatcher.primary,
      ),
    ];
    let first: unknown = undefined;
    for (const backend of ordered) {
      try {
        return await backend.client.getDocumentModelModule(documentType);
      } catch (error) {
        first = first ?? error;
      }
    }
    rethrow(first);
  }

  async getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule> {
    const ordered = [
      this.dispatcher.primary,
      ...this.dispatcher.backends.filter(
        (backend) => backend !== this.dispatcher.primary,
      ),
    ];
    let first: unknown = undefined;
    for (const backend of ordered) {
      try {
        return await backend.client.getDocumentModelModuleForDocument(document);
      } catch (error) {
        first = first ?? error;
      }
    }
    rethrow(first);
  }

  getCreateSignaturePolicy(): Promise<SignaturePolicy> {
    return this.dispatcher.onBackend(
      "getCreateSignaturePolicy",
      this.dispatcher.primary,
      (backend) => backend.client.getCreateSignaturePolicy(),
      ATTEMPT.read,
    );
  }

  /**
   * Answered by the backend that holds the parent, because the answer is about
   * the PARENT's collections and the peers they sync with -- a question only
   * that reactor's sync manager can answer. Without a parent it is the local
   * preference, which the primary states.
   */
  getCreateProtocolVersions(
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<ProtocolVersions> {
    if (parentIdentifier === undefined) {
      return this.dispatcher.onBackend(
        "getCreateProtocolVersions",
        this.dispatcher.primary,
        (backend) =>
          backend.client.getCreateProtocolVersions(undefined, signal),
        ATTEMPT.read,
      );
    }
    return this.dispatcher.onDocument(
      "getCreateProtocolVersions",
      parentIdentifier,
      (backend) =>
        backend.client.getCreateProtocolVersions(parentIdentifier, signal),
      ATTEMPT.read,
    );
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.dispatcher.onDocument(
      "get",
      identifier,
      (backend) => backend.client.get<TDocument>(identifier, view, signal),
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
      (backend) => backend.client.resolveIdOrSlug(identifier, view, signal),
      ATTEMPT.read,
    );
  }

  /** True when ANY backend has the id: an id taken anywhere is taken. */
  async isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const answers = await this.fan("isDocumentIdTaken", "tolerant", (backend) =>
      backend.client.isDocumentIdTaken(documentId, signal),
    );
    return answers.includes(true);
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
      (backend) =>
        backend.client.getOperations(
          documentIdentifier,
          view,
          filter,
          paging,
          signal,
        ),
      ATTEMPT.read,
    );
  }

  /**
   * Fanned in and merged: a v1 constraint makes a relationship WRITE
   * single-reactor, but a relationship that two reactors each recorded one side
   * of is readable from both, and a read that only asked the source's owner
   * would hide the other side (plan: "cross-reactor relationships are
   * READ-level only; reads merge").
   *
   * Tolerant, because a backend that does not hold the source document is
   * SUPPOSED to fail here -- see {@link FanInMode}.
   */
  getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.fanPaged(
      "getOutgoingRelationships",
      "tolerant",
      documentIdentity,
      paging,
      (backend, backendPaging) =>
        backend.client.getOutgoingRelationships(
          sourceIdentifier,
          relationshipType,
          view,
          backendPaging,
          signal,
        ),
    );
  }

  getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.fanPaged(
      "getIncomingRelationships",
      "tolerant",
      documentIdentity,
      paging,
      (backend, backendPaging) =>
        backend.client.getIncomingRelationships(
          targetIdentifier,
          relationshipType,
          view,
          backendPaging,
          signal,
        ),
    );
  }

  getOutgoingRelationshipEdges(
    sourceIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.fanPaged(
      "getOutgoingRelationshipEdges",
      "tolerant",
      relationshipIdentity,
      paging,
      (backend, backendPaging) =>
        backend.client.getOutgoingRelationshipEdges(
          sourceIdentifier,
          relationshipType,
          view,
          backendPaging,
          signal,
        ),
    );
  }

  getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.fanPaged(
      "getIncomingRelationshipEdges",
      "tolerant",
      relationshipIdentity,
      paging,
      (backend, backendPaging) =>
        backend.client.getIncomingRelationshipEdges(
          targetIdentifier,
          relationshipType,
          view,
          backendPaging,
          signal,
        ),
    );
  }

  /**
   * Fanned in across every backend and merged.
   *
   * STRICT: a backend that cannot answer makes the result silently short, and a
   * search that quietly omits a reactor's documents is indistinguishable from a
   * search that found nothing there. The refusal carries the partial page for a
   * caller that can use it.
   *
   * A filter naming `ids` or `slugs` is NOT narrowed to their owners first.
   * Narrowing would cost one resolution probe per identifier before the search
   * could start, and the fan-in is concurrent, so the narrow version is slower
   * for small sets and no better for large ones -- and a narrowed search can
   * MISS, because an identifier the router has not resolved yet would have to
   * be probed with the same fan-out the search itself performs.
   */
  find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.fanPaged(
      "find",
      "strict",
      documentIdentity,
      paging,
      (backend, backendPaging) =>
        backend.client.find(search, view, backendPaging, signal),
    );
  }

  /** True when ANY backend would serve it. */
  async isServed(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const answers = await this.fan("isServed", "tolerant", (backend) =>
      backend.client.isServed(identifier, view, signal),
    );
    return answers.includes(true);
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
        backend.client.evaluateActions(
          documentIdentifier,
          branch,
          candidates,
          subject,
          signal,
        ),
      ATTEMPT.read,
    );
  }

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  /**
   * Created on the PARENT's backend when there is a parent, because the
   * parent-child relationship is an operation on both documents and a v1
   * constraint keeps that within one reactor. Parentless, the document is its
   * own placement unit and the hash decides.
   */
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
        target.client.create<TDocument>(document, parentIdentifier, signal),
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
      (target) => target.client.createAsync(document, parentIdentifier, signal),
      ATTEMPT.write,
    );
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  /**
   * Created on the parent's backend; with no parent, on the primary.
   *
   * The primary rather than a hash: the reactor mints the id, so there is
   * nothing to hash at the moment the decision has to be made. A host that
   * wants a parentless document placed deliberately creates it with
   * {@link create} (which carries a header id) or names a parent.
   */
  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const backend = await this.placeNewDocument("", options?.parentIdentifier);
    const created = await this.dispatcher.onBackend(
      "createEmpty",
      backend,
      (target) =>
        target.client.createEmpty<TDocument>(
          documentModelType,
          options,
          signal,
        ),
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(created.header.id, backend.name);
    return created;
  }

  async createEmptyAsync(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<BatchExecutionResult> {
    const backend = await this.placeNewDocument("", options?.parentIdentifier);
    const result = await this.dispatcher.onBackend(
      "createEmptyAsync",
      backend,
      (target) =>
        target.client.createEmptyAsync(documentModelType, options, signal),
      ATTEMPT.write,
    );
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  async createDocumentInDrive<TDocument extends PHDocument>(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const created = await this.dispatcher.onCollection(
      "createDocumentInDrive",
      driveId,
      DEFAULT_BRANCH,
      (backend) =>
        backend.client.createDocumentInDrive<TDocument>(
          driveId,
          document,
          parentFolder,
          signal,
        ),
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(
      created.header.id,
      this.dispatcher.table.documentBackend(driveId),
    );
    return created;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  upgradeDocument<TDocument extends PHDocument = PHDocument>(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.dispatcher.onDocument(
      "upgradeDocument",
      documentIdentifier,
      (backend) =>
        backend.client.upgradeDocument<TDocument>(
          documentIdentifier,
          toVersion,
          options,
          signal,
        ),
      ATTEMPT.write,
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
        backend.client.execute<TDocument>(
          documentIdentifier,
          branch,
          actions,
          signal,
          subject,
        ),
      ATTEMPT.write,
    );
  }

  async executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    let owner = "";
    const job = await this.dispatcher.onDocument(
      "executeAsync",
      documentIdentifier,
      (backend) => {
        owner = backend.name;
        return backend.client.executeAsync(
          documentIdentifier,
          branch,
          actions,
          signal,
        );
      },
      ATTEMPT.write,
    );
    this.dispatcher.recordJob(job.id, owner);
    return job;
  }

  /**
   * Refused when the batch's documents do not all live on one backend (v1
   * constraint; see {@link CrossBackendBatchError}).
   *
   * The documents are resolved FIRST, before anything is submitted, so a
   * cross-backend batch is refused having executed nothing -- the refusal is a
   * precondition, not a partial result.
   */
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
      (target) => target.client.executeBatch(request, signal),
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
    const result = await this.dispatcher.onBackend(
      "loadBatch",
      backend,
      (target) => target.client.loadBatch(request, signal),
      ATTEMPT.write,
    );
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  rename(
    documentIdentifier: string,
    name: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.dispatcher.onDocument(
      "rename",
      documentIdentifier,
      (backend) =>
        backend.client.rename(documentIdentifier, name, branch, signal),
      ATTEMPT.write,
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
        backend.client.setPreferredEditor(
          documentIdentifier,
          preferredEditor,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  /**
   * Refused when source and target live on different backends (v1 constraint;
   * see {@link CrossBackendRelationshipError}). Checked before submitting.
   */
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
        backend.client.addRelationship(
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
        backend.client.updateRelationship(
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
        backend.client.removeRelationship(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          branch,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  /** Both parents and the target have to share a backend: it is one write. */
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
        backend.client.moveRelationship(
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
      (backend) => backend.client.deleteDocument(identifier, propagate, signal),
      ATTEMPT.write,
    );
  }

  /**
   * Refused when the identifiers do not all live on one backend.
   *
   * The same v1 constraint as a batch, and for the same reason: this is one
   * multi-document mutation, and splitting it per backend would leave a failure
   * halfway through with some documents deleted and some not, reported as a
   * single rejected call. Delete per backend explicitly if that is what you
   * want.
   */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    const backend = await this.singleBackendFor("deleteDocuments", identifiers);
    await this.dispatcher.onBackend(
      "deleteDocuments",
      backend,
      (target) => target.client.deleteDocuments(identifiers, propagate, signal),
      ATTEMPT.write,
    );
  }

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------

  /**
   * Routed by the backend that MINTED the job id, remembered at submission.
   *
   * Job ids are backend-local, so an unremembered id (a different client
   * submitted it, or the cache has rolled over) is asked of every backend and
   * the first real answer wins. The reactor answers an unknown id with a job
   * whose `documentId` is empty rather than by failing, so an unknown-id
   * response is treated as no answer -- otherwise the first backend asked would
   * always claim it.
   */
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo> {
    return this.onJob("getJobStatus", jobId, (backend) =>
      backend.client.getJobStatus(jobId, signal),
    );
  }

  waitForJob(jobId: string | JobInfo, signal?: AbortSignal): Promise<JobInfo> {
    const id = typeof jobId === "string" ? jobId : jobId.id;
    return this.onJob("waitForJob", id, (backend) =>
      backend.client.waitForJob(jobId, signal),
    );
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribes on EVERY backend and multiplexes the callbacks, because a search
   * filter spans collections and therefore reactors.
   *
   * De-duplicated by document and change: a drive that sync has replicated onto
   * two backends produces one change event per backend, and an application that
   * re-rendered twice per edit would be the most visible symptom of there being
   * more than one reactor behind this client. The key is the change type plus
   * each document's id, per-scope revisions and last-modified stamp -- a
   * document's revision advances monotonically per write, so two events that
   * agree on all of that are the same change seen twice, not two changes.
   *
   * The dedup memory is bounded ({@link DEFAULT_SUBSCRIPTION_DEDUP_SIZE}
   * events); a replica arriving later than that many intervening events is
   * delivered twice rather than held forever.
   *
   * A backend whose `subscribe` throws is reported through `onDiagnostic` and
   * skipped, so one failed reactor does not cost the caller every other
   * reactor's events. If EVERY backend refuses, the error is raised: an
   * unsubscribable router is not a working subscription.
   */
  subscribe(
    search: SearchFilter,
    callback: (event: DocumentChangeEvent) => void,
    view?: ViewFilter,
  ): () => void {
    const seen = new Set<string>();
    const order: string[] = [];
    const deliver = (event: DocumentChangeEvent): void => {
      const key = this.changeKey(event);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      order.push(key);
      if (order.length > this.dedupSize) {
        const oldest = order.shift();
        if (oldest !== undefined) {
          seen.delete(oldest);
        }
      }
      callback(event);
    };

    const unsubscribes: (() => void)[] = [];
    const failures: unknown[] = [];
    for (const backend of this.dispatcher.backends) {
      try {
        unsubscribes.push(backend.client.subscribe(search, deliver, view));
      } catch (error) {
        failures.push(error);
        this.dispatcher.onDiagnostic(
          `subscribe: backend ${backend.name} refused the subscription (${messageOf(error)})`,
          error,
        );
      }
    }
    if (unsubscribes.length === 0 && failures.length > 0) {
      rethrow(failures[0]);
    }
    return () => {
      for (const unsubscribe of unsubscribes) {
        try {
          unsubscribe();
        } catch (error) {
          this.dispatcher.onDiagnostic(
            `unsubscribe failed (${messageOf(error)})`,
            error,
          );
        }
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private changeKey(event: DocumentChangeEvent): string {
    const documents = event.documents
      .map(
        (document) =>
          `${document.header.id}@${JSON.stringify(document.header.revision)}@${document.header.lastModifiedAtUtcIso}`,
      )
      .join(",");
    const context = event.context ?? {};
    return `${event.type}|${documents}|${context.parentId ?? ""}|${context.childId ?? ""}|${context.purged === true ? "purged" : ""}`;
  }

  private fan<T>(
    operation: string,
    mode: FanInMode,
    call: (backend: ReactorBackend) => Promise<T>,
  ): Promise<readonly T[]> {
    return fanIn(operation, this.dispatcher.backends, call, {
      mode,
      onDiagnostic: this.dispatcher.onDiagnostic,
    }).then((answers) => answers.map((answer) => answer.value));
  }

  private fanPaged<T>(
    operation: string,
    mode: FanInMode,
    identify: (item: T) => string,
    paging: PagingOptions | undefined,
    call: (
      backend: ReactorBackend,
      backendPaging: PagingOptions | undefined,
    ) => Promise<PagedResults<T>>,
  ): Promise<PagedResults<T>> {
    const participants = pagedParticipants(
      operation,
      this.dispatcher.backends,
      paging,
    );
    return mergePaged(participants, call, {
      operation,
      mode,
      onDiagnostic: this.dispatcher.onDiagnostic,
      identify,
      paging,
    });
  }

  private async onJob<T>(
    operation: string,
    jobId: string,
    call: (backend: ReactorBackend) => Promise<T>,
  ): Promise<T> {
    const remembered = this.dispatcher.table.jobBackend(jobId);
    if (remembered !== "" && this.dispatcher.table.has(remembered)) {
      return call(this.dispatcher.table.backend(remembered, `job ${jobId}`));
    }
    let first: unknown = undefined;
    for (const backend of this.dispatcher.backends) {
      try {
        const answer = await call(backend);
        if (isUnknownJob(answer)) {
          continue;
        }
        this.dispatcher.recordJob(jobId, backend.name);
        return answer;
      } catch (error) {
        first = first ?? error;
      }
    }
    if (first !== undefined) {
      rethrow(first);
    }
    throw new Error(
      `${operation}: no backend of this router knows job ${JSON.stringify(jobId)}`,
    );
  }

  private async placeNewDocument(
    documentId: string,
    parentIdentifier?: string,
  ): Promise<ReactorBackend> {
    if (parentIdentifier !== undefined && parentIdentifier !== "") {
      return this.dispatcher.resolveDocumentBackend(parentIdentifier);
    }
    if (documentId !== "") {
      return this.dispatcher.table.standaloneRoute(documentId);
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

  /**
   * The one backend every identifier resolves to, or a refusal naming where
   * they went. Resolution happens before anything is submitted.
   */
  private async singleBackendFor(
    operation: string,
    identifiers: readonly string[],
  ): Promise<ReactorBackend> {
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
    const spans = resolved.some(
      (entry) => entry.backend.name !== first.backend.name,
    );
    if (spans) {
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
    if (sourceBackend.name === targetBackend.name) {
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

/**
 * Whether a `JobInfo` is the reactor's "I have never heard of this job"
 * answer. `IReactorClient.getJobStatus` documents `documentId` as "empty string
 * when the job is unknown", which is the only signal available for it.
 */
function isUnknownJob(answer: unknown): boolean {
  if (typeof answer !== "object" || answer === null) {
    return false;
  }
  const candidate = answer as { documentId?: unknown; id?: unknown };
  return candidate.documentId === "" && typeof candidate.id === "string";
}
