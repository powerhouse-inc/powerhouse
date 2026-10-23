import type {
  CatchUpStatus,
  InspectorAttachmentInfo,
  InspectorDocumentModelInfo,
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  InspectorDrivePage,
  InspectorProcessorInfo,
  InspectorStorageHealth,
  RemoteCursorInfo,
  RemoteSyncInspection,
  ValidationResult,
  WireDeadLetterPage,
  WireInspectorAttachmentInfo,
  WireInspectorDocumentModel,
  WireInspectorDrive,
  WireInspectorDriveIntegrity,
  WireInspectorDrivePage,
  WireInspectorProcessor,
  WireQueueState,
  WireReactorInfo,
  WireRemoteCursor,
  WireRemoteMeta,
  WireRemoteSyncInspection,
  WireStorageHealth,
  WireValidationResult,
} from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  MonitorReactorInfo,
  MonitorSyncInspector,
} from "../types.js";
import { INSPECTION_OPERATIONS } from "./operations.js";
import {
  GraphqlInspectionTransport,
  type RemoteInspectionTransportOptions,
} from "./transport.js";

/** One remote's inspection plus its configuration, as the subgraph serves it. */
export type RemoteInspectionRemote = RemoteSyncInspection & {
  readonly meta: WireRemoteMeta;
};

export type RemoteInspectorClientOptions = RemoteInspectionTransportOptions & {
  /** Defaults to {@link DEFAULT_STORAGE_HEALTH_TTL_MS}. */
  storageHealthTtlMs?: number;
};

/** The Sync tab polls every 2s; storage health changes only on an event. */
export const DEFAULT_STORAGE_HEALTH_TTL_MS = 5_000;

function toInfo(wire: WireReactorInfo): MonitorReactorInfo {
  return {
    storage: {
      engine: wire.storage.engine as MonitorReactorInfo["storage"]["engine"],
      persistence: wire.storage
        .persistence as MonitorReactorInfo["storage"]["persistence"],
      durable: wire.storage.durable,
      selfHeal: wire.storage.selfHeal,
    },
    workflows: wire.workflows,
    syncChannels: [...wire.syncChannels],
    access: wire.access
      ? { admin: wire.access.admin, sql: wire.access.sql }
      : null,
  };
}

function toCursor(wire: WireRemoteCursor): RemoteCursorInfo {
  // Ordinals are `Float` on the wire; coerced in case a server sends strings.
  return {
    cursorType: wire.cursorType,
    cursorOrdinal: Number(wire.cursorOrdinal),
    liveAckOrdinal: Number(wire.liveAckOrdinal),
    liveLatestOrdinal: Number(wire.liveLatestOrdinal),
    ...(wire.lastSyncedAtUtcMs === null
      ? {}
      : { lastSyncedAtUtcMs: wire.lastSyncedAtUtcMs }),
  };
}

function toDocumentModel(
  wire: WireInspectorDocumentModel,
): InspectorDocumentModelInfo {
  return {
    documentType: wire.documentType,
    name: wire.name,
    version: wire.version,
    supportedVersions: [...wire.supportedVersions],
  };
}

function toDrive(wire: WireInspectorDrive): InspectorDriveInfo {
  return {
    driveId: wire.driveId,
    name: wire.name,
    branch: wire.branch,
    collectionId: wire.collectionId,
    documentType: wire.documentType,
    nodeCount: wire.nodeCount,
    fileCount: wire.fileCount,
    folderCount: wire.folderCount,
    otherNodeCount: wire.otherNodeCount,
    unreadableNodeCount: wire.unreadableNodeCount,
    icon: wire.icon ?? undefined,
  };
}

function toDrivePage(wire: WireInspectorDrivePage): InspectorDrivePage {
  return {
    results: wire.results.map(toDrive),
    nextCursor: wire.nextCursor ?? undefined,
  };
}

function toDriveIntegrity(
  wire: WireInspectorDriveIntegrity,
): InspectorDriveIntegrity {
  return {
    driveId: wire.driveId,
    checkedNodeCount: wire.checkedNodeCount,
    totalFileNodeCount: wire.totalFileNodeCount,
    missingDocuments: wire.missingDocuments.map((ref) => ({
      id: ref.id,
      documentType: ref.documentType,
    })),
    unsupportedTypes: wire.unsupportedTypes.map((ref) => ({
      id: ref.id,
      documentType: ref.documentType,
    })),
  };
}

