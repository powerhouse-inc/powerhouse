// The reactor client one piece step gets: the host's client, acting as the
// run user within the step's declaration, connection and deadline (ADR 0005).
import {
  assertActionsApplied,
  type IndexQueryRequest,
  type IndexQueryResult,
  type ReactorClient,
  type ReactorWriteClient,
} from "@powerhousedao/pieces-framework";
import {
  createEmptyDocument,
  deleteDocumentAction,
  jobIdsOf,
  JobStatus,
  placeholderJob,
  PropagationMode,
  remoteStagePort,
  WriteHandleFactory,
  type ActionCandidate,
  type ActionEvaluations,
  type ConsistencyToken,
  type DocumentRelationship,
  type HandleReader,
  type IReactorClient,
  type JobInfo,
  type NodeWriteHandle,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type RemoteReads,
  type SearchFilter,
  type ViewFilter,
  type WriteHandle,
} from "@powerhousedao/reactor";
import {
  isFolderNode,
  type FolderNode,
  type Node,
} from "@powerhousedao/shared/document-drive";
import {
  DOCUMENT_SCOPE_ACTION_TYPES,
  initializeAuth,
  normalizeDocumentModelVersion,
  withSignaturePolicy,
  type Action,
  type AuthSubject,
  type DocumentModelModule,
  type Grant,
  type Operation,
  type PHDocument,
  type Principal,
} from "@powerhousedao/shared/document-model";
import type { WorkflowRuntimeHostDeps } from "./host.js";
import { authEnforced, NO_RUN_USER_DENIAL } from "./reactor-access.js";
import {
  accessDenied,
  ReactorActionsDeniedError,
  ReactorError,
  ReactorJobFailedError,
  ReactorJobPendingError,
} from "./reactor-errors.js";
import type { RunScope } from "./run-scope.js";

export type RunScopedHostDeps = Pick<
  WorkflowRuntimeHostDeps,
  "authEnforcement" | "queryIndex"
>;

export interface RunScopedReactorClientOptions {
  // Largest page a listing serves.
  maxPageLimit?: number;
  // Granted execute, beside the run user, on documents the run creates.
  hostPrincipal?: Principal;
}

export const DEFAULT_MAX_PAGE_LIMIT = 100;

const JOB_NOT_FOUND = "Job not found";

// Stop waiting this long before the deadline, to report why.
const MIN_DEADLINE_MARGIN_MS = 250;
const MAX_DEADLINE_MARGIN_MS = 2_000;

