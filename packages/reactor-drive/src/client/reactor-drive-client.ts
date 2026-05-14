import {
  addRelationshipAction,
  removeRelationshipAction,
  type IDriveClient,
  type IReactorClient,
  type PagedResults,
  type PagingOptions,
  type PropagationMode,
} from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  DriveInput,
  FileNode,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  createPresignedHeader,
  generateId,
  replayDocument,
  type Action,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  DRIVE_CHILD_RELATIONSHIP_TYPE,
  REACTOR_DRIVE_DOCUMENT_TYPE,
} from "../constants.js";
import {
  addFolderAction,
  removeFolderAction,
  setAvailableOfflineAction,
  setDriveIconAction,
  setDriveNameAction,
  setSharingTypeAction,
  updateFolderAction,
} from "../actions.js";
import { reactorDriveCreateDocument } from "../module.js";
import type { IDriveReadModel } from "../read-model/interfaces.js";
import type {
  DriveChildFileMetadata,
  ReactorDriveFileNode,
  ReactorDriveFolderNode,
  ReactorDriveNode,
} from "../types.js";

export interface ReactorDriveClientArgs {
  reactor: IReactorClient;
  readModel: IDriveReadModel;
}

/**
 * Implementation of {@link IDriveClient} backed by the reactor's relationship
 * primitives and the drive-scoped folder actions. Folder structure lives in
 * the operation log (ADD_FOLDER/UPDATE_FOLDER/REMOVE_FOLDER + ADD_RELATIONSHIP
 * for files) and is materialised by `NodeProcessor` into the `DriveNode`
 * table consumed via {@link IDriveReadModel}.
 */
export class ReactorDriveClient implements IDriveClient {
  private readonly reactor: IReactorClient;
  private readonly readModel: IDriveReadModel;

  constructor(args: ReactorDriveClientArgs) {
    this.reactor = args.reactor;
    this.readModel = args.readModel;
  }

  async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const driveDoc = reactorDriveCreateDocument({
      global: {
        name: input.global.name,
        icon: input.global.icon ?? null,
      },
    });
    if (input.local) {
      if (typeof input.local.sharingType === "string") {
        driveDoc.state.local.sharingType = input.local.sharingType;
      }
      if (typeof input.local.availableOffline === "boolean") {
        driveDoc.state.local.availableOffline = input.local.availableOffline;
      }
    }
    if (input.preferredEditor) {
      driveDoc.header.meta = {
        ...driveDoc.header.meta,
        preferredEditor: input.preferredEditor,
      };
    }
    const created = await this.reactor.create(driveDoc, undefined, signal);
    return this.toLegacyDriveDocument(created, created.header.id);
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const created = await this.reactor.create<TDocument>(
      document,
      undefined,
      signal,
    );
    const metadata: DriveChildFileMetadata = {
      kind: "file",
      parentFolderId: parentFolder ?? null,
      documentType: document.header.documentType,
    };
    await this.reactor.execute(
      driveIdentifier,
      "main",
      [
        addRelationshipAction(
          driveIdentifier,
          document.header.id,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          metadata,
        ),
      ],
      signal,
    );
    return created;
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    const folderId = generateId();
    await this.reactor.execute(
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
    return {
      id: folderId,
      kind: "folder",
      name,
      parentFolder: parentFolder ?? null,
    };
  }

