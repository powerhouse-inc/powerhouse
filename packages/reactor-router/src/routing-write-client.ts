import {
  buildCreateJobs,
  createEmptyDocument,
  JobStatus,
  selectDocumentModelModule,
  upgradeDocumentJob,
  type ActionCandidate,
  type ActionEvaluations,
  type BatchExecutionRequest,
  type BatchExecutionResult,
  type BatchLoadRequest,
  type BatchLoadResult,
  type BatchWriteHandle,
  type CreateDocumentOptions,
  type IReactorWriteClient,
  type JobInfo,
  type MoveRelationshipHandles,
  type PropagationMode,
  type UpgradeDocumentOptions,
  type WriteHandle,
  type WriteTargetDescription,
} from "@powerhousedao/reactor";
import {
  actions as documentActions,
  type Action,
  type AuthSubject,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import type { RouterBackend } from "./backend.js";
import {
  ATTEMPT,
  type BeforeSubmit,
  type RouteDispatcher,
} from "./dispatcher.js";
import {
  CrossBackendBatchError,
  CrossBackendRelationshipError,
} from "./errors.js";
import { fanInExistence } from "./fan-in.js";
import { declared, type RoutingContext } from "./routing-context.js";
import {
  resolveOn,
  RoutingDriveWriteClient,
  type BackendDrives,
} from "./routing-drive-client.js";
import { jobIdsOfHandle, RoutingHandles } from "./routing-handles.js";
import type { RoutingReadClient } from "./routing-read-client.js";
import { DEFAULT_BRANCH } from "./types.js";

function sharedScope(actions: readonly Action[]): string {
  const scope = actions[0]?.scope ?? "";
  if (actions.some((action) => action.scope !== scope)) {
    throw new Error("All actions of one job must share a scope");
  }
  return scope;
}

/** The jobs a batch error carries, when it carries them. */
function failedBatchJobs(
  error: unknown,
): Readonly<Record<string, JobInfo>> | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const candidate = error as {
    name?: unknown;
    jobs?: Record<string, JobInfo>;
  };
  if (candidate.name !== "BatchJobFailedError") {
    return undefined;
  }
  return candidate.jobs;
}

/** executeBatch, for a backend without submit; failed jobs are answered, not thrown. */
async function submitAndWait(
  backend: RouterBackend,
  request: BatchExecutionRequest,
  signal: AbortSignal | undefined,
): Promise<BatchExecutionResult> {
  let result: BatchExecutionResult;
  try {
    result = await backend.api.executeBatch(request, signal);
  } catch (error) {
    const jobs = failedBatchJobs(error);
    if (jobs === undefined) {
      throw error;
    }
    return { jobs: { ...jobs } };
  }
  const settled = await Promise.all(
    Object.entries(result.jobs).map(
      async ([key, job]) =>
        [key, await backend.api.waitForJob(job, signal)] as const,
    ),
  );
  return { jobs: Object.fromEntries(settled) };
}

const CREATE_DOCUMENT = "CREATE_DOCUMENT";

/** Ids a job of the batch creates; they follow the batch's backend. */
function createdByExecution(request: BatchExecutionRequest): Set<string> {
  return new Set(
    request.jobs
      .filter((job) =>
        job.actions.some((action) => action.type === CREATE_DOCUMENT),
      )
      .map((job) => job.documentId),
  );
}

function createdByLoad(request: BatchLoadRequest): Set<string> {
  return new Set(
    request.jobs
      .filter((job) => job.operations[0]?.action.type === CREATE_DOCUMENT)
      .map((job) => job.documentId),
  );
}

/** The create job of a create batch first, then the rest. */
function createJobsFirst(result: BatchExecutionResult): JobInfo[] {
  const jobs = Object.values(result.jobs);
  const create = result.jobs.create ?? jobs[0];
  return [create, ...jobs.filter((job) => job !== create)];
}

/**
 * The write half of the router: each write runs on the backend that holds its
 * document (or collection), and a write spanning backends is refused before
 * anything is sent.
 *
 * Every write resolves once its job is accepted and returns a handle:
 * - a backend with a write half hands back its own handle;
 * - a backend with `submit` returns the accepted job, and the handle waits for
 *   it through the router's read half (`waitForJob` for `readable`, polled
 *   `getJobStatus` for `written`), as an RPC client's handle does;
 * - a backend with only waiting facade members has completed the write by the
 *   time it answers; the handle is settled (`jobId` empty) and its document is
 *   the one the write returned.
 *
 * The router records the backend of every job it hands back a handle for, so
 * the job reads that settle the handle go to that backend.
 */