export function deadlineMargin(budgetMs: number): number {
  return Math.min(
    Math.max(Math.floor(budgetMs / 10), MIN_DEADLINE_MARGIN_MS),
    MAX_DEADLINE_MARGIN_MS,
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jobPending(jobId: string, status: string): ReactorError {
  return new ReactorError(
    ReactorJobPendingError,
    status === "UNKNOWN"
      ? `Reactor job ${jobId} is unknown to the reactor, as after a restart; its actions may or may not have been written`
      : `Reactor job ${jobId} was still ${status} at the step deadline; its actions may yet be written`,
  );
}

// The reactor's admission refused the host, which signs every write.
const AUTHORIZATION_DENIED = "AuthorizationDeniedError";

function jobFailed(job: JobInfo): ReactorError {
  const error = job.error;
  // The reactor's message names the operation, scope and document.
  if (
    error?.name === AUTHORIZATION_DENIED ||
    error?.message.startsWith("Authorization denied")
  ) {
    return accessDenied(
      `The Switchboard has no grant for this operation: ${error.message}`,
    );
  }
  return new ReactorError(
    ReactorJobFailedError,
    `Reactor job ${job.id} failed: ${job.error?.message ?? "unknown error"}`,
  );
}

const DOCUMENT_DRIVE = "powerhouse/document-drive";
const REACTOR_DRIVE = "powerhouse/reactor-drive";

type DriveType = typeof DOCUMENT_DRIVE | typeof REACTOR_DRIVE;

type DriveTarget = { id: string; documentType: DriveType };

function isDriveType(documentType: string): documentType is DriveType {
  return documentType === DOCUMENT_DRIVE || documentType === REACTOR_DRIVE;
}

// The drive-side action of a file added: a document drive's ADD_FILE, or a
// reactor drive's child relationship.
function fileCandidate(
  drive: DriveTarget,
  document: PHDocument,
  parentFolder: string | undefined,
): ActionCandidate {
  const { id, documentType, name } = document.header;
  if (drive.documentType === DOCUMENT_DRIVE) {
    return {
      scope: "global",
      type: "ADD_FILE",
      input: { id, name: name || id, documentType, parentFolder },
    };
  }
  return {
    scope: "document",
    type: "ADD_RELATIONSHIP",
    input: {
      sourceId: drive.id,
      targetId: id,
      relationshipType: "drive/child",
      metadata: {
        kind: "file",
        parentFolderId: parentFolder ?? null,
        documentType,
      },
    },
  };
}

function folderCandidate(
  drive: DriveTarget,
  name: string,
  parentFolder: string | undefined,
): ActionCandidate {
  return drive.documentType === DOCUMENT_DRIVE
    ? { scope: "global", type: "ADD_FOLDER", input: { name, parentFolder } }
    : {
        scope: "document",
        type: "ADD_FOLDER",
        input: { name, parentFolderId: parentFolder ?? null },
      };
}

// The piece surface; `servedClient` refuses every other method. Reads pass
// the run user as subject; writes pass `evaluateActions` as the run user.
export class RunScopedReactorClient implements ReactorClient {
  private readonly stopAt: number;
  private readonly maxPageLimit: number;
  // Jobs this client submitted, the only ones `read` answers for.
  private readonly jobs = new Set<string>();
  private readonly handles: WriteHandleFactory;

  constructor(
    private readonly inner: IReactorClient,
    private readonly scope: RunScope,
    private readonly host: RunScopedHostDeps,
    private readonly options: RunScopedReactorClientOptions = {},
  ) {
    this.stopAt = scope.deadline - deadlineMargin(scope.deadline - Date.now());
    this.maxPageLimit = options.maxPageLimit ?? DEFAULT_MAX_PAGE_LIMIT;
    this.handles = new WriteHandleFactory(remoteStagePort(this.read));
  }

  // --- Reads -------------------------------------------------------------

  async getDocumentModelModules(
    namespace?: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentModelModule>> {
    this.assertAccess();
    return this.inner.getDocumentModelModules(
      namespace,
      this.paging(paging),
      this.signal(signal),
    );
  }

  getDocumentModelModule(
    documentType: string,
  ): Promise<DocumentModelModule<any>> {
    this.assertAccess();
    return this.inner.getDocumentModelModule(documentType);
  }

  getDocumentModelModuleForDocument(
    document: PHDocument,
  ): Promise<DocumentModelModule<any>> {
    this.assertAccess();
    return this.inner.getDocumentModelModuleForDocument(document);
  }

  async get<TDocument extends PHDocument>(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
    consistencyToken?: ConsistencyToken,
  ): Promise<TDocument> {
    const document = await this.inner.get<TDocument>(
      identifier,
      this.readView(view),
      this.signal(signal),
      consistencyToken,
    );
    await this.scope.journal.recordDocuments([document.header.id]);
    return document;
  }

  resolveIdOrSlug(
    identifier: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.inner.resolveIdOrSlug(
      identifier,
      this.readView(view),
      this.signal(signal),
    );
  }

  async getOperations(
    documentIdentifier: string,
    view?: ViewFilter,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    const readView = this.readView(view);
    const abort = this.signal(signal);
    const id = await this.inner.resolveIdOrSlug(
      documentIdentifier,
      readView,
      abort,
    );
    const page = await this.inner.getOperations(
      id,
      readView,
      filter,
      this.paging(paging),
      abort,
    );
    return this.journaled(page, () => [id]);
  }

  async getOutgoingRelationships(
    sourceIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.documents(
      await this.inner.getOutgoingRelationships(
        sourceIdentifier,
        relationshipType,
        this.readView(view),
        this.paging(paging),
        this.signal(signal),
      ),
    );
  }

  async getIncomingRelationships(
    targetIdentifier: string,
    relationshipType: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.documents(
      await this.inner.getIncomingRelationships(
        targetIdentifier,
        relationshipType,
        this.readView(view),
        this.paging(paging),
        this.signal(signal),
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
    return this.inner.getOutgoingRelationshipEdges(
      sourceIdentifier,
      relationshipType,
      this.readView(view),
      this.paging(paging),
      this.signal(signal),
    );
  }

  getIncomingRelationshipEdges(
    targetIdentifier: string,
    relationshipType?: string,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DocumentRelationship>> {
    return this.inner.getIncomingRelationshipEdges(
      targetIdentifier,
      relationshipType,
      this.readView(view),
      this.paging(paging),
      this.signal(signal),
    );
  }

  async find(
    search: SearchFilter,
    view?: ViewFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<PHDocument>> {
    return this.documents(
      await this.inner.find(
        search,
        this.readView(view),
        this.paging(paging),
        this.signal(signal),
      ),
    );
  }

  // A read-model index, answered by the host as the run user: the index's own
  // access declarations decide, as they would for the same user over HTTP.
  // No run user under enforcement reads nothing, as every other read.
  async query(
    request: IndexQueryRequest,
    signal?: AbortSignal,
  ): Promise<IndexQueryResult> {
    const queryIndex = this.host.queryIndex;
    if (!queryIndex) {
      throw accessDenied(
        "This host serves no read-model indexes to pieces (reactor.query)",
      );
    }
    this.assertAccess();
    return queryIndex(request, this.scope.runUser, this.signal(signal));
  }

  // --- Writes ------------------------------------------------------------

  // The write half: each write answers once its jobs are accepted, with a
  // handle over `read`. A reducer error is on the receipt, not thrown.
  readonly write: ReactorWriteClient = {
    create: (document, parentIdentifier, signal) =>
      this.writeCreate(document, parentIdentifier, signal),
    createEmpty: (documentModelType, options, signal) =>
      this.writeCreateEmpty(
        "write.createEmpty",
        documentModelType,
        options,
        this.signal(signal),
      ),
    execute: (documentIdentifier, branch, actions, signal) =>
      this.submitExecute(
        "write.execute",
        documentIdentifier,
        branch,
        actions,
        this.signal(signal),
      ),
    deleteDocument: (identifier, propagate, signal) =>
      this.submitDelete(
        "write.deleteDocument",
        identifier,
        propagate,
        this.signal(signal),
      ),
    drives: {
      addFile: (driveIdentifier, document, parentFolder, signal) =>
        this.submitAddFile(
          "write.drives.addFile",
          driveIdentifier,
          document,
          parentFolder,
          this.signal(signal),
        ),
      addFolder: (driveIdentifier, name, parentFolder, signal) =>
        this.submitAddFolder(
          "write.drives.addFolder",
          driveIdentifier,
          name,
          parentFolder,
          this.signal(signal),
        ),
    },
  };

  // What a write handle reads through: this client's own jobs, within the
  // deadline, and documents gated as `get` gates them.
  readonly read: RemoteReads = {
    waitForJob: async (jobId, signal) => {
      this.assertOwnJob(jobId);
      return this.settle(jobId, this.signal(signal));
    },
    getJobStatus: async (jobId, signal) => {
      this.assertOwnJob(jobId);
      return this.inner.getJobStatus(jobId, this.signal(signal));
    },
    get: (identifier, view, signal, consistencyToken) =>
      this.get(identifier, view, signal, consistencyToken),
  };

  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.assertWritable("create");
    const abort = this.signal(signal);
    const parentId = await this.parentOf(parentIdentifier, abort);
    const handle = await this.submitCreate(document, parentId, abort);
    return this.createdBack<TDocument>(handle, abort);
  }

  async newDocument<TDocument extends PHDocument = PHDocument>(
    documentModelType: string,
    options?: Parameters<IReactorClient["newDocument"]>[1],
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.assertWritable("newDocument");
    const abort = this.signal(signal);
    const module = await this.modelModule(
      documentModelType,
      options?.documentModelVersion,
      abort,
    );
    const parentId = await this.parentOf(options?.parentIdentifier, abort);
    const base = await this.inner.getCreateProtocolVersions(
      { documentType: documentModelType, parentIdentifier: parentId },
      abort,
    );
    return createEmptyDocument(
      module,
      options,
      await this.inner.getCreateSignaturePolicy(),
      base,
    ) as TDocument;
  }

  async createEmpty<TDocument extends PHDocument>(
    documentModelType: string,
    options?: Parameters<IReactorClient["createEmpty"]>[1],
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const abort = this.signal(signal);
    const handle = await this.writeCreateEmpty(
      "createEmpty",
      documentModelType,
      options,
      abort,
    );
    return this.createdBack<TDocument>(handle, abort);
  }

  async execute<TDocument extends PHDocument>(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    subject?: AuthSubject,
  ): Promise<TDocument> {
    if (subject !== undefined) {
      throw accessDenied("A piece may not choose the subject it reads as");
    }
    const abort = this.signal(signal);
    const handle = await this.submitExecute(
      "execute",
      documentIdentifier,
      branch,
      actions,
      abort,
    );
    await this.landed(handle, abort, actions);
    return this.readBack<TDocument>(handle.documentId, branch, abort);
  }

  // As `execute`, and answered at the same point (every action applied, or a
  // throw), but with the settled job and no read of the document.
  async executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const abort = this.signal(signal);
    const handle = await this.submitExecute(
      "executeAsync",
      documentIdentifier,
      branch,
      actions,
      abort,
    );
    return this.landed(handle, abort, actions);
  }

  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    const abort = this.signal(signal);
    const handle = await this.submitDelete(
      "deleteDocument",
      identifier,
      propagate,
      abort,
    );
    await this.landed(handle, abort);
  }

  private async writeCreate(
    document: PHDocument,
    parentIdentifier: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<WriteHandle> {
    this.assertWritable("write.create");
    const abort = this.signal(signal);
    const parentId = await this.parentOf(parentIdentifier, abort);
    return this.submitCreate(document, parentId, abort);
  }

  private async writeCreateEmpty(
    method: string,
    documentModelType: string,
    options: Parameters<IReactorClient["createEmpty"]>[1],
    abort: AbortSignal,
  ): Promise<WriteHandle> {
    this.assertWritable(method);
    const document = await this.newDocument(documentModelType, options, abort);
    const parentId = await this.parentOf(options?.parentIdentifier, abort);
    return this.submitCreate(document, parentId, abort);
  }

  // The checks and the gate, then the job.
  private async submitExecute(
    method: string,
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    abort: AbortSignal,
  ): Promise<WriteHandle> {
    this.assertWritable(method);
    for (const action of actions) {
      if (action.context?.signer) {
        throw accessDenied(
          `Action ${action.type} carries a signer; the host signs every action`,
        );
      }
      // Pieces change documents through model operations only.
      if (DOCUMENT_SCOPE_ACTION_TYPES.has(action.type)) {
        throw accessDenied(
          `${action.type} is a document lifecycle action, which pieces may not execute`,
        );
      }
    }
    const id = await this.resolveReference(documentIdentifier, branch, abort);
    await this.gate(id, branch, actions, abort);
    return this.submit(id, branch, actions, abort);
  }

  // The run user's DELETE_DOCUMENT passes the gate; the client's parent edge
  // removals ride on the Switchboard's grant.
  private async submitDelete(
    method: string,
    identifier: string,
    propagate: PropagationMode | undefined,
    abort: AbortSignal,
  ): Promise<WriteHandle> {
    this.assertWritable(method);
    if (propagate === PropagationMode.Cascade) {
      throw accessDenied("Cascade delete is not offered to pieces");
    }
    const id = await this.resolveReference(identifier, "main", abort);
    await this.gate(id, "main", [deleteDocumentAction(id)], abort);
    this.assertTimeLeft("a delete");
    await this.scope.journal.recordDocuments([id]);
    const submitted = await this.inner.write.deleteDocument(
      id,
      undefined,
      abort,
    );
    return this.handle(submitted, await this.track(submitted, () => [id]));
  }

  // --- Drives ------------------------------------------------------------

  // Checked before the inner client signs as the host: the drive is read and
  // the drive-side action gated as the run user; a new file gets its grant.
  readonly drives: ReactorClient["drives"] = {
    getNode: (driveIdentifier, nodeId, signal) =>
      this.getNode(driveIdentifier, nodeId, signal),
    listNodes: (driveIdentifier, parentFolder, paging, signal) =>
      this.listNodes(driveIdentifier, parentFolder, paging, signal),
    addFile: (driveIdentifier, document, parentFolder, signal) =>
      this.addFile(driveIdentifier, document, parentFolder, signal),
    addFolder: (driveIdentifier, name, parentFolder, signal) =>
      this.addFolder(driveIdentifier, name, parentFolder, signal),
  };

  private async getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    const abort = this.signal(signal);
    const drive = await this.readDrive(driveIdentifier, abort);
    return this.inner.drives.getNode(drive.id, nodeId, abort);
  }

  private async listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    const abort = this.signal(signal);
    const drive = await this.readDrive(driveIdentifier, abort);
    return this.inner.drives.listNodes(
      drive.id,
      parentFolder,
      this.paging(paging),
      abort,
    );
  }

  private async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const abort = this.signal(signal);
    const handle = await this.submitAddFile(
      "drives.addFile",
      driveIdentifier,
      document,
      parentFolder,
      abort,
    );
    return this.createdBack<TDocument>(handle, abort, true);
  }

  private async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    const abort = this.signal(signal);
    const handle = await this.submitAddFolder(
      "drives.addFolder",
      driveIdentifier,
      name,
      parentFolder,
      abort,
    );
    await this.landed(handle, abort);
    const node = await this.inner.drives.getNode(
      handle.documentId,
      handle.nodeId,
      abort,
    );
    if (!isFolderNode(node)) throw new Error("Folder creation failed");
    return node;
  }

  // The document batch has completed when the inner write answers.
  private async submitAddFile(
    method: string,
    driveIdentifier: string,
    document: PHDocument,
    parentFolder: string | undefined,
    abort: AbortSignal,
  ): Promise<WriteHandle> {
    this.assertWritable(method);
    const drive = await this.readDrive(driveIdentifier, abort);
    const prepared = withSignaturePolicy(
      document,
      await this.inner.getCreateSignaturePolicy(),
    );
    const documentId = prepared.header.id;
    await this.gateCandidates(
      drive.id,
      "main",
      [fileCandidate(drive, prepared, parentFolder)],
      abort,
    );
    this.assertTimeLeft(`a ${prepared.header.documentType} document`);
    await this.scope.journal.recordDocuments([drive.id, documentId]);
    const submitted = await this.inner.write.drives.addFile(
      drive.id,
      prepared,
      parentFolder,
      abort,
    );
    const jobIds = await this.track(submitted, () => [drive.id, documentId]);
    return this.withGrant(submitted, jobIds, abort, true);
  }

  private async submitAddFolder(
    method: string,
    driveIdentifier: string,
    name: string,
    parentFolder: string | undefined,
    abort: AbortSignal,
  ): Promise<NodeWriteHandle> {
    this.assertWritable(method);
    const drive = await this.readDrive(driveIdentifier, abort);
    await this.gateCandidates(
      drive.id,
      "main",
      [folderCandidate(drive, name, parentFolder)],
      abort,
    );
    this.assertTimeLeft("a folder");
    await this.scope.journal.recordDocuments([drive.id]);
    const submitted = await this.inner.write.drives.addFolder(
      drive.id,
      name,
      parentFolder,
      abort,
    );
    const jobIds = await this.track(submitted, () => [drive.id]);
    return Object.assign(this.handle(submitted, jobIds), {
      nodeId: submitted.nodeId,
    });
  }

  // The drive's header, read as the run user; a type with no known node
  // write is refused before anything is submitted.
  private async readDrive(
    driveIdentifier: string,
    signal: AbortSignal,
  ): Promise<DriveTarget> {
    const drive = await this.inner.get(
      driveIdentifier,
      this.readView({ scopes: ["document"] }),
      signal,
    );
    const { id, documentType } = drive.header;
    if (!isDriveType(documentType)) {
      throw accessDenied(`Document ${id} is a ${documentType}, not a drive`);
    }
    await this.scope.journal.recordDocuments([id]);
    return { id, documentType };
  }

  // --- Access ------------------------------------------------------------

  private get subject(): AuthSubject | undefined {
    return this.scope.runUser?.subject;
  }

  private assertAccess(): void {
    if (this.scope.runUser === null && authEnforced(this.host)) {
      throw accessDenied(NO_RUN_USER_DENIAL);
    }
  }

  // The declaration and the connection's access, for a write method.
  private assertWritable(method: string): void {
    this.assertAccess();
    if (this.scope.requireReactor !== "write") {
      throw accessDenied(
        `${method} writes, and this step declares read access only`,
      );
    }
    if (this.scope.connection.access !== "write") {
      throw accessDenied(
        `${method} writes, and the reactor connection grants read access only`,
      );
    }
  }

  private readView(view?: ViewFilter): ViewFilter {
    this.assertAccess();
    if (view?.subject !== undefined) {
      throw accessDenied("A piece may not choose the subject it reads as");
    }
    return { ...view, subject: this.subject };
  }

  private signal(signal?: AbortSignal): AbortSignal {
    const deadline = AbortSignal.timeout(
      Math.max(0, this.scope.deadline - Date.now()),
    );
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
  }

  private paging(paging?: PagingOptions): PagingOptions {
    return {
      cursor: paging?.cursor ?? "",
      limit: Math.min(paging?.limit ?? this.maxPageLimit, this.maxPageLimit),
    };
  }

  // What admission would decide for the run user.
  private async gate(
    documentId: string,
    branch: string,
    actions: readonly Action[],
    signal: AbortSignal,
  ): Promise<void> {
    await this.gateCandidates(
      documentId,
      branch,
      actions.map((action) => ({
        scope: action.scope,
        type: action.type,
        input: action.input,
      })),
      signal,
    );
  }

  private async gateCandidates(
    documentId: string,
    branch: string,
    candidates: ActionCandidate[],
    signal: AbortSignal,
  ): Promise<void> {
    if (!authEnforced(this.host) || candidates.length === 0) return;
    let answer: ActionEvaluations;
    try {
      answer = await this.inner.evaluateActions(
        documentId,
        branch,
        candidates,
        this.subject,
        signal,
      );
    } catch (error) {
      throw accessDenied(
        `Could not check the run user's access to document ${documentId}: ${messageOf(error)}`,
      );
    }
    const denied = answer.evaluations.flatMap((evaluation, index) =>
      evaluation.decision === "deny"
        ? [{ index, type: candidates[index].type, reason: evaluation.reason }]
        : [],
    );
    if (denied.length > 0) {
      throw new ReactorActionsDeniedError(documentId, denied);
    }
  }

  // --- Write path ----------------------------------------------------------

  private async submit(
    documentId: string,
    branch: string,
    actions: Action[],
    signal: AbortSignal,
  ): Promise<WriteHandle> {
    this.assertTimeLeft(`${actions.length} action(s)`);
    const submitted = await this.inner.write.execute(
      documentId,
      branch,
      actions,
      signal,
    );
    return this.handle(
      submitted,
      await this.track(submitted, () => [documentId]),
    );
  }

  // Submits actions; throws unless every action applied. Answers the job.
  private async run(
    documentId: string,
    branch: string,
    actions: Action[],
    signal: AbortSignal,
  ): Promise<JobInfo> {
    const handle = await this.submit(documentId, branch, actions, signal);
    return this.landed(handle, signal, actions);
  }

  // Journals a write's jobs at submit and opens them to `read`, own job first.
  private async track(
    submitted: WriteHandle,
    documentsOf: (jobId: string) => string[],
  ): Promise<string[]> {
    const jobIds = [
      submitted.jobId,
      ...jobIdsOf(submitted).filter((jobId) => jobId !== submitted.jobId),
    ].filter((jobId) => jobId !== "");
    for (const jobId of jobIds) {
      this.jobs.add(jobId);
      await this.scope.journal.recordJob(jobId, documentsOf(jobId));
    }
    return jobIds;
  }

  // The handle a piece rebuilds: these jobs, read back through `read`.
  private handle(submitted: WriteHandle, jobIds: string[]): WriteHandle {
    const { documentId, branch } = submitted;
    const reader: HandleReader = (receipt, view, signal) =>
      this.get(
        documentId,
        { ...view, branch: receipt.branch },
        signal,
        receipt.token,
      );
    return jobIds.length === 0
      ? this.handles.settled(documentId, branch, reader)
      : this.handles.forJobs(
          submitted.jobId,
          jobIds.map((jobId) => placeholderJob(jobId, documentId)),
          documentId,
          branch,
          undefined,
          reader,
        );
  }

  // The facade's wait: every job of the write settled and applied, or a
  // throw. Answers the write's own job.
  private async landed(
    handle: WriteHandle,
    signal: AbortSignal,
    actions?: readonly Action[],
    onLanded?: (jobId: string) => void,
  ): Promise<JobInfo> {
    let own: JobInfo | undefined;
    for (const jobId of jobIdsOf(handle)) {
      const job = await this.settle(jobId, signal);
      if (job.status === JobStatus.FAILED) throw jobFailed(job);
      assertActionsApplied(job, jobId === handle.jobId ? actions : undefined);
      if (jobId === handle.jobId) own = job;
      onLanded?.(jobId);
    }
    return own ?? (await handle.readable).job;
  }

  // The facade's read-back of a document a write created; once it exists, a
  // later failure says so.
  private async createdBack<TDocument extends PHDocument = PHDocument>(
    handle: WriteHandle,
    signal: AbortSignal,
    created = false,
  ): Promise<TDocument> {
    try {
      await this.landed(handle, signal, undefined, (jobId) => {
        if (jobId === handle.jobId) created = true;
      });
      return await this.readBack<TDocument>(
        handle.documentId,
        handle.branch,
        signal,
      );
    } catch (error) {
      if (created && error instanceof Error) {
        error.message = `Document ${handle.documentId} was created, but: ${error.message}`;
      }
      throw error;
    }
  }

  private assertTimeLeft(what: string): void {
    if (Date.now() >= this.stopAt) {
      throw new Error(
        `No time was left before the step deadline to submit ${what}; nothing was submitted`,
      );
    }
  }

  private assertOwnJob(jobId: string): void {
    if (!this.jobs.has(jobId)) {
      throw accessDenied(`Job ${String(jobId)} was not submitted by this step`);
    }
  }

  // Answers a job READ_READY or FAILED, or throws it pending at the deadline.
  private async settle(jobId: string, signal: AbortSignal): Promise<JobInfo> {
    let status: string = JobStatus.PENDING;
    for (;;) {
      const remaining = this.stopAt - Date.now();
      if (remaining <= 0) throw jobPending(jobId, status);
      const wait = AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
      let job: JobInfo;
      try {
        job = await this.inner.waitForJob(jobId, wait);
      } catch (error) {
        // The caller's abort is its own; only the deadline reports pending.
        if (!wait.aborted || signal.aborted) throw error;
        job = await this.inner.getJobStatus(jobId).catch(() => {
          throw jobPending(jobId, status);
        });
        if (
          job.status !== JobStatus.READ_READY &&
          job.status !== JobStatus.FAILED
        ) {
          throw jobPending(jobId, job.status);
        }
      }
      if (job.status === JobStatus.FAILED) {
        if (job.error?.message === JOB_NOT_FOUND) {
          throw jobPending(jobId, "UNKNOWN");
        }
        return job;
      }
      if (job.status === JobStatus.READ_READY) return job;
      status = job.status;
    }
  }

  private async readBack<TDocument extends PHDocument = PHDocument>(
    documentId: string,
    branch: string,
    signal: AbortSignal,
  ): Promise<TDocument> {
    const document = await this.inner.get<TDocument>(
      documentId,
      { branch, subject: this.subject },
      signal,
    );
    await this.scope.journal.recordDocuments([documentId]);
    return document;
  }

  // Submits a create. With a run user, waits for it to land and grants the run
  // user; the grant's job joins the handle.
  private async submitCreate(
    document: PHDocument,
    parentId: string | undefined,
    signal: AbortSignal,
  ): Promise<WriteHandle> {
    // New documents get the host's create signature policy.
    const prepared = withSignaturePolicy(
      document,
      await this.inner.getCreateSignaturePolicy(),
    );
    const documentId = prepared.header.id;
    this.assertTimeLeft(`a ${prepared.header.documentType} document`);
    const submitted = await this.inner.write.create(prepared, parentId, signal);
    const jobIds = await this.track(submitted, (jobId) =>
      jobId === submitted.jobId || parentId === undefined
        ? [documentId]
        : [parentId, documentId],
    );
    return this.withGrant(submitted, jobIds, signal);
  }

  // Once every job has settled; a failed one is left for the handle to report.
  private async withGrant(
    submitted: WriteHandle,
    jobIds: string[],
    signal: AbortSignal,
    created = false,
  ): Promise<WriteHandle> {
    if (!this.scope.runUser) return this.handle(submitted, jobIds);
    try {
      for (const jobId of jobIds) {
        const job = await this.settle(jobId, signal);
        if (job.status === JobStatus.FAILED) {
          return this.handle(submitted, jobIds);
        }
        created = true;
      }
      const grant = await this.grantRunUser(submitted.documentId, signal);
      return this.handle(submitted, grant ? [...jobIds, grant.id] : jobIds);
    } catch (error) {
      if (created && error instanceof Error) {
        error.message = `Document ${submitted.documentId} was created, but: ${error.message}`;
      }
      throw error;
    }
  }

  // A document the run creates starts with a grant for its user.
  private async grantRunUser(
    documentId: string,
    signal: AbortSignal,
  ): Promise<JobInfo | undefined> {
    const runUser = this.scope.runUser;
    if (!runUser) return undefined;
    const created = await this.inner.get(documentId, undefined, signal);
    if (created.state.auth.version !== 0) return undefined;
    const grants: Grant[] = [
      {
        id: "run-user",
        description: "The user whose workflow run created this document",
        effect: "allow",
        principal: { address: runUser.address },
        capability: { can: "execute" },
      },
    ];
    if (this.options.hostPrincipal) {
      grants.push({
        id: "run-host",
        description: "The host that runs the workflow",
        effect: "allow",
        principal: this.options.hostPrincipal,
        capability: { can: "execute" },
      });
    }
    return this.run(
      documentId,
      "main",
      [initializeAuth({ version: 1, grants })],
      signal,
    );
  }

  // --- Helpers -------------------------------------------------------------

  private parentOf(
    identifier: string | undefined,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    return identifier === undefined
      ? Promise.resolve(undefined)
      : this.resolveReference(identifier, "main", signal);
  }

  // An id no document has is taken as given, as the client does.
  private async resolveReference(
    identifier: string,
    branch: string,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      return await this.inner.resolveIdOrSlug(identifier, { branch }, signal);
    } catch {
      return identifier;
    }
  }

  private async modelModule(
    documentType: string,
    version: number | undefined,
    signal: AbortSignal,
  ): Promise<DocumentModelModule> {
    if (version === undefined) {
      return this.inner.getDocumentModelModule(documentType);
    }
    const requested = normalizeDocumentModelVersion(version);
    let page = await this.inner.getDocumentModelModules(
      undefined,
      undefined,
      signal,
    );
    for (;;) {
      const module = page.results.find(
        (m) =>
          m.documentModel.global.id === documentType &&
          normalizeDocumentModelVersion(m.version) === requested,
      );
      if (module) return module;
      if (!page.next) break;
      page = await page.next();
    }
    throw new Error(
      `Document model not found for type: ${documentType} with version: ${version}`,
    );
  }

  private documents(
    page: PagedResults<PHDocument>,
  ): Promise<PagedResults<PHDocument>> {
    return this.journaled(page, (documents) =>
      documents.map((document) => document.header.id),
    );
  }

  // Journals each page's documents, later pages included.
  private async journaled<T>(
    page: PagedResults<T>,
    idsOf: (results: T[]) => string[],
  ): Promise<PagedResults<T>> {
    await this.scope.journal.recordDocuments(idsOf(page.results));
    const next = page.next;
    return {
      ...page,
      next: next ? async () => this.journaled(await next(), idsOf) : undefined,
    };
  }
}