  async removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const node = await this.readModel.getNode(driveIdentifier, nodeId, signal);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }

    if (node.kind === "folder") {
      const subtree = await this.readModel.getDescendants(
        driveIdentifier,
        nodeId,
        signal,
      );
      const fileDescendants = subtree.filter(
        (n): n is ReactorDriveFileNode => n.kind === "file",
      );
      const subFolders = subtree
        .filter((n): n is ReactorDriveFolderNode => n.kind === "folder")
        .filter((f) => f.id !== nodeId);
      const deepestFirstFolders = this.orderDeepestFirst(subFolders, nodeId);

      const batch: Action[] = [
        ...fileDescendants.map((f) =>
          removeRelationshipAction(
            driveIdentifier,
            f.id,
            DRIVE_CHILD_RELATIONSHIP_TYPE,
          ),
        ),
        ...deepestFirstFolders.map((f) =>
          removeFolderAction({ folderId: f.id }),
        ),
        removeFolderAction({ folderId: nodeId }),
      ];

      await this.reactor.execute(driveIdentifier, "main", batch, signal);

      for (const file of fileDescendants) {
        await this.reactor.deleteDocument(
          file.id,
          "cascade" as PropagationMode,
          signal,
        );
      }
      return;
    }

    await this.reactor.execute(
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
    await this.reactor.deleteDocument(nodeId, undefined, signal);
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    const node = await this.readModel.getNode(driveIdentifier, nodeId, signal);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }

    if (node.kind === "file") {
      await this.reactor.rename(nodeId, name, "main", signal);
    } else {
      await this.reactor.execute(
        driveIdentifier,
        "main",
        [updateFolderAction({ folderId: nodeId, name })],
        signal,
      );
    }

    const updated = await this.readModel.getNode(
      driveIdentifier,
      nodeId,
      signal,
    );
    if (!updated) {
      throw new Error("Node missing from drive after rename");
    }
    return this.toLegacyNode(updated);
  }

  async setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.reactor.setPreferredEditor(
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
    const node = await this.readModel.getNode(
      driveIdentifier,
      srcNodeId,
      signal,
    );
    if (!node) {
      throw new Error(
        `Node ${srcNodeId} not found in drive ${driveIdentifier}`,
      );
    }

    if (node.kind === "folder") {
      await this.reactor.execute(
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
    } else {
      const metadata: DriveChildFileMetadata = {
        kind: "file",
        parentFolderId: targetParentFolderId ?? null,
        documentType: node.documentType,
      };
      await this.reactor.execute(
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

    const drive = await this.reactor.get<PHDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    return this.toLegacyDriveDocument(drive, driveIdentifier);
  }

  async copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const srcNode = await this.readModel.getNode(
      driveIdentifier,
      srcNodeId,
      signal,
    );
    if (!srcNode) {
      throw new Error(
        `Node ${srcNodeId} not found in drive ${driveIdentifier}`,
      );
    }

    const subtree = await this.readModel.getDescendants(
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

    for (const node of subtree) {
      const newId = idMap.get(node.id)!;
      const newParent =
        node.id === srcNodeId
          ? (targetParentFolderId ?? null)
          : (idMap.get(node.parentFolder ?? "") ?? null);

      if (node.kind === "folder") {
        await this.reactor.execute(
          driveIdentifier,
          "main",
          [
            addFolderAction({
              folderId: newId,
              parentFolderId: newParent,
              name: node.name,
            }),
          ],
          signal,
        );
      } else {
        const srcDoc = await this.reactor.get<PHDocument>(
          node.id,
          undefined,
          signal,
        );
        const documentModelModule = await this.reactor.getDocumentModelModule(
          srcDoc.header.documentType,
        );
        const duplicated = replayDocument(
          srcDoc.initialState,
          srcDoc.operations,
          documentModelModule.reducer,
          createPresignedHeader(newId, srcDoc.header.documentType),
        );
        duplicated.header.name = node.name;
        await this.addFile(
          driveIdentifier,
          duplicated,
          newParent ?? undefined,
          signal,
        );
      }
    }

    const drive = await this.reactor.get<PHDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    return this.toLegacyDriveDocument(drive, driveIdentifier);
  }

  async getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    const node = await this.readModel.getNode(driveIdentifier, nodeId, signal);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in drive ${driveIdentifier}`);
    }
    return this.toLegacyNode(node);
  }

  async listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    const page = await this.readModel.listChildren(
      driveIdentifier,
      parentFolder,
      paging,
      signal,
    );
    return {
      results: page.results.map((node) => this.toLegacyNode(node)),
      options: page.options,
      ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    };
  }

  private toLegacyNode(node: ReactorDriveNode): Node {
    if (node.kind === "file") {
      const file: ReactorDriveFileNode = node;
      const legacy: FileNode = {
        id: file.id,
        kind: "file",
        name: file.name,
        parentFolder: file.parentFolder,
        documentType: file.documentType,
      };
      return legacy;
    }
    const folder: ReactorDriveFolderNode = node;
    const legacy: FolderNode = {
      id: folder.id,
      kind: "folder",
      name: folder.name,
      parentFolder: folder.parentFolder,
    };
    return legacy;
  }

  private async toLegacyDriveDocument(
    doc: PHDocument,
    driveId: string,
  ): Promise<DocumentDriveDocument> {
    if (doc.header.documentType !== REACTOR_DRIVE_DOCUMENT_TYPE) {
      throw new Error(
        `Document ${doc.header.id} is not a reactor-drive document`,
      );
    }
    const allNodes = await this.readModel.listAll(driveId);
    const legacy = structuredClone(doc) as unknown as DocumentDriveDocument;
    const existingGlobal = legacy.state.global as Partial<
      DocumentDriveDocument["state"]["global"]
    >;
    legacy.state.global = {
      name: existingGlobal.name ?? "",
      icon: existingGlobal.icon ?? null,
      nodes: allNodes.map((n) => this.toLegacyNode(n)),
    };
    return legacy;
  }

  private orderDeepestFirst(
    folders: ReactorDriveFolderNode[],
    rootId: string,
  ): ReactorDriveFolderNode[] {
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
}

export {
  setAvailableOfflineAction,
  setDriveIconAction,
  setDriveNameAction,
  setSharingTypeAction,
};
