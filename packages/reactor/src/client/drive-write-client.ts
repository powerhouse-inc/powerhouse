import {
  addFolder as addFolderAction,
  copyNode as copyNodeAction,
  deleteNode as deleteNodeAction,
  driveCreateDocument,
  generateNodesCopy,
  getDescendants,
  handleTargetNameCollisions,
  isFileNode,
  isFolderNode,
  moveNode as moveNodeAction,
  updateNode as updateNodeAction,
  type DocumentDriveDocument,
  type DriveInput,
} from "@powerhousedao/shared/document-drive";
import { addFile as addFileAction } from "@powerhousedao/shared/document-drive";
import {
  actions,
  createCopyHeader,
  generateId,
  normalizeDocumentModelVersion,
  requestedSignaturePolicy,
  withSignaturePolicy,
  type Action,
  type CreateDocumentActionInput,
  type ISigner,
  type PHDocument,
  type PHDocumentHeader,
  type ProtocolVersions,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  addRelationshipAction,
  createDocumentAction,
  deleteDocumentAction,
  removeRelationshipAction,
  upgradeDocumentAction,
} from "../actions/index.js";
import type {
  BatchExecutionRequest,
  BatchExecutionResult,
  ExecutionJobPlan,
  IReactor,
} from "../core/types.js";
import { getSharedActionScope, signActions } from "../core/utils.js";
import type { ConsistencyToken, ViewFilter } from "../shared/types.js";
import {
  jobErrorOf,
  JobFailedError,
  NodeHandle,
  type HandleReader,
  type JobSetHandle,
  type WriteHandleFactory,
} from "./internal/handles.js";
import type {
  IDriveWriteClient,
  IReactorReadClient,
  IReactorWriteClient,
  NodeWriteHandle,
  WriteHandle,
  WriteReceipt,
} from "./types.js";

export type BatchSubmitter = (
  request: BatchExecutionRequest,
  signal?: AbortSignal,
) => Promise<BatchExecutionResult>;

/** The write half members a {@link DriveWriteClient} submits through. */
export type DriveWriteHalf = Pick<
  IReactorWriteClient,
  "execute" | "create" | "setPreferredEditor"
>;

/** The reads a drive write makes before it submits. */
export type DriveWriteReads = Pick<
  IReactorReadClient,
  "get" | "getCreateSignaturePolicy" | "getCreateProtocolVersions"
>;

/** A copy keeps its source's versions; selection fills only the keys it lacks. */
function withSelectedVersions(
  header: PHDocumentHeader,
  selected: ProtocolVersions,
): Pick<PHDocumentHeader, "documentType" | "protocolVersions"> {
  return {
    documentType: header.documentType,
    protocolVersions: header.protocolVersions
      ? { ...selected, ...header.protocolVersions }
      : undefined,
  };
}

/**
 * The error a drive step that had to complete throws: the job error's name and
 * message, which is what callers classify on (an id collision has to be told
 * apart from a transient failure).
 */
export function asJobError(error: unknown): unknown {
  return error instanceof JobFailedError ? jobErrorOf(error.job) : error;
}

/**
 * Drive writes: the multi-action, multi-document choreography that keeps a
 * drive's nodes consistent with the relationship index and the documents.
 *
 * A step a later step depends on is waited for here (a file's document exists
 * before the drive names it; a renamed document is checked before the node is
 * renamed); the last step is returned as a handle, not awaited.
 */
export class DriveWriteClient implements IDriveWriteClient {
  private readonly executeBatch: BatchSubmitter;

  /** `submitter` may still be an IReactor, whose executeBatch is used. */
  constructor(
    private readonly write: DriveWriteHalf,
    private readonly reads: DriveWriteReads,
    private readonly handles: WriteHandleFactory,
    private readonly logger: ILogger,
    submitter: BatchSubmitter | IReactor,
    private readonly signer: ISigner,
    private readonly resolveReference: (
      identifier: string,
      signal?: AbortSignal,
    ) => Promise<string>,
    private readonly lookupLiveDocument: (
      identifier: string,
      signal?: AbortSignal,
    ) => Promise<string | undefined> = () => Promise.resolve(undefined),
  ) {
    this.executeBatch =
      typeof submitter === "function"
        ? submitter
        : (request, signal) => submitter.executeBatch(request, signal);
  }

