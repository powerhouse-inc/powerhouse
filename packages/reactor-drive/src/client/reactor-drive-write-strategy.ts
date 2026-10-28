import {
  addRelationshipAction,
  mergeConsistencyTokens,
  removeRelationshipAction,
  type BatchExecutionRequest,
  type CopyNodeOptions,
  type DriveNodeRecord,
  type ExecutionJobPlan,
  type IDriveNodeSource,
  type IDriveWriteStrategy,
  type IReactorReadClient,
  type IReactorWriteClient,
  type NodeWriteHandle,
  type PropagationMode,
  type ViewFilter,
  type WriteHandle,
  type WriteReceipt,
} from "@powerhousedao/reactor";
import {
  assertAuthPreservedOnDuplicate,
  createCopyHeader,
  createVersionsOf,
  creationActions,
  generateId,
  replayDocumentVersioned,
  type Action,
  type PHBaseState,
  type PHDocument,
  type ProtocolVersions,
  type Reducer,
  type VersionedReplayConfig,
} from "@powerhousedao/shared/document-model";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../constants.js";
import {
  addFolderAction,
  removeFolderAction,
  updateFolderAction,
} from "../actions.js";
import type { DriveChildFileMetadata } from "../types.js";

/** What the reactor-drive write strategy is built from. */
export type ReactorDriveWriteStrategyArgs = {
  read: IReactorReadClient;
  write: IReactorWriteClient;
  nodes?: IDriveNodeSource;
};

/** A folder node as the strategy orders a subtree for removal. */
type FolderRecord = {
  id: string;
  parentFolder: string | null;
};

/**
 * A handle over one write made of several: `primary` names the document and
 * the read-back; each stage settles when every part has, rejecting with the
 * first failure in the order given, and the receipt carries a token over all.
 */
class CompositeWriteHandle implements WriteHandle {
  private writtenReceipt: Promise<WriteReceipt> | undefined;
  private readableReceipt: Promise<WriteReceipt> | undefined;

  constructor(
    private readonly primary: WriteHandle,
    private readonly parts: readonly WriteHandle[],
  ) {}

  get jobId(): string {
    return this.primary.jobId;
  }

  get documentId(): string {
    return this.primary.documentId;
  }

  get branch(): string {
    return this.primary.branch;
  }

  get written(): Promise<WriteReceipt> {
    this.writtenReceipt ??= this.receiptAt("written");
    return this.writtenReceipt;
  }

  get readable(): Promise<WriteReceipt> {
    this.readableReceipt ??= this.receiptAt("readable");
    return this.readableReceipt;
  }

  async document<TDocument extends PHDocument = PHDocument>(
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    await this.readable;
    return this.primary.document<TDocument>(view, signal);
  }

  private async receiptAt(
    stage: "written" | "readable",
  ): Promise<WriteReceipt> {
    const receipts: WriteReceipt[] = [];
    for (const handle of [this.primary, ...this.parts]) {
      receipts.push(
        stage === "written" ? await handle.written : await handle.readable,
      );
    }
    return {
      ...receipts[0],
      token: mergeConsistencyTokens(receipts.map((receipt) => receipt.token)),
    };
  }
}

/** A write handle that also names the node the write made or changed. */
class NodeHandle implements NodeWriteHandle {
  constructor(
    private readonly handle: WriteHandle,
    readonly nodeId: string,
  ) {}

  get jobId(): string {
    return this.handle.jobId;
  }

  get documentId(): string {
    return this.handle.documentId;
  }

  get branch(): string {
    return this.handle.branch;
  }

  get written(): Promise<WriteReceipt> {
    return this.handle.written;
  }

  get readable(): Promise<WriteReceipt> {
    return this.handle.readable;
  }

  document<TDocument extends PHDocument = PHDocument>(
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.handle.document<TDocument>(view, signal);
  }
}

/**
 * The node writes of reactor-drives: folders are drive-scoped actions, files
 * are `drive/child` relationships carrying their parent folder, and nodes are
 * read from the `DriveNode` projection. Each write returns once its last step
 * is accepted; a step a later step depends on is waited for here.
 */
class ReactorDriveWriteStrategy implements IDriveWriteStrategy {
  constructor(
    private readonly read: IReactorReadClient,
    private readonly write: IReactorWriteClient,
    private readonly nodes: IDriveNodeSource,
  ) {}

