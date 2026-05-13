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
  type FolderNode,
  type Node,
} from "@powerhousedao/shared/document-drive";
import { addFile as addFileAction } from "@powerhousedao/shared/document-drive";
import {
  actions,
  createPresignedHeader,
  generateId,
  replayDocument,
  type Action,
  type CreateDocumentActionInput,
  type ISigner,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import {
  addRelationshipAction,
  createDocumentAction,
  removeRelationshipAction,
  upgradeDocumentAction,
} from "../actions/index.js";
import type { IReactor } from "../core/types.js";
import { getSharedActionScope, signActions } from "../core/utils.js";
import type { PagedResults, PagingOptions } from "../shared/types.js";
import { JobStatus } from "../shared/types.js";
import type { IDriveClient, IReactorClient } from "./types.js";

/**
 * Implementation of {@link IDriveClient}.
 *
 * Holds a back-reference to its parent {@link IReactorClient} for read and
 * single-document write primitives, plus direct access to {@link IReactor}
 * for batch execution. The back-reference is captured but never invoked
 * during construction, so the partial-`this` hazard does not apply.
 */
export class DriveClient implements IDriveClient {
  constructor(
    private readonly client: IReactorClient,
    private readonly logger: ILogger,
    private readonly reactor: IReactor,
    private readonly signer: ISigner,
  ) {}

  async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    this.logger.verbose("drives.create(@input)", input);
    const driveDoc = driveCreateDocument({
      global: {
        name: input.global.name || "",
        icon: input.global.icon ?? null,
        nodes: [],
      },
    });
    if (input.preferredEditor) {
      driveDoc.header.meta = {
        ...driveDoc.header.meta,
        preferredEditor: input.preferredEditor,
      };
    }
    return this.client.create<DocumentDriveDocument>(
      driveDoc,
      undefined,
      signal,
    );
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    this.logger.verbose(
      "drives.addFile(@driveIdentifier, @document, @parentFolder)",
      driveIdentifier,
      document.header.id,
      parentFolder,
    );

    const documentId = document.header.id;

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
          toVersion: 1,
          initialState: document.state,
        }),
        addRelationshipAction(driveIdentifier, documentId, "child"),
      ],
      this.signer,
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
      signal,
    );

    const batchResult = await this.reactor.executeBatch(
      {
        jobs: [
          {
            key: "document",
            documentId,
            scope: getSharedActionScope(documentActions),
            branch: "main",
            actions: documentActions,
            dependsOn: [],
          },
          {
            key: "drive",
            documentId: driveIdentifier,
            scope: getSharedActionScope(driveActions),
            branch: "main",
            actions: driveActions,
            dependsOn: ["document"],
          },
        ],
      },
      signal,
    );

    const completedJobs = await Promise.all(
      Object.values(batchResult.jobs).map((job) =>
        this.client.waitForJob(job, signal),
      ),
    );

    for (const job of completedJobs) {
      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error?.message);
      }
    }

    return this.reactor.get<TDocument>(documentId);
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    this.logger.verbose(
      "drives.addFolder(@driveIdentifier, @name, @parentFolder)",
      driveIdentifier,
      name,
      parentFolder,
    );
    const folderId = generateId();
    const updated = await this.client.execute<DocumentDriveDocument>(
      driveIdentifier,
      "main",
      [addFolderAction({ id: folderId, name, parentFolder })],
      signal,
    );
    const node = updated.state.global.nodes.find((n) => n.id === folderId);
    if (!node || !isFolderNode(node)) {
      throw new Error("Folder creation failed");
    }
    return node;
  }

  async removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.logger.verbose(
      "drives.removeNode(@driveIdentifier, @nodeId)",
      driveIdentifier,
      nodeId,
    );
    const drive = await this.client.get<DocumentDriveDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    const node = drive.state.global.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }

    if (isFolderNode(node)) {
      const fileDescendants = getDescendants(
        node,
        drive.state.global.nodes,
      ).filter(isFileNode);
      for (const file of fileDescendants) {
        await this.removeFileNode(driveIdentifier, file.id, signal);
      }
      await this.client.execute(
        driveIdentifier,
        "main",
        [deleteNodeAction({ id: nodeId })],
        signal,
      );
      return;
    }

    await this.removeFileNode(driveIdentifier, nodeId, signal);
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    this.logger.verbose(
      "drives.renameNode(@driveIdentifier, @nodeId, @name)",
      driveIdentifier,
      nodeId,
      name,
    );
    const renamed = await this.client.execute(
      nodeId,
      "main",
      [actions.setName({ name })],
      signal,
    );
    if (renamed.header.name !== name) {
      throw new Error("Document rename did not apply");
    }
    const drive = await this.client.execute<DocumentDriveDocument>(
      driveIdentifier,
      "main",
      [updateNodeAction({ id: nodeId, name })],
      signal,
    );
    const node = drive.state.global.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error("Node missing from drive after rename");
    }
    return node;
  }

  async setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    this.logger.verbose(
      "drives.setPreferredEditorOnNode(@nodeId, @preferredEditor)",
      nodeId,
      preferredEditor,
    );
    return this.client.setPreferredEditor(
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
  ): Promise<DocumentDriveDocument> {
    this.logger.verbose(
      "drives.moveNode(@driveIdentifier, @srcNodeId, @targetParentFolderId)",
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
    );
    return this.client.execute<DocumentDriveDocument>(
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
  ): Promise<DocumentDriveDocument> {
    this.logger.verbose(
      "drives.copyNode(@driveIdentifier, @srcNodeId, @targetParentFolderId)",
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
    );
    const drive = await this.client.get<DocumentDriveDocument>(
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

    for (const entry of copyPlan) {
      const node = drive.state.global.nodes.find((n) => n.id === entry.srcId);
      if (!node || !isFileNode(node)) continue;
      const srcDoc = await this.client.get(entry.srcId, undefined, signal);
      const module = await this.client.getDocumentModelModule(
        srcDoc.header.documentType,
      );
      const duplicated = replayDocument(
        srcDoc.initialState,
        srcDoc.operations,
        module.reducer,
        createPresignedHeader(entry.targetId, srcDoc.header.documentType),
      );
      const resolvedName = resolvedNamesByTargetId.get(entry.targetId);
      if (resolvedName) {
        duplicated.header.name = resolvedName;
      }
      await this.addFile(
        driveIdentifier,
        duplicated,
        entry.targetParentFolder ?? undefined,
        signal,
      );
    }

    return this.client.execute<DocumentDriveDocument>(
      driveIdentifier,
      "main",
      copyPlan.map((entry) => copyNodeAction(entry)),
      signal,
    );
  }

  async getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    this.logger.verbose(
      "drives.getNode(@driveIdentifier, @nodeId)",
      driveIdentifier,
      nodeId,
    );
    const drive = await this.client.get<DocumentDriveDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    const node = drive.state.global.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }
    return node;
  }

  async listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    this.logger.verbose(
      "drives.listNodes(@driveIdentifier, @parentFolder, @paging)",
      driveIdentifier,
      parentFolder,
      paging,
    );
    const drive = await this.client.get<DocumentDriveDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    const allNodes = drive.state.global.nodes;
    const filtered =
      parentFolder === undefined
        ? [...allNodes]
        : allNodes.filter((n) => (n.parentFolder ?? null) === parentFolder);

    const effective: PagingOptions = paging ?? {
      cursor: "",
      limit: filtered.length,
    };
    const startIndex = effective.cursor ? Number(effective.cursor) || 0 : 0;
    const endIndex = startIndex + effective.limit;
    const slice = filtered.slice(startIndex, endIndex);
    const hasMore = endIndex < filtered.length;

    return {
      results: slice,
      options: effective,
      ...(hasMore ? { nextCursor: String(endIndex) } : {}),
      totalCount: filtered.length,
    };
  }

  private async removeFileNode(
    driveId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const relationshipActions: Action[] = await signActions(
      [removeRelationshipAction(driveId, fileId, "child")],
      this.signer,
      signal,
    );
    const driveActions: Action[] = await signActions(
      [deleteNodeAction({ id: fileId })],
      this.signer,
      signal,
    );

    const batchResult = await this.reactor.executeBatch(
      {
        jobs: [
          {
            key: "relationship",
            documentId: driveId,
            scope: getSharedActionScope(relationshipActions),
            branch: "main",
            actions: relationshipActions,
            dependsOn: [],
          },
          {
            key: "drive",
            documentId: driveId,
            scope: getSharedActionScope(driveActions),
            branch: "main",
            actions: driveActions,
            dependsOn: ["relationship"],
          },
        ],
      },
      signal,
    );

    const completedJobs = await Promise.all(
      Object.values(batchResult.jobs).map((job) =>
        this.client.waitForJob(job, signal),
      ),
    );
    for (const job of completedJobs) {
      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error?.message);
      }
    }

    const deleteJob = await this.reactor.deleteDocument(
      fileId,
      this.signer,
      signal,
    );
    const deleteCompleted = await this.client.waitForJob(deleteJob, signal);
    if (deleteCompleted.status === JobStatus.FAILED) {
      throw new Error(deleteCompleted.error?.message);
    }
  }
}
