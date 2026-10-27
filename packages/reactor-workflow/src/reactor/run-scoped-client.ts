// The reactor client one piece step gets: the host's client, acting as the
// run user within the step's declaration, connection and deadline (ADR 0005).
import type { ReactorClient } from "@powerhousedao/pieces-framework";
import {
  createEmptyDocument,
  deleteDocumentAction,
  JobStatus,
  PropagationMode,
  type ActionCandidate,
  type ActionEvaluations,
  type DocumentRelationship,
  type IReactorClient,
  type JobInfo,
  type OperationFilter,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type { FolderNode, Node } from "@powerhousedao/shared/document-drive";
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
  ReactorActionsFailedError,
  ReactorError,
  ReactorJobFailedError,
  ReactorJobPendingError,
} from "./reactor-errors.js";
import type { RunScope } from "./run-scope.js";

export type RunScopedHostDeps = Pick<
  WorkflowRuntimeHostDeps,
  "authEnforcement"
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
  if (error?.name === AUTHORIZATION_DENIED) {
    return accessDenied(
      `The Switchboard has no grant for this operation: ${error.message}`,
    );
  }
  return new ReactorError(
    ReactorJobFailedError,
    `Reactor job ${job.id} failed: ${job.error?.message ?? "unknown error"}`,
  );
}