  async addFile(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const documentId = document.header.id;
    const protocolVersions = await createVersionsOf(
      document,
      (options) => this.read.getCreateProtocolVersions(options, signal),
      driveIdentifier,
    );
    const metadata: DriveChildFileMetadata = {
      kind: "file",
      parentFolderId: parentFolder ?? null,
      documentType: document.header.documentType,
    };
    const request: BatchExecutionRequest = {
      jobs: [
        {
          key: "create",
          documentId,
          scope: "document",
          branch: "main",
          actions: creationActions(document, protocolVersions),
          dependsOn: [],
        },
        {
          key: "link",
          documentId: driveIdentifier,
          scope: "document",
          branch: "main",
          actions: [
            addRelationshipAction(
              driveIdentifier,
              documentId,
              DRIVE_CHILD_RELATIONSHIP_TYPE,
              metadata,
            ),
          ],
          dependsOn: ["create"],
        },
      ],
    };
    const batch = await this.write.executeBatch(request, signal);
    return new CompositeWriteHandle(batch.handles.create, [batch.handles.link]);
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    const folderId = generateId();
    const handle = await this.write.execute(
      driveIdentifier,
      "main",
      [
        addFolderAction({
          folderId,
          parentFolderId: parentFolder ?? null,
          name,
        }),
      ],
      signal,
    );
    return new NodeHandle(handle, folderId);
  }

  async removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    const node = await this.requireNode(driveIdentifier, nodeId, signal);

    if (node.kind === "folder") {
      const subtree = await this.nodes.getDescendants(
        driveIdentifier,
        nodeId,
        signal,
      );
      const fileDescendants = subtree.filter((n) => n.kind === "file");
      const subFolders = subtree.filter(
        (n) => n.kind === "folder" && n.id !== nodeId,
      );
      const batch: Action[] = [
        ...fileDescendants.map((f) =>
          removeRelationshipAction(
            driveIdentifier,
            f.id,
            DRIVE_CHILD_RELATIONSHIP_TYPE,
          ),
        ),
        ...orderDeepestFirst(subFolders, nodeId).map((f) =>
          removeFolderAction({ folderId: f.id }),
        ),
        removeFolderAction({ folderId: nodeId }),
      ];
      const driveHandle = await this.write.execute(
        driveIdentifier,
        "main",
        batch,
        signal,
      );
      await driveHandle.readable;

      const deletes: WriteHandle[] = [];
      for (const file of fileDescendants) {
        deletes.push(
          await this.write.deleteDocument(
            file.id,
            "cascade" as PropagationMode,
            signal,
          ),
        );
      }
      return new CompositeWriteHandle(driveHandle, deletes);
    }

    const unlinked = await this.write.execute(
      driveIdentifier,
      "main",
      [
        removeRelationshipAction(
          driveIdentifier,
          nodeId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
      ],
      signal,
    );
    await unlinked.readable;
    const deleted = await this.write.deleteDocument(nodeId, undefined, signal);
    return new CompositeWriteHandle(unlinked, [deleted]);
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    const node = await this.requireNode(driveIdentifier, nodeId, signal);
    if (node.kind === "file") {
      const renamed = await this.write.rename(nodeId, name, "main", signal);
      return new NodeHandle(renamed, nodeId);
    }
    const handle = await this.write.execute(
      driveIdentifier,
      "main",
      [updateFolderAction({ folderId: nodeId, name })],
      signal,
    );
    return new NodeHandle(handle, nodeId);
  }

  async setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
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
    const node = await this.requireNode(driveIdentifier, srcNodeId, signal);
    if (node.kind === "folder") {
      return this.write.execute(
        driveIdentifier,
        "main",
        [
          updateFolderAction({
            folderId: srcNodeId,
            parentFolderId: targetParentFolderId ?? null,
          }),
        ],
        signal,
      );
    }
    const metadata: DriveChildFileMetadata = {
      kind: "file",
      parentFolderId: targetParentFolderId ?? null,
      documentType: node.documentType ?? "",
    };
    return this.write.execute(
      driveIdentifier,
      "main",
      [
        removeRelationshipAction(
          driveIdentifier,
          srcNodeId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
        addRelationshipAction(
          driveIdentifier,
          srcNodeId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          metadata,
        ),
      ],
      signal,
    );
  }

