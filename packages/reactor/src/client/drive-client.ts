import {
  isFolderNode,
  type DocumentDriveDocument,
  type DriveInput,
  type FolderNode,
  type Node,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IReactor } from "../core/types.js";
import type {
  ConsistencyToken,
  PagedResults,
  PagingOptions,
  ViewFilter,
} from "../shared/types.js";
import { DriveReadClient } from "./drive-read-client.js";
import {
  asJobError,
  DriveWriteClient,
  type BatchSubmitter,
  type DriveWriteHalf,
} from "./drive-write-client.js";
import { WriteHandleFactory, type HandleReader } from "./internal/handles.js";
import type {
  IDriveClient,
  IDriveReadClient,
  IDriveWriteClient,
  IReactorClient,
  WriteHandle,
} from "./types.js";

export type { BatchSubmitter } from "./drive-write-client.js";

/** The client members a {@link DriveClient} reads and writes through. */
export type DriveClientDeps = Pick<
  IReactorClient,
  | "get"
  | "execute"
  | "create"
  | "setPreferredEditor"
  | "getCreateSignaturePolicy"
  | "getCreateProtocolVersions"
  | "waitForJob"
>;

/**
 * The drive facade: today's {@link IDriveClient} over a drive read half and a
 * drive write half. Each write is the write half's, then the document its
 * handle names, read back once readable; a FAILED job is thrown as the job's
 * own error, by name, as the drive client has always thrown it.
 */
export class DriveClientFacade implements IDriveClient {
  constructor(
    protected readonly reads: IDriveReadClient,
    protected readonly writes: IDriveWriteClient,
  ) {}

  async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const handle = await this.writes.create(input, signal);
    return this.documentOf<DocumentDriveDocument>(handle, signal);
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const handle = await this.writes.addFile(
      driveIdentifier,
      document,
      parentFolder,
      signal,
    );
    // Through the read half, not the reactor: it holds the read gate, and a
    // document handed back from a write is a read like any other.
    return this.documentOf<TDocument>(handle, signal);
  }

  async addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    const handle = await this.writes.addFolder(
      driveIdentifier,
      name,
      parentFolder,
      signal,
    );
    const updated = await this.documentOf<DocumentDriveDocument>(
      handle,
      signal,
    );
    // A denied action still completes its job, so a caller with no grant gets
    // the document back without the scope it tried to write.
    const node = (
      updated.state as Partial<typeof updated.state>
    ).global?.nodes.find((n) => n.id === handle.nodeId);
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
    const handle = await this.writes.removeNode(
      driveIdentifier,
      nodeId,
      signal,
    );
    await this.completed(handle);
  }

  async renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    const handle = await this.writes.renameNode(
      driveIdentifier,
      nodeId,
      name,
      signal,
    );
    const drive = await this.documentOf<DocumentDriveDocument>(handle, signal);
    const node = (
      drive.state as Partial<typeof drive.state>
    ).global?.nodes.find((n) => n.id === handle.nodeId);
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
    const handle = await this.writes.setPreferredEditorOnNode(
      nodeId,
      preferredEditor,
      signal,
    );
    return this.documentOf(handle, signal);
  }

  async moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const handle = await this.writes.moveNode(
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
      signal,
    );
    return this.documentOf<DocumentDriveDocument>(handle, signal);
  }

  async copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const handle = await this.writes.copyNode(
      driveIdentifier,
      srcNodeId,
      targetParentFolderId,
      signal,
    );
    return this.documentOf<DocumentDriveDocument>(handle, signal);
  }

  getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    return this.reads.getNode(driveIdentifier, nodeId, signal);
  }

  listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    return this.reads.listNodes(driveIdentifier, parentFolder, paging, signal);
  }

  private async completed(handle: WriteHandle): Promise<void> {
    try {
      await handle.readable;
    } catch (error) {
      throw asJobError(error);
    }
  }

  private async documentOf<TDocument extends PHDocument = PHDocument>(
    handle: WriteHandle,
    signal: AbortSignal | undefined,
  ): Promise<TDocument> {
    await this.completed(handle);
    return handle.document<TDocument>(undefined, signal);
  }
}

/**
 * The drive facade built from a client that has only the facade surface, as
 * the drive client was constructed before the halves existed (the router
 * builds one per backend). The client's writes wait for their jobs, so the
 * handles they make are already settled and carry the document the write
 * returned; batches go through `submitter` and wait through `waitForJob`.
 */
export class DriveClient extends DriveClientFacade {
  /** `submitter` may still be an IReactor, whose executeBatch is used. */
  constructor(
    client: DriveClientDeps,
    logger: ILogger,
    submitter: BatchSubmitter | IReactor,
    signer: ISigner,
    resolveReference: (
      identifier: string,
      signal?: AbortSignal,
    ) => Promise<string>,
  ) {
    const handles = new WriteHandleFactory({
      waitForStage: (jobId, _stage, signal) => client.waitForJob(jobId, signal),
    });
    super(
      new DriveReadClient(client, logger),
      new DriveWriteClient(
        facadeWriteHalf(client, handles),
        client,
        handles,
        logger,
        submitter,
        signer,
        resolveReference,
      ),
    );
  }
}

/** The drive write half's submissions, over a facade-only client. */
function facadeWriteHalf(
  client: DriveClientDeps,
  handles: WriteHandleFactory,
): DriveWriteHalf {
  /**
   * A settled handle carrying the document the write returned: read back
   * without a view, it is that document; with one, it is read again.
   */
  const carrying = (document: PHDocument, branch: string): WriteHandle => {
    const documentId = document.header.id;
    const reader: HandleReader = <T extends PHDocument>(
      receipt: { branch: string; token: ConsistencyToken },
      view: ViewFilter | undefined,
      signal: AbortSignal | undefined,
    ): Promise<T> =>
      view === undefined
        ? Promise.resolve(document as T)
        : client.get<T>(
            documentId,
            { ...view, branch: receipt.branch },
            signal,
            receipt.token,
          );
    return handles.settled(documentId, branch, reader);
  };

  return {
    async execute(
      documentIdentifier: string,
      branch: string,
      actionsToRun: Action[],
      signal?: AbortSignal,
    ): Promise<WriteHandle> {
      const document = await client.execute(
        documentIdentifier,
        branch,
        actionsToRun,
        signal,
      );
      return carrying(document, branch);
    },
    async create(
      document: PHDocument,
      parentIdentifier?: string,
      signal?: AbortSignal,
    ): Promise<WriteHandle> {
      const created = await client.create(document, parentIdentifier, signal);
      return carrying(created, created.header.branch || "main");
    },
    async setPreferredEditor(
      documentIdentifier: string,
      preferredEditor: string | null,
      branch: string = "main",
      signal?: AbortSignal,
    ): Promise<WriteHandle> {
      const document = await client.setPreferredEditor(
        documentIdentifier,
        preferredEditor,
        branch,
        signal,
      );
      return carrying(document, branch);
    },
  };
}
