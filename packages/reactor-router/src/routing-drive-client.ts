import {
  collectAllPages,
  DriveClient,
  DriveClientFacade,
  JobFailedError,
  JobStatus,
  toLegacyNode,
  type CopyNodeOptions,
  type IDriveReadClient,
  type IDriveWriteClient,
  type NodeWriteHandle,
  type PagedResults,
  type PagingOptions,
  type ViewFilter,
  type WriteHandle,
} from "@powerhousedao/reactor";
import {
  driveDocumentType,
  type DocumentDriveDocument,
  type DriveInput,
  type Node,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IRoutableBackend, RouterBackend } from "./backend.js";
import { ATTEMPT, type RouteDispatcher } from "./dispatcher.js";
import { jobIdsOfHandle } from "./routing-handles.js";
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

/** The id of the live document `identifier` names on one backend, if any. */
async function liveDocumentOn(
  backend: RouterBackend,
  identifier: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const served = await backend.api.isServed(identifier, undefined, signal);
  return served ? resolveOn(backend, identifier, signal) : undefined;
}

/**
 * A backend's facade members, with `execute` over its `submit` where it has
 * one: the job is submitted, waited for and its document read back, so no one
 * request has to outlast the write.
 */
function facadeMembersOf(api: IRoutableBackend): IRoutableBackend {
  const submit = api.submit;
  if (submit === undefined) {
    return api;
  }
  return {
    ...api,
    execute: async <TDocument extends PHDocument>(
      identifier: string,
      branch: string,
      actions: Action[],
      signal?: AbortSignal,
    ): Promise<TDocument> => {
      const job = await submit.execute(identifier, branch, actions, signal);
      const settled = await api.waitForJob(job, signal);
      if (settled.status === JobStatus.FAILED) {
        throw new JobFailedError(settled);
      }
      return api.get<TDocument>(
        job.documentId || identifier,
        { branch },
        signal,
        settled.consistencyToken,
      );
    },
  };
}

/** The drive client over a backend's facade members, with its halves exposed. */
class FacadeDriveClient extends DriveClient {
  get readHalf(): IDriveReadClient {
    return this.reads;
  }

  get writeHalf(): IDriveWriteClient {
    return this.writes;
  }
}

/**
 * Each backend's drive halves. Reads use the backend's `drives` node reads,
 * else its `read.drives`; writes its `write.drives`. Without those, the drive
 * client over its facade members, built once on first use, whose writes read
 * nodes through {@link readOn}, so they reach a drive that keeps no nodes in
 * its state.
 */
export class BackendDrives {
  private readonly facades = new Map<string, FacadeDriveClient>();

  constructor(
    private readonly logger: ILogger,
    private readonly signer: ISigner,
  ) {}

  readOn(backend: RouterBackend): IDriveReadClient {
    return (
      backend.api.drives ??
      backend.api.read?.drives ??
      this.facadeOf(backend).readHalf
    );
  }

  writeOn(backend: RouterBackend): IDriveWriteClient {
    return backend.api.write?.drives ?? this.facadeOf(backend).writeHalf;
  }

  /** A node and its subtree; a backend that cannot ask lists the whole drive. */
  private async nodesFrom(
    backend: RouterBackend,
    driveId: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node[]> {
    const source = backend.api.driveNodes;
    if (source !== undefined) {
      const nodes = await source.getDescendants(driveId, nodeId, signal);
      return nodes.map(toLegacyNode);
    }
    const page = await this.readOn(backend).listNodes(
      driveId,
      undefined,
      undefined,
      signal,
    );
    return collectAllPages(page, signal);
  }

  private facadeOf(backend: RouterBackend): FacadeDriveClient {
    let client = this.facades.get(backend.name);
    if (client === undefined) {
      client = new FacadeDriveClient(
        facadeMembersOf(backend.api),
        this.logger,
        (request, signal) => backend.api.executeBatch(request, signal),
        this.signer,
        (identifier, signal) => resolveOn(backend, identifier, signal),
        undefined,
        {
          lookupLiveDocument: (identifier, signal) =>
            liveDocumentOn(backend, identifier, signal),
          nodesFrom: (driveId, nodeId, signal) =>
            this.nodesFrom(backend, driveId, nodeId, signal),
          fileLinkTypes: backend.api.driveFileLinkTypes,
        },
      );
      this.facades.set(backend.name, client);
    }
    return client;
  }
}

/** Routes a drive read to the drive halves of the backend holding the drive. */
export class RoutingDriveReadClient implements IDriveReadClient {
  constructor(
    private readonly dispatcher: RouteDispatcher,
    private readonly drives: BackendDrives,
  ) {}

  getNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<Node> {
    return this.dispatcher.onCollection(
      "drives.getNode",
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) =>
        this.drives.readOn(backend).getNode(driveIdentifier, nodeId, signal),
      ATTEMPT.read,
    );
  }

  /** Read from the drive's own backend, which holds that drive's nodes. */
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
        this.drives
          .readOn(backend)
          .listNodes(driveIdentifier, parentFolder, paging, signal),
      ATTEMPT.read,
    );
  }
}

/**
 * Routes a drive write to the drive halves of the backend holding the drive
 * and hands back that backend's handle, recording where its jobs went.
 */
