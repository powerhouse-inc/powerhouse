import type { DriveInput } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { actions } from "@powerhousedao/shared/document-model";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  BatchLoadRequest,
  BatchLoadResult,
  UndoRedoTargets,
} from "../core/types.js";
import { BatchJobFailedError } from "../shared/errors.js";
import type {
  ConsistencyToken,
  PropagationMode,
  ViewFilter,
} from "../shared/types.js";
import {
  JobBatchHandle,
  NodeHandle,
  WriteHandleFactory,
  type HandleReader,
  type JobSetHandle,
} from "./internal/handles.js";
import type {
  ActionCandidate,
  ActionEvaluations,
  BatchWriteHandle,
  CopyNodeOptions,
  IDriveClient,
  IDriveWriteClient,
  IReactorClient,
  NodeWriteHandle,
  IReactorWriteClient,
  MoveRelationshipHandles,
  NewDocumentOptions,
  UndoRedoAvailability,
  UpgradeDocumentOptions,
  WriteHandle,
  WriteTargetDescription,
} from "./types.js";

/**
 * The facade surface a {@link FacadeWriteClient} writes through: every
 * `IReactorClient` member but the halves themselves.
 */
export type ReactorClientSurface = Omit<IReactorClient, "read" | "write">;

/**
 * Drive writes over a facade drive client. Its methods wait for their jobs and
 * hand back no job ids, so every handle here is already settled.
 */
class FacadeDriveWriteClient implements IDriveWriteClient {
  constructor(
    private readonly drives: IDriveClient,
    private readonly settled: (documentId: string) => WriteHandle,
  ) {}

  async create(input: DriveInput, signal?: AbortSignal): Promise<WriteHandle> {
    const drive = await this.drives.create(input, signal);
    return this.settled(drive.header.id);
  }

  async addFile(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const added = await this.drives.addFile(
      driveIdentifier,
      document,
      parentFolder,
      signal,
    );
    return this.settled(added.header.id);
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    const folder = await this.drives.addFolder(
      driveIdentifier,
      name,
      parentFolder,
      signal,
    );
    return new NodeHandle(this.settled(driveIdentifier), folder.id);
  }

  async removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    await this.drives.removeNode(driveIdentifier, nodeId, signal);
    return this.settled(driveIdentifier);
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    const node = await this.drives.renameNode(
      driveIdentifier,
      nodeId,
      name,
      signal,
    );
    return new NodeHandle(this.settled(driveIdentifier), node.id);
  }

  async setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const document = await this.drives.setPreferredEditorOnNode(
      nodeId,
      preferredEditor,
      signal,
    );
    return this.settled(document.header.id);
  }

  async moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const drive = await this.drives.moveNode(
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
      signal,
    );
    return this.settled(drive.header.id);
  }

  async copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
    options?: CopyNodeOptions,
  ): Promise<WriteHandle> {
    const drive = await this.drives.copyNode(
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
      signal,
      options,
    );
    return this.settled(drive.header.id);
  }
}

/**
 * A write half over a client that only has the facade surface, for
 * implementations not yet split (the routing client until it has its own
 * halves, test doubles).
 *
 * `execute`, `rename`, `setPreferredEditor`, `create` and `createEmpty` submit
 * through the facade's `*Async` methods, so they resolve at acceptance and
 * their handles wait through `waitForJob`. The facade has no non-waiting form
 * for the other writes; they run the facade's waiting method and hand back a
 * handle that is already settled (`jobId` empty, stages resolved), which is
 * true to what happened if not to when.
 */
export class FacadeWriteClient implements IReactorWriteClient {
  readonly drives: IDriveWriteClient;

  private readonly handles: WriteHandleFactory;

  constructor(private readonly client: ReactorClientSurface) {
    this.handles = new WriteHandleFactory({
      // The facade can only wait for READ_READY, which implies WRITE_READY.
      waitForStage: (jobId, _stage, signal) => client.waitForJob(jobId, signal),
    });
    this.drives = new FacadeDriveWriteClient(client.drives, (documentId) =>
      this.settledHandle(documentId, "main"),
    );
  }

  isDocumentIdTaken(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.client.isDocumentIdTaken(documentId, signal);
  }