export class RoutingWriteClient implements IReactorWriteClient {
  readonly drives: RoutingDriveWriteClient;
  private readonly dispatcher: RouteDispatcher;
  private readonly handles: RoutingHandles;

  constructor(
    private readonly context: RoutingContext,
    private readonly read: RoutingReadClient,
    drives: BackendDrives,
  ) {
    this.dispatcher = context.dispatcher;
    this.handles = new RoutingHandles(read);
    this.drives = new RoutingDriveWriteClient(this.dispatcher, drives);
  }

  /**
   * True when any backend serves or has taken the id; false only when every
   * backend answered. A backend without isDocumentIdTaken answers by isServed.
   */
  isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return fanInExistence(
      "isDocumentIdTaken",
      this.dispatcher.backends,
      async (backend) => {
        if (await backend.api.isServed(documentId, undefined, signal)) {
          return true;
        }
        const api = backend.api;
        return api.isDocumentIdTaken === undefined
          ? false
          : api.isDocumentIdTaken(documentId, signal);
      },
      this.dispatcher.onDiagnostic,
    );
  }

  /** The holder's own description; without a write half, read from the holder. */
  describe(
    identifier: string,
    branch: string = DEFAULT_BRANCH,
    signal?: AbortSignal,
  ): Promise<WriteTargetDescription> {
    return this.dispatcher.onDocument(
      "describe",
      identifier,
      async (backend) => {
        const write = backend.api.write;
        if (write !== undefined) {
          return write.describe(identifier, branch, signal);
        }
        const document = await backend.api.get(identifier, { branch }, signal);
        return {
          documentId: document.header.id,
          documentType: document.header.documentType,
          slug: document.header.slug,
          branch: document.header.branch || branch,
          revision: { ...document.header.revision },
        };
      },
      ATTEMPT.read,
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

  /** On the parent's backend; parentless, placed as the collection of its id. */
  async create(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const branch = document.header.branch || DEFAULT_BRANCH;
    const { value: handle, backend } = await this.onNewDocument(
      "create",
      document.header.id,
      parentIdentifier,
      async (target) => {
        const write = target.api.write;
        if (write !== undefined) {
          return write.create(document, parentIdentifier, signal);
        }
        const submit = target.api.submit;
        if (submit !== undefined) {
          const result = await submit.create(
            document,
            parentIdentifier,
            signal,
          );
          return this.handles.forJobs(
            createJobsFirst(result),
            document.header.id,
            branch,
            signal,
          );
        }
        const created = await target.api.create(
          document,
          parentIdentifier,
          signal,
        );
        return this.handles.completed(created.header.id, branch, created);
      },
    );
    this.dispatcher.recordDocument(handle.documentId, backend.name);
    this.recordJobs(handle, backend.name);
    return handle;
  }

  async createEmpty(
    documentModelType: string,
    options?: CreateDocumentOptions,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const document = await this.emptyDocument(
      documentModelType,
      options,
      signal,
    );
    return this.create(document, options?.parentIdentifier, signal);
  }

  // Mutations

  /**
   * On a holder with a write half, that half upgrades (and retries) locally.
   * Otherwise the router reads, submits and retries itself; the upgrade has
   * settled by the time this resolves either way.
   */
  async upgradeDocument(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const holder =
      await this.dispatcher.resolveDocumentBackend(documentIdentifier);
    if (holder.api.write === undefined) {
      return this.upgradeThroughRouter(
        documentIdentifier,
        toVersion,
        options,
        signal,
      );
    }
    return this.onDocumentWrite(
      "upgradeDocument",
      documentIdentifier,
      (write) =>
        write.upgradeDocument(documentIdentifier, toVersion, options, signal),
      () =>
        this.upgradeThroughRouter(
          documentIdentifier,
          toVersion,
          options,
          signal,
        ),
    );
  }

  execute(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    return this.onDocumentWrite(
      "execute",
      documentIdentifier,
      (write) => write.execute(documentIdentifier, branch, actions, signal),
      async (backend) => {
        const submit = backend.api.submit;
        if (submit !== undefined) {
          const job = await submit.execute(
            documentIdentifier,
            branch,
            actions,
            signal,
          );
          return this.handles.forJobs(
            [job],
            job.documentId || documentIdentifier,
            branch,
            signal,
          );
        }
        const document = await backend.api.execute(
          documentIdentifier,
          branch,
          actions,
          signal,
        );
        return this.handles.completed(document.header.id, branch, document);
      },
    );
  }

  /** Every job's document must resolve to one backend; nothing is sent otherwise. */
  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchWriteHandle> {
    const identifiers = request.jobs.map((job) => job.documentId);
    const { value: batch, backend } = await this.dispatcher.onDocuments(
      "executeBatch",
      identifiers,
      (target) => {
        const write = target.api.write;
        return write === undefined
          ? this.batchOn(target, request, signal)
          : write.executeBatch(request, signal);
      },
      createdByExecution(request),
    );
    this.recordBatchJobs(batch.jobs, backend.name);
    for (const handle of Object.values(batch.handles)) {
      this.recordJobs(handle, backend.name);
    }
    return batch;
  }

  async loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    const identifiers = request.jobs.map((job) => job.documentId);
    const { value: result, backend } = await this.dispatcher.onDocuments(
      "loadBatch",
      identifiers,
      (target) => {
        const write = target.api.write;
        return write === undefined
          ? declared(target, "loadBatch")(request, signal)
          : write.loadBatch(request, signal);
      },
      createdByLoad(request),
    );
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  rename(
    documentIdentifier: string,
    name: string,
    branch: string = DEFAULT_BRANCH,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
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
  ): Promise<WriteHandle> {
    return this.onDocumentWrite(
      "setPreferredEditor",
      documentIdentifier,
      (write) =>
        write.setPreferredEditor(
          documentIdentifier,
          preferredEditor,
          branch,
          signal,
        ),
      async (backend) => {
        const document = await backend.api.setPreferredEditor(
          documentIdentifier,
          preferredEditor,
          branch,
          signal,
        );
        return this.handles.completed(
          document.header.id,
          branch ?? DEFAULT_BRANCH,
          document,
        );
      },
    );
  }

  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    await this.assertSameBackend(
      "addRelationship",
      sourceIdentifier,
      targetIdentifier,
    );
    return this.onDocumentWrite(
      "addRelationship",
      sourceIdentifier,
      (write) =>
        write.addRelationship(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          metadata,
          branch,
          signal,
        ),
      async (backend) =>
        this.completedOn(
          await declared(backend, "addRelationship")(
            sourceIdentifier,
            targetIdentifier,
            relationshipType,
            metadata,
            branch,
            signal,
          ),
          branch,
        ),
    );
  }

  async updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    await this.assertSameBackend(
      "updateRelationship",
      sourceIdentifier,
      targetIdentifier,
    );
    return this.onDocumentWrite(
      "updateRelationship",
      sourceIdentifier,
      (write) =>
        write.updateRelationship(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          metadata,
          branch,
          signal,
        ),
      async (backend) =>
        this.completedOn(
          await declared(backend, "updateRelationship")(
            sourceIdentifier,
            targetIdentifier,
            relationshipType,
            metadata,
            branch,
            signal,
          ),
          branch,
        ),
    );
  }

  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    await this.assertSameBackend(
      "removeRelationship",
      sourceIdentifier,
      targetIdentifier,
    );
    return this.onDocumentWrite(
      "removeRelationship",
      sourceIdentifier,
      (write) =>
        write.removeRelationship(
          sourceIdentifier,
          targetIdentifier,
          relationshipType,
          branch,
          signal,
        ),
      async (backend) =>
        this.completedOn(
          await declared(backend, "removeRelationship")(
            sourceIdentifier,
            targetIdentifier,
            relationshipType,
            branch,
            signal,
          ),
          branch,
        ),
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
  ): Promise<MoveRelationshipHandles> {
    await this.assertSameBackend(
      "moveRelationship",
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
    );
    let owner = "";
    const moved = await this.dispatcher.onDocument(
      "moveRelationship",
      sourceParentIdentifier,
      async (backend): Promise<MoveRelationshipHandles> => {
        owner = backend.name;
        const write = backend.api.write;
        if (write !== undefined) {
          return write.moveRelationship(
            sourceParentIdentifier,
            targetParentIdentifier,
            targetIdentifier,
            relationshipType,
            branch,
            signal,
          );
        }
        const documents = await declared(backend, "moveRelationship")(
          sourceParentIdentifier,
          targetParentIdentifier,
          targetIdentifier,
          relationshipType,
          branch,
          signal,
        );
        return {
          removed: this.completedOn(documents.source, branch),
          added: this.completedOn(documents.target, branch),
        };
      },
      ATTEMPT.write,
    );
    this.recordJobs(moved.removed, owner);
    this.recordJobs(moved.added, owner);
    return moved;
  }

  deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    return this.deleteOne("deleteDocument", identifier, propagate, signal);
  }

  /**
   * Every identifier must resolve to one backend; nothing is deleted otherwise.
   * Each delete then routes as its own write, so a stale entry is corrected.
   */
  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<WriteHandle[]> {
    await this.dispatcher.verifyBatchBackend("deleteDocuments", identifiers);
    return Promise.all(
      identifiers.map((identifier) =>
        this.deleteOne("deleteDocuments", identifier, propagate, signal),
      ),
    );
  }

  // Submission without a handle, for the facade's `*Async` methods.

  /**
   * Submits what {@link create} submits and returns the jobs. On a backend
   * without `submit` it waits through executeBatch and returns each job's
   * terminal state (a failed job as its FAILED JobInfo).
   */
  async submitCreate(
    document: PHDocument,
    parentIdentifier: string | undefined,
    signal: AbortSignal | undefined,
  ): Promise<BatchExecutionResult> {
    const { value: result, backend } = await this.onNewDocument(
      "createAsync",
      document.header.id,
      parentIdentifier,
      async (target, beforeSubmit) => {
        const submit = target.api.submit;
        if (submit !== undefined) {
          return submit.create(document, parentIdentifier, signal);
        }
        const parentId =
          parentIdentifier === undefined || parentIdentifier === ""
            ? undefined
            : await beforeSubmit(() =>
                resolveOn(target, parentIdentifier, signal),
              );
        const jobs = await buildCreateJobs(
          document,
          parentId,
          this.context.signer,
          signal,
        );
        return submitAndWait(target, { jobs }, signal);
      },
    );
    this.dispatcher.recordDocument(document.header.id, backend.name);
    this.recordBatchJobs(result.jobs, backend.name);
    return result;
  }

  /** Submits one job on the document's backend and records where it went. */
  async submitJob(
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
        const submit = backend.api.submit;
        if (submit !== undefined) {
          return submit.execute(documentIdentifier, branch, actions, signal);
        }
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
        const result = await submitAndWait(backend, request, signal);
        return result.jobs[key];
      },
      ATTEMPT.write,
    );
    this.dispatcher.recordJob(job.id, owner);
    return job;
  }

  /** A new empty document of the type, with the router's creation defaults. */
  async emptyDocument(
    documentModelType: string,
    options: CreateDocumentOptions | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PHDocument> {
    const module = selectDocumentModelModule(
      await this.read.allModules(signal),
      documentModelType,
      options?.documentModelVersion,
    );
    const [policy, versions] = await Promise.all([
      this.read.getCreateSignaturePolicy(),
      this.read.getCreateProtocolVersions(options?.parentIdentifier, signal),
    ]);
    return createEmptyDocument(module, options, policy, versions);
  }

  // Internals

  /**
   * Runs a document write on its holder: through the holder's write half when
   * it has one, otherwise as `otherwise` builds the handle. Records the
   * handle's jobs against the holder.
   */
  private async onDocumentWrite(
    label: string,
    identifier: string,
    viaHalf: (write: IReactorWriteClient) => Promise<WriteHandle>,
    otherwise: (backend: RouterBackend) => Promise<WriteHandle>,
  ): Promise<WriteHandle> {
    let owner = "";
    const handle = await this.dispatcher.onDocument(
      label,
      identifier,
      (backend) => {
        owner = backend.name;
        const write = backend.api.write;
        return write === undefined ? otherwise(backend) : viaHalf(write);
      },
      ATTEMPT.write,
    );
    this.recordJobs(handle, owner);
    return handle;
  }

  private deleteOne(
    label: string,
    identifier: string,
    propagate: PropagationMode | undefined,
    signal: AbortSignal | undefined,
  ): Promise<WriteHandle> {
    return this.onDocumentWrite(
      label,
      identifier,
      (write) => write.deleteDocument(identifier, propagate, signal),
      async (backend) => {
        await backend.api.deleteDocument(identifier, propagate, signal);
        return this.handles.completed(identifier, DEFAULT_BRANCH);
      },
    );
  }

  /** executeBatch on a backend without a write half; failed jobs are carried. */
  private async batchOn(
    backend: RouterBackend,
    request: BatchExecutionRequest,
    signal: AbortSignal | undefined,
  ): Promise<BatchWriteHandle> {
    const planOrder = request.jobs.map((plan) => plan.key);
    const targets = new Map(
      request.jobs.map((plan) => [
        plan.key,
        { documentId: plan.documentId, branch: plan.branch },
      ]),
    );
    let jobs: Record<string, JobInfo>;
    try {
      jobs = (await backend.api.executeBatch(request, signal)).jobs;
    } catch (error) {
      const failed = failedBatchJobs(error);
      if (failed === undefined) {
        throw error;
      }
      jobs = { ...failed };
    }
    this.recordBatchJobs(jobs, backend.name);
    return this.handles.forBatch(jobs, targets, planOrder, signal);
  }

  private async upgradeThroughRouter(
    documentIdentifier: string,
    toVersion: number | undefined,
    options: UpgradeDocumentOptions | undefined,
    signal: AbortSignal | undefined,
  ): Promise<WriteHandle> {
    const outcome = await upgradeDocumentJob(
      {
        signer: this.context.signer,
        read: <T extends PHDocument>(
          identifier: string,
          branch: string | undefined,
          _token: unknown,
          readSignal?: AbortSignal,
        ) =>
          this.read.get<T>(
            identifier,
            branch === undefined ? undefined : { branch },
            readSignal,
          ),
        getDocumentModelModule: (documentType) =>
          this.read.getDocumentModelModule(documentType),
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
            : this.read.waitForJob(job, waitSignal),
      },
      documentIdentifier,
      toVersion,
      options,
      signal,
    );
    if (outcome.kind === "unchanged") {
      return this.handles.completed(
        outcome.documentId,
        outcome.branch,
        outcome.document,
      );
    }
    return this.handles.settledJob(
      outcome.job,
      outcome.documentId,
      outcome.branch,
    );
  }

  private completedOn(
    document: PHDocument,
    branch: string | undefined,
  ): WriteHandle {
    return this.handles.completed(
      document.header.id,
      branch ?? DEFAULT_BRANCH,
      document,
    );
  }

  /** Resolved as a batch creating the id, beside its parent when given. */
  private onNewDocument<T>(
    label: string,
    documentId: string,
    parentIdentifier: string | undefined,
    run: (backend: RouterBackend, beforeSubmit: BeforeSubmit) => Promise<T>,
  ): Promise<{ readonly value: T; readonly backend: RouterBackend }> {
    const identifiers =
      parentIdentifier === undefined || parentIdentifier === ""
        ? [documentId]
        : [documentId, parentIdentifier];
    return this.dispatcher.onDocuments(
      label,
      identifiers,
      run,
      new Set([documentId]),
    );
  }

  private recordJobs(handle: WriteHandle, backend: string): void {
    for (const jobId of jobIdsOfHandle(handle)) {
      this.dispatcher.recordJob(jobId, backend);
    }
  }

  private recordBatchJobs(
    jobs: Record<string, JobInfo>,
    backend: string,
  ): void {
    for (const job of Object.values(jobs)) {
      this.dispatcher.recordJob(job.id, backend);
    }
  }

  private async assertSameBackend(
    operation: string,
    source: string,
    ...targets: string[]
  ): Promise<void> {
    try {
      await this.dispatcher.verifyBatchBackend(operation, [source, ...targets]);
    } catch (error) {
      if (!(error instanceof CrossBackendBatchError)) {
        throw error;
      }
      const backendOf = new Map(
        error.placement.map((entry) => [entry.documentId, entry.backend]),
      );
      const sourceBackend = backendOf.get(source) ?? "";
      const target =
        targets.find((id) => backendOf.get(id) !== sourceBackend) ?? targets[0];
      throw new CrossBackendRelationshipError(
        operation,
        source,
        sourceBackend,
        target,
        backendOf.get(target) ?? "",
      );
    }
  }
}