export class RoutingDriveWriteClient implements IDriveWriteClient {
  constructor(
    private readonly dispatcher: RouteDispatcher,
    private readonly drives: BackendDrives,
  ) {}

  /** Placed by the input's id or slug; with neither, on the primary. */
  async create(input: DriveInput, signal?: AbortSignal): Promise<WriteHandle> {
    const backend = await this.placeNewDrive(input);
    const handle = await this.dispatcher.onBackend(
      "drives.create",
      backend,
      async (target) => {
        await this.dispatcher.assertCreatable("drives.create", target, [
          driveDocumentType,
        ]);
        return this.drives.writeOn(target).create(input, signal);
      },
      ATTEMPT.write,
    );
    this.recordJobs(handle, backend.name);
    this.dispatcher.recordDocument(handle.documentId, backend.name);
    this.dispatcher.table.recordCollection(
      this.dispatcher.collectionFor(handle.documentId, handle.branch),
      backend.name,
      "accepted",
    );
    return handle;
  }

  async addFile(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    let owner = "";
    const handle = await this.dispatcher.onCollection(
      "drives.addFile",
      driveIdentifier,
      DEFAULT_BRANCH,
      async (backend) => {
        owner = backend.name;
        await this.dispatcher.assertCreatable("drives.addFile", backend, [
          document.header.documentType,
        ]);
        await this.dispatcher.assertCreatableBeside(
          "drives.addFile",
          backend,
          document.header.id,
          driveIdentifier,
        );
        return this.drives
          .writeOn(backend)
          .addFile(driveIdentifier, document, parentFolder, signal);
      },
      ATTEMPT.write,
    );
    this.recordJobs(handle, owner);
    this.dispatcher.recordDocument(handle.documentId, owner);
    return handle;
  }

  addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    return this.onDrive("drives.addFolder", driveIdentifier, (drives) =>
      drives.addFolder(driveIdentifier, name, parentFolder, signal),
    );
  }

  removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    return this.onDrive("drives.removeNode", driveIdentifier, (drives) =>
      drives.removeNode(driveIdentifier, nodeId, signal),
    );
  }

  renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle> {
    return this.onDrive("drives.renameNode", driveIdentifier, (drives) =>
      drives.renameNode(driveIdentifier, nodeId, name, signal),
    );
  }

  /** Names a node and no drive, so it routes as a document. */
  async setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    let owner = "";
    const handle = await this.dispatcher.onDocument(
      "drives.setPreferredEditorOnNode",
      nodeId,
      (backend) => {
        owner = backend.name;
        return this.drives
          .writeOn(backend)
          .setPreferredEditorOnNode(nodeId, preferredEditor, signal);
      },
      ATTEMPT.write,
    );
    this.recordJobs(handle, owner);
    return handle;
  }

  moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<WriteHandle> {
    return this.onDrive("drives.moveNode", driveIdentifier, (drives) =>
      drives.moveNode(driveIdentifier, srcNodeId, targetParentFolderId, signal),
    );
  }

  copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
    options?: CopyNodeOptions,
  ): Promise<WriteHandle> {
    return this.onDrive("drives.copyNode", driveIdentifier, (drives) =>
      drives.copyNode(
        driveIdentifier,
        srcNodeId,
        targetParentFolderId,
        signal,
        options,
      ),
    );
  }

  private async onDrive<T extends WriteHandle>(
    label: string,
    driveIdentifier: string,
    run: (drives: IDriveWriteClient) => Promise<T>,
  ): Promise<T> {
    let owner = "";
    const handle = await this.dispatcher.onCollection(
      label,
      driveIdentifier,
      DEFAULT_BRANCH,
      (backend) => {
        owner = backend.name;
        return run(this.drives.writeOn(backend));
      },
      ATTEMPT.write,
    );
    this.recordJobs(handle, owner);
    return handle;
  }

  private recordJobs(handle: WriteHandle, backend: string): void {
    for (const jobId of jobIdsOfHandle(handle)) {
      this.dispatcher.recordJob(jobId, backend);
    }
  }

  private async placeNewDrive(input: DriveInput): Promise<RouterBackend> {
    const key = input.id ?? input.slug ?? "";
    if (key === "") {
      return this.dispatcher.createHome;
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

/**
 * The routing drive facade: each write is the routing drive write half's,
 * then the document its handle names, read back once readable, as the
 * reactor's own drive facade does.
 */
export class RoutingDriveClient extends DriveClientFacade {
  constructor(
    reads: RoutingDriveReadClient,
    writes: RoutingDriveWriteClient,
    private readonly dispatcher: RouteDispatcher,
  ) {
    super(reads, writes);
  }

  /** Also routes the new drive's slug to the backend that holds it. */
  override async create(
    input: DriveInput,
    signal?: AbortSignal,
  ): Promise<DocumentDriveDocument> {
    const drive = await super.create(input, signal);
    const owner = this.dispatcher.table.documentBackend(drive.header.id);
    if (drive.header.slug !== "" && owner !== "") {
      this.dispatcher.recordDocument(drive.header.slug, owner);
    }
    return drive;
  }
}