  async create(input: DriveInput, signal?: AbortSignal): Promise<WriteHandle> {
    this.logger.verbose("drives.create(@input)", input);
    const driveDoc = withSignaturePolicy(
      driveCreateDocument({
        global: {
          name: input.global.name || "",
          icon: input.global.icon ?? null,
          nodes: [],
        },
      }),
      requestedSignaturePolicy(
        input,
        await this.reads.getCreateSignaturePolicy(),
      ),
      {
        protocolVersions: {
          ...(await this.reads.getCreateProtocolVersions(undefined, signal)),
          ...input.protocolVersions,
        },
      },
    );
    if (input.preferredEditor) {
      driveDoc.header.meta = {
        ...driveDoc.header.meta,
        preferredEditor: input.preferredEditor,
      };
    }
    return this.write.create(driveDoc, undefined, signal);
  }

  async addFile(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "drives.addFile(@driveIdentifier, @document, @parentFolder)",
      driveIdentifier,
      document.header.id,
      parentFolder,
    );

    const documentId = document.header.id;
    const driveId = await this.resolveReference(driveIdentifier, signal);

    const createInput: CreateDocumentActionInput = {
      model: document.header.documentType,
      version: 0,
      documentId: document.header.id,
      signing: {
        signature: document.header.id,
        publicKey: document.header.sig.publicKey,
        nonce: document.header.sig.nonce,
        createdAtUtcIso: document.header.createdAtUtcIso,
        documentType: document.header.documentType,
      },
      slug: document.header.slug,
      name: document.header.name,
      branch: document.header.branch,
      meta: document.header.meta,
      protocolVersions: document.header.protocolVersions ?? {
        "base-reducer": 2,
      },
    };

    const documentActions: Action[] = await signActions(
      [
        createDocumentAction(createInput),
        upgradeDocumentAction({
          documentId: document.header.id,
          model: document.header.documentType,
          fromVersion: 0,
          // imported files may predate the document scope entirely
          toVersion: normalizeDocumentModelVersion(
            (document.state as Partial<typeof document.state>).document
              ?.version,
          ),
          initialState: document.state,
        }),
        addRelationshipAction(driveId, documentId, "child"),
      ],
      this.signer,
      { documentId, branch: "main" },
      signal,
    );

    const driveActions: Action[] = await signActions(
      [
        addFileAction({
          id: documentId,
          name: document.header.name || documentId,
          documentType: document.header.documentType,
          parentFolder,
        }),
      ],
      this.signer,
      { documentId: driveId, branch: "main" },
      signal,
    );

    // Two batches, not one with a dependsOn edge. A batch's edges are ordering
    // only: a failed job still releases its dependents (see IQueue.failJob), so
    // batching these would add the file node on top of a create that never
    // landed, pointing the drive at whoever already owns that id. Waiting for
    // the document to exist costs a round trip and makes that unrepresentable.
    const documentBatch = await this.submitJobs(
      [
        {
          key: "document",
          documentId,
          scope: getSharedActionScope(documentActions),
          branch: "main",
          actions: documentActions,
          dependsOn: [],
        },
      ],
      "document",
      documentId,
      signal,
    );
    await this.complete(documentBatch);

    const driveBatch = await this.executeBatch(
      {
        jobs: [
          {
            key: "drive",
            documentId: driveId,
            scope: getSharedActionScope(driveActions),
            branch: "main",
            actions: driveActions,
            dependsOn: [],
          },
        ],
      },
      signal,
    );

