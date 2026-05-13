import {
  addRelationshipAction,
  removeRelationshipAction,
  removeRelationshipSubtreeAction,
  updateRelationshipAction,
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
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  DRIVE_CHILD_RELATIONSHIP_TYPE,
  REACTOR_DRIVE_DOCUMENT_TYPE,
} from "../constants.js";
import {
  setAvailableOfflineAction,
  setDriveIconAction,
  setDriveNameAction,
  setSharingTypeAction,
} from "../actions.js";
import { reactorDriveCreateDocument } from "../module.js";
import type { IDriveReadModel } from "../read-model/interfaces.js";
import type {
  ReactorDriveFileNode,
  ReactorDriveFolderNode,
  ReactorDriveNode,
} from "../types.js";

export interface ReactorDriveClientArgs {
  reactor: IReactorClient;
  readModel: IDriveReadModel;
}

/**
 * Implementation of {@link IDriveClient} backed by the reactor's generic
 * relationship system and the drive-specific `NodeProcessor` projection.
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
    return this.toLegacyDriveDocument(created);
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const created = await this.reactor.createDocumentInDrive<TDocument>(
      driveIdentifier,
      document,
      parentFolder,
      signal,
    );
    const parent = parentFolder ?? driveIdentifier;
    await this.reactor.execute(
      driveIdentifier,
      "main",
      [
        addRelationshipAction(
          parent,
          document.header.id,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          { kind: "file" },
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
    const parent = parentFolder ?? driveIdentifier;
    await this.reactor.execute(
      driveIdentifier,
      "main",
      [
        addRelationshipAction(parent, folderId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
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
    const parentId = node.parentFolder ?? driveIdentifier;

    if (node.kind === "folder") {
      const subtree = await this.readModel.getDescendants(
        driveIdentifier,
        nodeId,
        signal,
      );
      await this.reactor.execute(
        driveIdentifier,
        "main",
        [
          removeRelationshipSubtreeAction(
            parentId,
            nodeId,
            DRIVE_CHILD_RELATIONSHIP_TYPE,
          ),
        ],
        signal,
      );
      for (const descendant of subtree) {
        if (descendant.kind === "file") {
          await this.reactor.deleteDocument(
            descendant.id,
            "cascade" as PropagationMode,
            signal,
          );
        }
      }
      return;
    }

    await this.reactor.execute(
      driveIdentifier,
      "main",
      [
        removeRelationshipAction(
          parentId,
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
      const parentId = node.parentFolder ?? driveIdentifier;
      await this.reactor.execute(
        driveIdentifier,
        "main",
        [
          updateRelationshipAction(
            parentId,
            nodeId,
            DRIVE_CHILD_RELATIONSHIP_TYPE,
            { kind: "folder", name },
          ),
        ],
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
    const oldParent = node.parentFolder ?? driveIdentifier;
    const newParent = targetParentFolderId ?? driveIdentifier;

    const metadata =
      node.kind === "folder"
        ? { kind: "folder", name: node.name }
        : { kind: "file" };

    await this.reactor.execute(
      driveIdentifier,
      "main",
      [
        removeRelationshipAction(
          oldParent,
          srcNodeId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
        addRelationshipAction(
          newParent,
          srcNodeId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          metadata,
        ),
      ],
      signal,
    );

    const drive = await this.reactor.get<PHDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    return this.toLegacyDriveDocument(drive);
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
    const idMap = new Map<string, string>();
    for (const node of subtree) {
      idMap.set(node.id, generateId());
    }

    for (const node of subtree) {
      const newId = idMap.get(node.id)!;
      const sourceParent = node.parentFolder ?? driveIdentifier;
      const newParent =
        node.id === srcNodeId
          ? (targetParentFolderId ?? driveIdentifier)
          : (idMap.get(sourceParent) ?? sourceParent);

      if (node.kind === "folder") {
        await this.reactor.execute(
          driveIdentifier,
          "main",
          [
            addRelationshipAction(
              newParent,
              newId,
              DRIVE_CHILD_RELATIONSHIP_TYPE,
              { kind: "folder", name: node.name },
            ),
          ],
          signal,
        );
      } else {
        const srcDoc = await this.reactor.get<PHDocument>(
          node.id,
          undefined,
          signal,
        );
        const module = await this.reactor.getDocumentModelModule(
          srcDoc.header.documentType,
        );
        const duplicated = replayDocument(
          srcDoc.initialState,
          srcDoc.operations,
          module.reducer,
          createPresignedHeader(newId, srcDoc.header.documentType),
        );
        duplicated.header.name = node.name;
        await this.addFile(
          driveIdentifier,
          duplicated,
          newParent === driveIdentifier ? undefined : newParent,
          signal,
        );
      }
    }

    const drive = await this.reactor.get<PHDocument>(
      driveIdentifier,
      undefined,
      signal,
    );
    return this.toLegacyDriveDocument(drive);
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
    const effectiveParent = parentFolder === undefined ? null : parentFolder;
    const page = await this.readModel.listChildren(
      driveIdentifier,
      effectiveParent,
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

  private toLegacyDriveDocument(doc: PHDocument): DocumentDriveDocument {
    if (doc.header.documentType !== REACTOR_DRIVE_DOCUMENT_TYPE) {
      throw new Error(
        `Document ${doc.header.id} is not a reactor-drive document`,
      );
    }
    return doc as unknown as DocumentDriveDocument;
  }
}

export {
  setAvailableOfflineAction,
  setDriveIconAction,
  setDriveNameAction,
  setSharingTypeAction,
};