  async describe(
    identifier: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteTargetDescription> {
    const document = await this.client.get(identifier, { branch }, signal);
    return {
      documentId: document.header.id,
      documentType: document.header.documentType,
      slug: document.header.slug,
      branch: document.header.branch || branch,
      revision: { ...document.header.revision },
    };
  }

  evaluateActions(
    documentIdentifier: string,
    branch: string,
    candidates: ActionCandidate[],
    subject?: AuthSubject,
    signal?: AbortSignal,
  ): Promise<ActionEvaluations> {
    return this.client.evaluateActions(
      documentIdentifier,
      branch,
      candidates,
      subject,
      signal,
    );
  }

  async create(
    document: PHDocument,
    parentIdentifier?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const batch = await this.client.createAsync(
      document,
      parentIdentifier,
      signal,
    );
    return this.createHandle(
      batch,
      document.header.id,
      document.header.branch || "main",
      signal,
    );
  }

  async createEmpty(
    documentModelType: string,
    options?: NewDocumentOptions,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const batch = await this.client.createEmptyAsync(
      documentModelType,
      options,
      signal,
    );
    const createJob = batch.jobs.create ?? Object.values(batch.jobs)[0];
    return this.createHandle(batch, createJob.documentId, "main", signal);
  }

  async upgradeDocument(
    documentIdentifier: string,
    toVersion?: number,
    options?: UpgradeDocumentOptions,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const upgraded = await this.client.upgradeDocument(
      documentIdentifier,
      toVersion,
      options,
      signal,
    );
    return this.settledHandle(
      upgraded.header.id,
      upgraded.header.branch || "main",
    );
  }

  async execute(
    documentIdentifier: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const job = await this.client.executeAsync(
      documentIdentifier,
      branch,
      actions,
      signal,
    );
    const documentId = job.documentId || documentIdentifier;
    return this.handles.forJob(
      job,
      documentId,
      branch,
      signal,
      this.readerById(documentId),
    );
  }

  async executeBatch(
    request: BatchExecutionRequest,
    signal?: AbortSignal,
  ): Promise<BatchWriteHandle> {
    const planOrder = request.jobs.map((plan) => plan.key);
    const plans = new Map(request.jobs.map((plan) => [plan.key, plan]));
    let result: BatchExecutionResult;
    try {
      result = await this.client.executeBatch(request, signal);
    } catch (error) {
      if (!BatchJobFailedError.isError(error)) {
        throw error;
      }
      const handles: Record<string, JobSetHandle> = {};
      for (const [key, job] of Object.entries(error.jobs)) {
        const documentId = job.documentId || plans.get(key)?.documentId || "";
        handles[key] = this.handles.forSettledJob(
          job,
          documentId,
          plans.get(key)?.branch ?? "main",
          this.readerById(documentId),
        );
      }
      return new JobBatchHandle(error.jobs, handles, planOrder);
    }
    const handles: Record<string, JobSetHandle> = {};
    for (const [key, job] of Object.entries(result.jobs)) {
      const documentId = job.documentId || plans.get(key)?.documentId || "";
      handles[key] = this.handles.forJob(
        job,
        documentId,
        plans.get(key)?.branch ?? "main",
        signal,
        this.readerById(documentId),
      );
    }
    return new JobBatchHandle(result.jobs, handles, planOrder);
  }

  async undo(
    documentIdentifier: string,
    scope?: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const document = await this.client.undo(
      documentIdentifier,
      scope,
      branch,
      signal,
    );
    return this.settledHandle(document.header.id, branch);
  }

  async redo(
    documentIdentifier: string,
    scope?: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const document = await this.client.redo(
      documentIdentifier,
      scope,
      branch,
      signal,
    );
    return this.settledHandle(document.header.id, branch);
  }

  undoRedoTargets(
    documentIdentifier: string,
    scope?: string,
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<UndoRedoTargets> {
    return this.client.undoRedoTargets(documentIdentifier, scope, view, signal);
  }

  undoRedoAvailability(
    documentIdentifier: string,
    scope?: string,
    branch?: string,
    signal?: AbortSignal,
  ): Promise<UndoRedoAvailability> {
    return this.client.undoRedoAvailability(
      documentIdentifier,
      scope,
      branch,
      signal,
    );
  }

  rename(
    documentIdentifier: string,
    name: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    return this.execute(
      documentIdentifier,
      branch,
      [actions.setName(name)],
      signal,
    );
  }

  setPreferredEditor(
    documentIdentifier: string,
    preferredEditor: string | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    return this.execute(
      documentIdentifier,
      branch,
      [actions.setPreferredEditor(preferredEditor)],
      signal,
    );
  }

  async addRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const source = await this.client.addRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
      signal,
    );
    return this.settledHandle(source.header.id, branch);
  }

  async updateRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    metadata: Record<string, unknown> | null,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const source = await this.client.updateRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      metadata,
      branch,
      signal,
    );
    return this.settledHandle(source.header.id, branch);
  }

  async removeRelationship(
    sourceIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const source = await this.client.removeRelationship(
      sourceIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
    return this.settledHandle(source.header.id, branch);
  }

  async moveRelationship(
    sourceParentIdentifier: string,
    targetParentIdentifier: string,
    targetIdentifier: string,
    relationshipType: string,
    branch: string = "main",
    signal?: AbortSignal,
  ): Promise<MoveRelationshipHandles> {
    const moved = await this.client.moveRelationship(
      sourceParentIdentifier,
      targetParentIdentifier,
      targetIdentifier,
      relationshipType,
      branch,
      signal,
    );
    return {
      removed: this.settledHandle(moved.source.header.id, branch),
      added: this.settledHandle(moved.target.header.id, branch),
    };
  }

  async deleteDocument(
    identifier: string,
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    await this.client.deleteDocument(identifier, propagate, signal);
    return this.settledHandle(identifier, "main");
  }

  async deleteDocuments(
    identifiers: string[],
    propagate?: PropagationMode,
    signal?: AbortSignal,
  ): Promise<WriteHandle[]> {
    await this.client.deleteDocuments(identifiers, propagate, signal);
    return identifiers.map((identifier) =>
      this.settledHandle(identifier, "main"),
    );
  }

  loadBatch(
    request: BatchLoadRequest,
    signal?: AbortSignal,
  ): Promise<BatchLoadResult> {
    return this.client.loadBatch(request, signal);
  }

  private createHandle(
    batch: BatchExecutionResult,
    documentId: string,
    branch: string,
    signal: AbortSignal | undefined,
  ): WriteHandle {
    const jobs = Object.values(batch.jobs);
    const createJob = batch.jobs.create ?? jobs[0];
    return this.handles.forJobs(
      createJob.id,
      jobs,
      documentId,
      branch,
      signal,
      this.readerById(documentId),
    );
  }

  private settledHandle(documentId: string, branch: string): WriteHandle {
    return this.handles.settled(
      documentId,
      branch,
      this.readerById(documentId),
    );
  }

  private readerById(documentId: string): HandleReader {
    return <T extends PHDocument>(
      receipt: { branch: string; token: ConsistencyToken },
      view: ViewFilter | undefined,
      signal: AbortSignal | undefined,
    ): Promise<T> =>
      this.client.get<T>(
        documentId,
        { ...view, branch: receipt.branch },
        signal,
        receipt.token,
      );
  }
}