  async copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
    options?: CopyNodeOptions,
  ): Promise<WriteHandle> {
    if (options?.protocolVersions) {
      throw new Error(
        "ReactorDriveClient.copyNode replays the source's operations and cannot override its protocolVersions",
      );
    }
    await this.requireNode(driveIdentifier, srcNodeId, signal);
    const subtree = await this.nodes.getDescendants(
      driveIdentifier,
      srcNodeId,
      signal,
    );

    if (
      targetParentFolderId !== undefined &&
      subtree.some((n) => n.id === targetParentFolderId)
    ) {
      throw new Error(
        `Cannot copy node ${srcNodeId} into itself or one of its descendants (target: ${targetParentFolderId})`,
      );
    }

    const idMap = new Map<string, string>();
    for (const node of subtree) {
      idMap.set(node.id, generateId());
    }
    const policy = await this.read.getCreateSignaturePolicy();
    const selectedByType = new Map<string, ProtocolVersions>();

    const jobs: ExecutionJobPlan[] = [];
    const driveActions: Action[] = [];
    const fileCreateKeys: string[] = [];

    for (const node of subtree) {
      let newId = idMap.get(node.id)!;
      let newParent: string | null;
      if (node.id === srcNodeId) {
        newParent = targetParentFolderId ?? null;
      } else {
        if (node.parentFolder == null) {
          throw new Error(
            `copyNode: descendant ${node.id} has no parentFolder`,
          );
        }
        const mapped = idMap.get(node.parentFolder);
        if (mapped === undefined) {
          throw new Error(
            `copyNode: descendant ${node.id} parent ${node.parentFolder} missing from idMap`,
          );
        }
        newParent = mapped;
      }

      if (node.kind === "folder") {
        driveActions.push(
          addFolderAction({
            folderId: newId,
            parentFolderId: newParent,
            name: node.name,
          }),
        );
        continue;
      }

      const srcDoc = await this.read.get<PHDocument>(
        node.id,
        undefined,
        signal,
      );
      const documentType = srcDoc.header.documentType;
      const { results: allModules } = await this.read.getDocumentModelModules();
      const modulesForType = allModules.filter(
        (m) => m.documentModel.global.id === documentType,
      );
      if (modulesForType.length === 0) {
        throw new Error(
          `Document model module not found for type: ${documentType}`,
        );
      }
      const reducers: VersionedReplayConfig["reducers"] = {};
      for (const m of modulesForType) {
        reducers[m.version ?? 1] = m.reducer as Reducer<PHBaseState>;
      }
      const config: VersionedReplayConfig = { reducers };
      // A copy keeps its source's versions; selection fills the keys it lacks.
      let selected = selectedByType.get(documentType);
      if (selected === undefined) {
        selected = await this.read.getCreateProtocolVersions(
          { documentType, parentIdentifier: driveIdentifier },
          signal,
        );
        selectedByType.set(documentType, selected);
      }
      const replayHeader = createCopyHeader(
        {
          documentType,
          protocolVersions: { ...selected, ...srcDoc.header.protocolVersions },
        },
        newId,
        policy,
      );
      // A v2-required copy takes a derived id; files head no subtree.
      newId = replayHeader.id;
      const duplicated: PHDocument = replayDocumentVersioned(
        srcDoc.initialState,
        srcDoc.operations,
        config,
        replayHeader,
      );
      assertAuthPreservedOnDuplicate(
        node.id,
        srcDoc.state.auth,
        duplicated.state.auth,
      );
      duplicated.header.name = node.name;

      const createKey = `create:${newId}`;
      jobs.push({
        key: createKey,
        documentId: newId,
        scope: "document",
        branch: "main",
        actions: creationActions(
          duplicated,
          duplicated.header.protocolVersions ?? selected,
        ),
        dependsOn: [],
      });
      fileCreateKeys.push(createKey);

      const metadata: DriveChildFileMetadata = {
        kind: "file",
        parentFolderId: newParent,
        documentType: duplicated.header.documentType,
      };
      driveActions.push(
        addRelationshipAction(
          driveIdentifier,
          newId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          metadata,
        ),
      );
    }

    jobs.push({
      key: "drive",
      documentId: driveIdentifier,
      scope: "document",
      branch: "main",
      actions: driveActions,
      dependsOn: fileCreateKeys,
    });

    const batch = await this.write.executeBatch({ jobs }, signal);
    return new CompositeWriteHandle(
      batch.handles.drive,
      fileCreateKeys.map((key) => batch.handles[key]),
    );
  }

  private async requireNode(
    driveIdentifier: string,
    nodeId: string,
    signal: AbortSignal | undefined,
  ): Promise<DriveNodeRecord> {
    const node = await this.nodes.getNode(driveIdentifier, nodeId, signal);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }
    return node;
  }
}

function orderDeepestFirst<T extends FolderRecord>(
  folders: T[],
  rootId: string,
): T[] {
  const depthById = new Map<string, number>();
  const compute = (id: string): number => {
    if (id === rootId) return 0;
    const cached = depthById.get(id);
    if (cached !== undefined) return cached;
    const folder = folders.find((f) => f.id === id);
    if (!folder) return 0;
    const parent = folder.parentFolder ?? rootId;
    const depth = compute(parent) + 1;
    depthById.set(id, depth);
    return depth;
  };
  return folders.slice().sort((a, b) => compute(b.id) - compute(a.id));
}

/**
 * The write strategy for drives of `REACTOR_DRIVE_DOCUMENT_TYPE`. Registered on
 * the client builder with `withDriveWriteStrategy`; needs the `DriveNode`
 * projection as its node source.
 */
export function createReactorDriveWriteStrategy(
  args: ReactorDriveWriteStrategyArgs,
): IDriveWriteStrategy {
  if (!args.nodes) {
    throw new Error(
      "The reactor-drive write strategy needs a drive node source (withDriveNodeSource)",
    );
  }
  return new ReactorDriveWriteStrategy(args.read, args.write, args.nodes);
}