// A reducer error or a denial does not fail the job, so each action is checked.
function assertActionsApplied(job: JobInfo, actions?: readonly Action[]): void {
  const outcomes = job.result?.actions ?? [];
  const byId = new Map(outcomes.map((outcome) => [outcome.actionId, outcome]));
  // Without `actions` (a create's own), each outcome names its action by id.
  const named =
    actions?.map((action) => ({ id: action.id, label: action.type })) ??
    outcomes.map((outcome) => ({
      id: outcome.actionId,
      label: outcome.actionId,
    }));
  const failed = named.flatMap(({ id, label }) => {
    const outcome = byId.get(id);
    if (!outcome) return [`Action ${label} produced no operation`];
    if (outcome.kind === "reducer-error") {
      return [`Action ${label} failed: ${outcome.message}`];
    }
    if (outcome.kind === "denied") {
      return [`Action ${label} was denied: ${outcome.reason}`];
    }
    return [];
  });
  if (failed.length > 0) {
    throw new ReactorError(ReactorActionsFailedError, failed.join("; "));
  }
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
// the run user as subject; `execute` passes `evaluateActions` as the run user.
export class RunScopedReactorClient implements ReactorClient {
  private readonly stopAt: number;
  private readonly maxPageLimit: number;

  constructor(
    private readonly inner: IReactorClient,
    private readonly scope: RunScope,
    private readonly host: RunScopedHostDeps,
    private readonly options: RunScopedReactorClientOptions = {},
  ) {
    this.stopAt = scope.deadline - deadlineMargin(scope.deadline - Date.now());
    this.maxPageLimit = options.maxPageLimit ?? DEFAULT_MAX_PAGE_LIMIT;
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
  ): Promise<TDocument> {
    const document = await this.inner.get<TDocument>(
      identifier,
      this.readView(view),
      this.signal(signal),
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

  // --- Writes ------------------------------------------------------------

  async create<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.assertWritable("create");
    const abort = this.signal(signal);
    const parentId =
      parentIdentifier === undefined
        ? undefined
        : await this.resolveReference(parentIdentifier, "main", abort);
    return this.createDocument<TDocument>(document, parentId, abort);
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
    const parentId =
      options?.parentIdentifier === undefined
        ? undefined
        : await this.resolveReference(options.parentIdentifier, "main", abort);
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
    this.assertWritable("createEmpty");
    const abort = this.signal(signal);
    const document = await this.newDocument(documentModelType, options, abort);
    const parentId =
      options?.parentIdentifier === undefined
        ? undefined
        : await this.resolveReference(options.parentIdentifier, "main", abort);
    return this.createDocument<TDocument>(document, parentId, abort);
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
    const { id } = await this.apply(
      "execute",
      documentIdentifier,
      branch,
      actions,
      abort,
    );
    return this.readBack<TDocument>(id, branch, abort);
  }

  // As `execute`, and answered at the same point (every action applied, or a
  // throw), but with the settled job and no read of the document: a drive's
  // read-back is its whole state, every node, for a caller that drops it.
  async executeAsync(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<JobInfo> {
    const abort = this.signal(signal);
    const { job } = await this.apply(
      "executeAsync",
      documentIdentifier,
      branch,
      actions,
      abort,
    );
    return job;
  }

  // The write `execute` and `executeAsync` share: the checks, the gate, the
  // job, settled. Answers the resolved document id and the settled job.
  private async apply(
    method: string,
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    abort: AbortSignal,
  ): Promise<{ id: string; job: JobInfo }> {
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
    const job = await this.run(id, branch, actions, abort);
    return { id, job };
  }

  // The run user's DELETE_DOCUMENT passes the gate; the client's parent edge
  // removals ride on the Switchboard's grant.
  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertWritable("deleteDocument");
    if (propagate === PropagationMode.Cascade) {
      throw accessDenied("Cascade delete is not offered to pieces");
    }
    const abort = this.signal(signal);
    const id = await this.resolveReference(identifier, "main", abort);
    await this.gate(id, "main", [deleteDocumentAction(id)], abort);
    this.assertTimeLeft("a delete");
    await this.scope.journal.recordDocuments([id]);
    try {
      await this.inner.deleteDocument(id, undefined, abort);
    } catch (error) {
      // The client rethrows a failed job's message alone.
      const message = messageOf(error);
      if (message.startsWith("Authorization denied")) {
        throw accessDenied(
          `The Switchboard has no grant for this operation: ${message}`,
        );
      }
      throw error;
    }
  }

  // --- Drives ------------------------------------------------------------

  // The inner client's drive writes sign as the host and submit their own
  // batches, so each is checked here first: the drive is read as the run user,
  // the drive-side action is gated for the run user, both documents are
  // journaled, and a new file gets the run user's grant, as `create` does.
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
    this.assertWritable("drives.addFile");
    const abort = this.signal(signal);
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
    await this.inner.drives.addFile(drive.id, prepared, parentFolder, abort);
    try {
      await this.grantRunUser(documentId, abort);
      return await this.readBack<TDocument>(
        documentId,
        prepared.header.branch || "main",
        abort,
      );
    } catch (error) {
      if (error instanceof Error) {
        error.message = `Document ${documentId} was created, but: ${error.message}`;
      }
      throw error;
    }
  }

  private async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    this.assertWritable("drives.addFolder");
    const abort = this.signal(signal);
    const drive = await this.readDrive(driveIdentifier, abort);
    await this.gateCandidates(
      drive.id,
      "main",
      [folderCandidate(drive, name, parentFolder)],
      abort,
    );
    this.assertTimeLeft("a folder");
    await this.scope.journal.recordDocuments([drive.id]);
    return this.inner.drives.addFolder(drive.id, name, parentFolder, abort);
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
        ? [`${candidates[index].type} (${evaluation.reason})`]
        : [],
    );
    if (denied.length > 0) {
      throw accessDenied(
        `The run user may not apply ${denied.join(", ")} to document ${documentId}`,
      );
    }
  }

  // --- Write path ----------------------------------------------------------

  // Submits actions and journals the job; throws unless every action applied.
  // Answers the settled job.
  private async run(
    documentId: string,
    branch: string,
    actions: Action[],
    signal: AbortSignal,
  ): Promise<JobInfo> {
    this.assertTimeLeft(`${actions.length} action(s)`);
    const info = await this.inner.executeAsync(
      documentId,
      branch,
      actions,
      signal,
    );
    await this.scope.journal.recordJob(info.id, [documentId]);
    const settled = await this.settle(info.id, signal);
    if (settled.status === JobStatus.FAILED) throw jobFailed(settled);
    assertActionsApplied(settled, actions);
    return settled;
  }

  private assertTimeLeft(what: string): void {
    if (Date.now() >= this.stopAt) {
      throw new Error(
        `No time was left before the step deadline to submit ${what}; nothing was submitted`,
      );
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
        if (!wait.aborted) throw error;
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

  private async createDocument<TDocument extends PHDocument = PHDocument>(
    document: PHDocument,
    parentId: string | undefined,
    signal: AbortSignal,
  ): Promise<TDocument> {
    // New documents get the host's create signature policy.
    const prepared = withSignaturePolicy(
      document,
      await this.inner.getCreateSignaturePolicy(),
    );
    const documentId = prepared.header.id;
    this.assertTimeLeft(`a ${prepared.header.documentType} document`);
    const { jobs } = await this.inner.createAsync(prepared, parentId, signal);
    // The create first, so a failed create is the error reported.
    const ordered = Object.entries(jobs).sort(
      ([a], [b]) => Number(b === "create") - Number(a === "create"),
    );
    for (const [key, job] of ordered) {
      await this.scope.journal.recordJob(
        job.id,
        key === "create" || parentId === undefined
          ? [documentId]
          : [parentId, documentId],
      );
    }
    let landed = false;
    try {
      for (const [, job] of ordered) {
        const settled = await this.settle(job.id, signal);
        if (settled.status === JobStatus.FAILED) throw jobFailed(settled);
        assertActionsApplied(settled);
        landed = true;
      }
      await this.grantRunUser(documentId, signal);
      return await this.readBack<TDocument>(
        documentId,
        prepared.header.branch || "main",
        signal,
      );
    } catch (error) {
      // Once the create has landed, a later failure must still say it exists.
      if (landed && error instanceof Error) {
        error.message = `Document ${documentId} was created, but: ${error.message}`;
      }
      throw error;
    }
  }

  // A document the run creates starts with a grant for its user.
  private async grantRunUser(
    documentId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const runUser = this.scope.runUser;
    if (!runUser) return;
    const created = await this.inner.get(documentId, undefined, signal);
    if (created.state.auth.version !== 0) return;
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
    await this.run(
      documentId,
      "main",
      [initializeAuth({ version: 1, grants })],
      signal,
    );
  }

  // --- Helpers -------------------------------------------------------------

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