    // The file's handle: its document is the new file, and its stages span the
    // drive's ADD_FILE too, so `readable` means the drive names the file.
    const documentJobs = await documentBatch.settled("readable");
    return this.handles.forJobs(
      documentBatch.jobId,
      [...documentJobs, ...Object.values(driveBatch.jobs)],
      documentId,
      "main",
      signal,
      this.readerById(documentId),
    );
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    this.logger.verbose(
      "drives.addFolder(@driveIdentifier, @name, @parentFolder)",
      driveIdentifier,
      name,
      parentFolder,
    );
    const folderId = generateId();
    const handle = await this.write.execute(
      driveIdentifier,
      "main",
      [addFolderAction({ id: folderId, name, parentFolder })],
      signal,
    );
    return new NodeHandle(handle, folderId);
  }

  async removeNode(
    driveIdentifier: string,
    nodeIdentifier: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "drives.removeNode(@driveIdentifier, @nodeIdentifier)",
      driveIdentifier,
      nodeIdentifier,
    );
    const driveId = await this.resolveReference(driveIdentifier, signal);

    // A live document is a file node, or an orphan whose node never landed
    // (ADD_FILE rejected the name). Both are removed the same way, without
    // reading the drive: the drive reducer rejects DELETE_NODE of a node that
    // is not there, which is reported on the job and not thrown, and the
    // document and its relationship are deleted either way, as before.
    const fileId = await this.lookupLiveDocument(nodeIdentifier, signal);
    if (fileId !== undefined) {
      return this.removeFileNode(driveId, fileId, signal);
    }

    // Anything else is a folder or unknown. The drive is read through the read
    // half because a folder's removal needs its subtree: each file under it is
    // a document that has to be deleted, which the reducer does not do.
    const drive = await this.reads.get<DocumentDriveDocument>(
      driveId,
      undefined,
      signal,
    );
    // A folder is a node, not a document: a resolver that reads documents
    // cannot resolve its id. Only an identifier that is no node's id is
    // resolved, as a file's slug.
    const nodes = drive.state.global.nodes;
    const nodeId = nodes.some((n) => n.id === nodeIdentifier)
      ? nodeIdentifier
      : await this.resolveReference(nodeIdentifier, signal);
    const node = nodes.find((n) => n.id === nodeId);

    if (!node) {
      // No FileNode, but the document may still exist as an orphan (relationship
      // and document persisted, node never added — e.g. ADD_FILE rejected the
      // name). Clean it up if so; otherwise it is genuinely unknown.
      const exists = await this.documentExists(nodeId, signal);
      if (!exists) {
        throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
      }
      return this.removeFileNode(driveId, nodeId, signal);
    }

    if (isFolderNode(node)) {
      const fileDescendants = getDescendants(
        node,
        drive.state.global.nodes,
      ).filter(isFileNode);
      for (const file of fileDescendants) {
        await this.complete(
          await this.removeFileNode(driveId, file.id, signal),
        );
      }
      return this.write.execute(
        driveId,
        "main",
        [deleteNodeAction({ id: nodeId })],
        signal,
      );
    }

    return this.removeFileNode(driveId, nodeId, signal);
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    this.logger.verbose(
      "drives.renameNode(@driveIdentifier, @nodeId, @name)",
      driveIdentifier,
      nodeId,
      name,
    );
    const renameHandle = await this.write.execute(
      nodeId,
      "main",
      [actions.setName({ name })],
      signal,
    );
    let renamed: WriteReceipt;
    try {
      renamed = await renameHandle.readable;
    } catch (error) {
      throw asJobError(error);
    }
    if (!(await this.renameApplied(renameHandle, renamed, name, signal))) {
      throw new Error("Document rename did not apply");
    }
    const handle = await this.write.execute(
      driveIdentifier,
      "main",
      [updateNodeAction({ id: nodeId, name })],
      signal,
    );
    return new NodeHandle(handle, nodeId);
  }

  async setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "drives.setPreferredEditorOnNode(@nodeId, @preferredEditor)",
      nodeId,
      preferredEditor,
    );
    return this.write.setPreferredEditor(
      nodeId,
      preferredEditor,
      "main",
      signal,
    );
  }

  async moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "drives.moveNode(@driveIdentifier, @srcNodeId, @targetParentFolderId)",
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
    );
    return this.write.execute(
      driveIdentifier,
      "main",
      [
        moveNodeAction({
          srcFolder: srcNodeId,
          targetParentFolder: targetParentFolderId,
        }),
      ],
      signal,
    );
  }

  async copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    this.logger.verbose(
      "drives.copyNode(@driveIdentifier, @srcNodeId, @targetParentFolderId)",
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
    );
    // The one drive write that keeps reading through the read half: the copy
    // plan is built from the source subtree's nodes and names, and each copied
    // file is seeded from its source document's state. No token: it is a copy
    // of what the user sees.
    const drive = await this.reads.get<DocumentDriveDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    const srcNode = drive.state.global.nodes.find((n) => n.id === srcNodeId);
    if (!srcNode) {
      throw new Error(
        `Node ${srcNodeId} not found in drive ${driveIdentifier}`,
      );
    }

    const copyPlan = generateNodesCopy(
      {
        srcId: srcNodeId,
        targetParentFolder: targetParentFolderId,
        targetName: srcNode.name,
      },
      () => generateId(),
      drive.state.global.nodes,
    );

    const resolvedNamesByTargetId = new Map<string, string>();
    for (const entry of copyPlan) {
      const node = drive.state.global.nodes.find((n) => n.id === entry.srcId);
      if (!node) continue;
      const resolved = handleTargetNameCollisions({
        nodes: drive.state.global.nodes,
        srcName: entry.targetName || node.name,
        srcKind: isFileNode(node) ? "file" : "folder",
        targetParentFolder: entry.targetParentFolder ?? null,
      });
      resolvedNamesByTargetId.set(entry.targetId, resolved);
    }

    const policy = await this.reads.getCreateSignaturePolicy();
    const base = await this.reads.getCreateProtocolVersions(
      drive.header.id,
      signal,
    );
    for (const entry of copyPlan) {
      const node = drive.state.global.nodes.find((n) => n.id === entry.srcId);
      if (!node || !isFileNode(node)) continue;
      const srcDoc = await this.reads.get(entry.srcId, undefined, signal);

      // Read snapshots carry no operations, so the copy is seeded from the
      // source's current state rather than replayed. Replaying here would also
      // pick a reducer by document type alone and apply it to state that is
      // already current.
      const duplicated: PHDocument = {
        ...srcDoc,
        header: createCopyHeader(
          withSelectedVersions(srcDoc.header, base),
          entry.targetId,
          policy,
        ),
        initialState: srcDoc.state,
        operations: {},
      };

      const resolvedName = resolvedNamesByTargetId.get(entry.targetId);
      if (resolvedName) {
        duplicated.header.name = resolvedName;
      }
      // A v2-required copy takes a derived id, which the drive's node must name.
      entry.targetId = duplicated.header.id;
      await this.complete(
        await this.addFile(
          driveIdentifier,
          duplicated,
          entry.targetParentFolder ?? undefined,
          signal,
        ),
      );
    }

    return this.write.execute(
      driveIdentifier,
      "main",
      copyPlan.map((entry) => copyNodeAction(entry)),
      signal,
    );
  }

  /**
   * Waits for a step a later step depends on. A FAILED job is thrown as the
   * job's own error, by name, as the drive client has always thrown it.
   */
  private async complete(handle: WriteHandle): Promise<void> {
    try {
      await handle.readable;
    } catch (error) {
      throw asJobError(error);
    }
  }

  /**
   * Whether a SET_NAME landed, from the job's per-action outcome: a reducer
   * error or a denial does not fail the job, so the outcome is where a refused
   * rename shows. A handle whose job carries no outcome (one settled by a
   * facade-only client) is read back instead, as every rename once was.
   */
  private async renameApplied(
    handle: WriteHandle,
    receipt: WriteReceipt,
    name: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (receipt.job.result !== undefined) {
      return receipt.job.result.allApplied;
    }
    const renamed = await handle.document(undefined, signal);
    return renamed.header.name === name;
  }

  /** Submits one batch and returns a handle over all of its jobs. */
  private async submitJobs(
    jobs: ExecutionJobPlan[],
    primaryKey: string,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<JobSetHandle> {
    const batchResult = await this.executeBatch({ jobs }, signal);
    const accepted = Object.values(batchResult.jobs);
    const primary = batchResult.jobs[primaryKey] ?? accepted[0];
    return this.handles.forJobs(
      primary.id,
      accepted,
      documentId,
      "main",
      signal,
      this.readerById(documentId),
    );
  }

  private async documentExists(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      await this.reads.get(documentId, undefined, signal);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Removes a file node, then deletes the file and its relationship. The node
   * removal is waited for; the returned handle is the delete batch, whose
   * document is the drive.
   */
  private async removeFileNode(
    driveId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const driveActions: Action[] = await signActions(
      [deleteNodeAction({ id: fileId })],
      this.signer,
      { documentId: driveId, branch: "main" },
      signal,
    );
    // Alone, so a drive that refuses the removal leaves the file untouched.
    await this.complete(
      await this.submitJobs(
        [
          {
            key: "drive",
            documentId: driveId,
            scope: getSharedActionScope(driveActions),
            branch: "main",
            actions: driveActions,
            dependsOn: [],
          },
        ],
        "drive",
        driveId,
        signal,
      ),
    );

    const deleteActions: Action[] = await signActions(
      [deleteDocumentAction(fileId)],
      this.signer,
      { documentId: fileId, branch: "main" },
      signal,
    );
    const relationshipActions: Action[] = await signActions(
      [removeRelationshipAction(driveId, fileId, "child")],
      this.signer,
      { documentId: driveId, branch: "main" },
      signal,
    );
    // The drive's remotes are served the delete while the file is a member.
    return this.submitJobs(
      [
        {
          key: "delete",
          documentId: fileId,
          scope: getSharedActionScope(deleteActions),
          branch: "main",
          actions: deleteActions,
          dependsOn: [],
        },
        {
          key: "relationship",
          documentId: driveId,
          scope: getSharedActionScope(relationshipActions),
          branch: "main",
          actions: relationshipActions,
          dependsOn: ["delete"],
        },
      ],
      "relationship",
      driveId,
      signal,
    );
  }

  private readerById(documentId: string): HandleReader {
    return <T extends PHDocument>(
      receipt: { branch: string; token: ConsistencyToken },
      view: ViewFilter | undefined,
      signal: AbortSignal | undefined,
    ): Promise<T> =>
      this.reads.get<T>(
        documentId,
        { ...view, branch: receipt.branch },
        signal,
        receipt.token,
      );
  }
}
