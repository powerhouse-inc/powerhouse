import {
  DriveClient,
  type IDriveClient,
  type PagedResults,
  type PagingOptions,
  type ViewFilter,
} from "@powerhousedao/reactor";
import type {
  DocumentDriveDocument,
  DriveInput,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { ISigner, PHDocument } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { RouterBackend } from "./backend.js";
import { ATTEMPT, type RouteDispatcher } from "./dispatcher.js";
import { DEFAULT_BRANCH } from "./types.js";

/** An identifier's id on one backend: its resolver when declared, else a read. */
export async function resolveOn(
  backend: RouterBackend,
  identifier: string,
  signal?: AbortSignal,
  view?: ViewFilter,
): Promise<string> {
  const api = backend.api;
  if (api.resolveIdOrSlug !== undefined) {
    return api.resolveIdOrSlug(identifier, view, signal);
  }
  const document = await api.get(identifier, view, signal);
  return document.header.id;
}

/** Routes a drive call to the DriveClient of the backend holding the drive. */
export class RoutingDriveClient implements IDriveClient {
  private readonly clients = new Map<string, IDriveClient>();

  constructor(
    private readonly dispatcher: RouteDispatcher,
    logger: ILogger,
    signer: ISigner,
  ) {
    for (const backend of dispatcher.backends) {
      this.clients.set(
        backend.name,
        new DriveClient(
          backend.api,
          logger,
          (request, signal) => backend.api.executeBatch(request, signal),
          signer,
          (identifier, signal) => resolveOn(backend, identifier, signal),
        ),
      );
    }
  }

  /** The drive client of one backend. */
  on(backend: RouterBackend): IDriveClient {
    const client = this.clients.get(backend.name);
    if (client === undefined) {
      throw new Error(`No drive client for backend ${backend.name}`);
    }
    return client;
  }

  /** Placed by the input's id or slug; with neither, on the primary. */
  async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const backend = await this.placeNewDrive(input);
    const drive = await this.dispatcher.onBackend(
      "drives.create",
      backend,
      (target) => this.on(target).create(input, signal),
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(drive.header.id, backend.name);
    if (drive.header.slug !== "") {
      this.dispatcher.recordDocument(drive.header.slug, backend.name);
    }
    this.dispatcher.table.recordCollection(
      this.dispatcher.collectionFor(drive.header.id, drive.header.branch),
      backend.name,
      "accepted",
    );
    return drive;
  }

  async addFile<TDocument extends PHDocument = PHDocument>(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    let owner = "";
    const created = await this.dispatcher.onCollection(
      "drives.addFile",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) => {
        owner = backend.name;
        return this.on(backend).addFile<TDocument>(
          driveIdentifier,
          document,
          parentFolder,
          signal,
        );
      },
      ATTEMPT.write,
    );
    this.dispatcher.recordDocument(created.header.id, owner);
    return created;
  }

  addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<FolderNode> {
    return this.dispatcher.onCollection(
      "drives.addFolder",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        this.on(backend).addFolder(driveIdentifier, name, parentFolder, signal),
      ATTEMPT.write,
    );
  }

  removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.dispatcher.onCollection(
      "drives.removeNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) => this.on(backend).removeNode(driveIdentifier, nodeId, signal),
      ATTEMPT.write,
    );
  }

  renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    return this.dispatcher.onCollection(
      "drives.renameNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        this.on(backend).renameNode(driveIdentifier, nodeId, name, signal),
      ATTEMPT.write,
    );
  }

  /** Names a node and no drive, so it routes as a document. */
  setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    return this.dispatcher.onDocument(
      "drives.setPreferredEditorOnNode",
      nodeId,
      (backend) =>
        this.on(backend).setPreferredEditorOnNode(
          nodeId,
          preferredEditor,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    return this.dispatcher.onCollection(
      "drives.moveNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        this.on(backend).moveNode(
          driveIdentifier,
          srcNodeId,
          targetParentFolderId,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    return this.dispatcher.onCollection(
      "drives.copyNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        this.on(backend).copyNode(
          driveIdentifier,
          srcNodeId,
          targetParentFolderId,
          signal,
        ),
      ATTEMPT.write,
    );
  }

  getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    return this.dispatcher.onCollection(
      "drives.getNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) => this.on(backend).getNode(driveIdentifier, nodeId, signal),
      ATTEMPT.read,
    );
  }

  /** Read from the drive's own backend: its nodes live in that drive's state. */
  listNodes(
    driveIdentifier: string,
    parentFolder?: string | null,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Node>> {
    return this.dispatcher.onCollection(
      "drives.listNodes",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        this.on(backend).listNodes(
          driveIdentifier,
          parentFolder,
          paging,
          signal,
        ),
      ATTEMPT.read,
    );
  }

  private async placeNewDrive(input: DriveInput): Promise<RouterBackend> {
    const key = input.id ?? input.slug ?? "";
    if (key === "") {
      return this.dispatcher.primary;
    }
    const collection = this.dispatcher.collectionFor(key, DEFAULT_BRANCH);
    const route = await this.dispatcher.placed(() =>
      this.dispatcher.table.collectionRoute(collection),
    );
    return this.dispatcher.table.backend(
      route.backend,
      `placement for a new drive keyed ${JSON.stringify(key)}`,
    );
  }
}