function toAttachmentInfo(
  wire: WireInspectorAttachmentInfo,
): InspectorAttachmentInfo {
  return {
    present: wire.present,
    storeKind: wire.storeKind,
    hasReplicator: wire.hasReplicator,
    replicatorRunning: wire.replicatorRunning,
    backlogScanned: wire.backlogScanned,
    refsSeen: wire.refsSeen,
    held: wire.held,
    bytesHeld: wire.bytesHeld,
    queued: wire.queued,
    fetching: wire.fetching,
    pendingFetches: wire.pendingFetches,
    waiting: wire.waiting,
    notFound: wire.notFound,
    failed: wire.failed,
    lastError: wire.lastError ?? undefined,
  };
}

function toProcessor(wire: WireInspectorProcessor): InspectorProcessorInfo {
  return {
    processorId: wire.processorId,
    factoryId: wire.factoryId,
    driveId: wire.driveId,
    processorIndex: wire.processorIndex,
    lastOrdinal: Number(wire.lastOrdinal),
    status: wire.status as InspectorProcessorInfo["status"],
    lastError: wire.lastError ?? undefined,
    lastErrorTimestamp:
      wire.lastErrorTimestampUtcMs === null
        ? undefined
        : new Date(wire.lastErrorTimestampUtcMs),
    floor: Number(wire.floor),
    clearable: wire.clearable,
  };
}

// Issues ride a JSON scalar, so their shape is the server's word.
function toValidation(wire: WireValidationResult): ValidationResult {
  return {
    documentId: wire.documentId,
    isConsistent: wire.isConsistent,
    keyframeIssues:
      wire.keyframeIssues as unknown as ValidationResult["keyframeIssues"],
    snapshotIssues:
      wire.snapshotIssues as unknown as ValidationResult["snapshotIssues"],
    streamOrderIssues:
      wire.streamOrderIssues as unknown as ValidationResult["streamOrderIssues"],
  };
}

function toStorageHealth(wire: WireStorageHealth): InspectorStorageHealth {
  return {
    tracked: wire.tracked,
    healthy: wire.healthy,
    everRecreated: wire.everRecreated,
    recreateCount: wire.recreateCount,
  };
}

function toRemoteInspection(
  wire: WireRemoteSyncInspection,
): RemoteInspectionRemote {
  return {
    remoteName: wire.remoteName,
    remoteId: wire.remoteId,
    inboxCursor: toCursor(wire.inboxCursor),
    outboxCursor: toCursor(wire.outboxCursor),
    mailboxDepths: wire.mailboxDepths,
    connection: {
      snapshot: wire.connection.snapshot,
      neverSucceeded: wire.connection.neverSucceeded,
      ...(wire.connection.stalenessMs === null
        ? {}
        : { stalenessMs: wire.connection.stalenessMs }),
    },
    meta: wire.meta,
  };
}

function withoutMeta(remote: RemoteInspectionRemote): RemoteSyncInspection {
  const { meta: _meta, ...inspection } = remote;
  return inspection;
}

