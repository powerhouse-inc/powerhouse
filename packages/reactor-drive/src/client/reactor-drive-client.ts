import type {
  IDriveClient,
  IDriveWriteStrategy,
  IReactorClient,
  IReactorReadClient,
  IReactorWriteClient,
  PagedResults,
  PagingOptions,
  WriteHandle,
} from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  DriveInput,
  FileNode,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import {
  requestedSignaturePolicy,
  withSignaturePolicy,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { REACTOR_DRIVE_DOCUMENT_TYPE } from "../constants.js";
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
import { createReactorDriveWriteStrategy } from "./reactor-drive-write-strategy.js";

/** The client halves the drive client reads and writes through. */
export interface ReactorDriveClientHalvesArgs {
  read: IReactorReadClient;
  write: IReactorWriteClient;
  readModel: IDriveReadModel;
}

/**
 * @deprecated Pass `read` and `write` ({@link ReactorDriveClientHalvesArgs}).
 * A facade is accepted for one release; its halves are used.
 */
export interface ReactorDriveClientFacadeArgs {
  reactor: IReactorClient;
  readModel: IDriveReadModel;
}

export type ReactorDriveClientArgs =
  | ReactorDriveClientHalvesArgs
  | ReactorDriveClientFacadeArgs;

/**
 * Implementation of {@link IDriveClient} backed by the reactor's relationship
 * primitives and the drive-scoped folder actions. Folder structure lives in
 * the operation log (ADD_FOLDER/UPDATE_FOLDER/REMOVE_FOLDER + ADD_RELATIONSHIP
 * for files) and is materialised by `NodeProcessor` into the `DriveNode`
 * table consumed via {@link IDriveReadModel}.
 */
export class ReactorDriveClient implements IDriveClient {
  private readonly read: IReactorReadClient;
  private readonly write: IReactorWriteClient;
  private readonly readModel: IDriveReadModel;
  private readonly strategy: IDriveWriteStrategy;

  constructor(args: ReactorDriveClientArgs) {
    if ("reactor" in args) {
      this.read = args.reactor.read;
      this.write = args.reactor.write;
    } else {
      this.read = args.read;
      this.write = args.write;
    }
    this.readModel = args.readModel;
    this.strategy = createReactorDriveWriteStrategy({
      read: this.read,
      write: this.write,
      nodes: this.readModel,
    });
  }

  async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const driveDoc = withSignaturePolicy(
      reactorDriveCreateDocument({
        global: {
          name: input.global.name,
          icon: input.global.icon ?? null,
        },
      }),
      requestedSignaturePolicy(
        input,
        await this.read.getCreateSignaturePolicy(),
      ),
      { protocolVersions: input.protocolVersions },
    );
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
    const handle = await this.write.create(driveDoc, undefined, signal);
    const created = await handle.document(undefined, signal);
    return this.toLegacyDriveDocument(created, created.header.id);
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.strategy.addFile(
      driveIdentifier,
      document,
      parentFolder,
      signal,
    );
    const receipt = await handle.readable;
    return this.read.get<TDocument>(
      document.header.id,
      undefined,
      signal,
      receipt.token,
    );
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    const handle = await this.strategy.addFolder(
      driveIdentifier,
      name,
      parentFolder,
      signal,
    );
    await handle.readable;
    return {
      id: handle.nodeId,
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
    const handle = await this.strategy.removeNode(
      driveIdentifier,
      nodeId,
      signal,
    );
    await handle.readable;
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    const handle = await this.strategy.renameNode(
      driveIdentifier,
      nodeId,
      name,
      signal,
    );
    await handle.readable;
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
    const handle = await this.strategy.setPreferredEditorOnNode(
      nodeId,
      preferredEditor,
      signal,
    );
    return handle.document(undefined, signal);
  }

  async moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const handle = await this.strategy.moveNode(
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
      signal,
    );
    return this.readDriveAfter(handle, driveIdentifier, signal);
  }

  async copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const handle = await this.strategy.copyNode(
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
      signal,
    );
    return this.readDriveAfter(handle, driveIdentifier, signal);
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
    };
  }

  /** Waits for the write, then reads the drive back in the legacy shape. */
  private async readDriveAfter(
    handle: WriteHandle,
    driveIdentifier: string,
    signal: AbortSignal | undefined,
  ): Promise<DocumentDriveDocument> {
    const receipt = await handle.readable;
    const drive = await this.read.get<PHDocument>(
      driveIdentifier,
      undefined,
      signal,
      receipt.token,
    );
    return this.toLegacyDriveDocument(drive, driveIdentifier);
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
}

export {
  setAvailableOfflineAction,
  setDriveIconAction,
  setDriveNameAction,
  setSharingTypeAction,
};