/** A remote reactor's reads over reactor-api's read-only inspection subgraph. */
export class RemoteInspectorClient
  implements MonitorInspector, MonitorSyncInspector
{
  private readonly transport: GraphqlInspectionTransport;
  private readonly storageHealthTtlMs: number;
  private latestInfo: MonitorReactorInfo | undefined;
  private cachedStorageHealth: InspectorStorageHealth | undefined;
  private cachedStorageHealthAtMs = 0;

  constructor(options: RemoteInspectorClientOptions) {
    this.transport = new GraphqlInspectionTransport(options);
    this.storageHealthTtlMs =
      options.storageHealthTtlMs ?? DEFAULT_STORAGE_HEALTH_TTL_MS;
  }

  get endpoint(): string {
    return this.transport.endpoint;
  }

  /** The last `info` this client read, without a request. */
  get reportedInfo(): MonitorReactorInfo | undefined {
    return this.latestInfo;
  }

  async info(): Promise<MonitorReactorInfo> {
    const data = await this.query<{ inspection: { info: WireReactorInfo } }>(
      "info",
    );
    const info = toInfo(data.inspection.info);
    this.latestInfo = info;
    return info;
  }

  async listDocumentModels(): Promise<InspectorDocumentModelInfo[]> {
    const data = await this.query<{
      inspection: { documentModels: WireInspectorDocumentModel[] };
    }>("documentModels");
    return data.inspection.documentModels.map(toDocumentModel);
  }

  async listDrives(
    cursor?: string,
    limit?: number,
  ): Promise<InspectorDrivePage> {
    const data = await this.query<{
      inspection: { drives: WireInspectorDrivePage };
    }>("drives", { cursor: cursor ?? null, limit: limit ?? null });
    return toDrivePage(data.inspection.drives);
  }

  async checkDriveIntegrity(
    driveId: string,
    branch: string,
  ): Promise<InspectorDriveIntegrity> {
    const data = await this.query<{
      inspection: { driveIntegrity: WireInspectorDriveIntegrity };
    }>("driveIntegrity", { driveId, branch });
    return toDriveIntegrity(data.inspection.driveIntegrity);
  }

  async getAttachmentInfo(): Promise<InspectorAttachmentInfo> {
    const data = await this.query<{
      inspection: { attachmentInfo: WireInspectorAttachmentInfo };
    }>("attachmentInfo");
    return toAttachmentInfo(data.inspection.attachmentInfo);
  }

  async getQueueState(): Promise<WireQueueState> {
    const data = await this.query<{
      inspection: { queueState: WireQueueState };
    }>("queueState");
    return data.inspection.queueState;
  }

  async getProcessors(): Promise<InspectorProcessorInfo[]> {
    const data = await this.query<{
      inspection: { processors: WireInspectorProcessor[] };
    }>("processors");
    return data.inspection.processors.map(toProcessor);
  }

  async getCatchUpStatus(): Promise<CatchUpStatus> {
    const data = await this.query<{
      inspection: { catchUpStatus: CatchUpStatus };
    }>("catchUpStatus");
    return data.inspection.catchUpStatus;
  }

  async getStorageHealth(): Promise<InspectorStorageHealth> {
    const cached = this.cachedStorageHealth;
    if (
      cached &&
      Date.now() - this.cachedStorageHealthAtMs < this.storageHealthTtlMs
    ) {
      return cached;
    }
    const data = await this.query<{
      inspection: { storageHealth: WireStorageHealth };
    }>("storageHealth");
    const health = toStorageHealth(data.inspection.storageHealth);
    this.cachedStorageHealth = health;
    this.cachedStorageHealthAtMs = Date.now();
    return health;
  }

  async validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult> {
    const data = await this.query<{
      inspection: { validateDocument: WireValidationResult };
    }>("validateDocument", { documentId, branch: branch ?? null });
    return toValidation(data.inspection.validateDocument);
  }

  async inspectRemote(remoteName: string): Promise<RemoteSyncInspection> {
    return withoutMeta(await this.inspectRemoteWithMeta(remoteName));
  }

  async inspectRemotes(): Promise<RemoteSyncInspection[]> {
    return (await this.inspectRemotesWithMeta()).map(withoutMeta);
  }

  /** The remotes with their configuration, for a sync manager's `list()`. */
  async inspectRemotesWithMeta(): Promise<RemoteInspectionRemote[]> {
    const data = await this.query<{
      inspection: { remotes: WireRemoteSyncInspection[] };
    }>("remotes");
    return data.inspection.remotes.map(toRemoteInspection);
  }

  async inspectRemoteWithMeta(
    remoteName: string,
  ): Promise<RemoteInspectionRemote> {
    const data = await this.query<{
      inspection: { remote: WireRemoteSyncInspection };
    }>("remote", { remoteName });
    return toRemoteInspection(data.inspection.remote);
  }

  async listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<WireDeadLetterPage> {
    const data = await this.query<{
      inspection: { deadLetters: WireDeadLetterPage };
    }>("deadLetters", {
      remoteName,
      cursor: cursor ?? null,
      limit: limit ?? null,
    });
    return data.inspection.deadLetters;
  }

  private query<T>(
    operation: keyof typeof INSPECTION_OPERATIONS,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    return this.transport.request<T>(
      operation,
      INSPECTION_OPERATIONS[operation],
      variables,
    );
  }
}

export function createRemoteInspectorClient(
  options: RemoteInspectorClientOptions,
): RemoteInspectorClient {
  return new RemoteInspectorClient(options);
}
