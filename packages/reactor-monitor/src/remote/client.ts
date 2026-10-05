import type {
  CatchUpStatus,
  DeadLetterPage,
  IInspector,
  InspectorAttachmentInfo,
  InspectorDocumentModelInfo,
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  InspectorDrivePage,
  InspectorProcessorInfo,
  IReactorDbQuery,
  ISyncInspector,
  QueueStateSnapshot,
  RebuildResult,
  RemoteCursorInfo,
  RemoteSyncInspection,
  StorageHealth,
  SweepResult,
  SyncHold,
  ValidationResult,
  WireDeadLetterPage,
  WireInspectorAttachmentInfo,
  WireInspectorDocumentModel,
  WireInspectorDrive,
  WireInspectorDriveIntegrity,
  WireInspectorDrivePage,
  WireInspectorProcessor,
  WireQueueState,
  WireReactorInspectionInfo,
  WireRemoteCursor,
  WireRemoteMeta,
  WireRemoteSyncInspection,
  WireStorageHealth,
} from "@powerhousedao/reactor";
import { INSPECTION_OPERATIONS } from "./operations.js";
import {
  FORBIDDEN_CODE,
  GraphqlInspectionTransport,
  InspectionRequestError,
  type RemoteInspectionTransportOptions,
} from "./transport.js";

/**
 * What a remote reactor reports about itself over its inspection surface --
 * the server side of the capability contract.
 *
 * The shared wire type (`@powerhousedao/reactor`, `src/inspector/wire.ts`),
 * which reactor-api's subgraph serves and this client decodes, rather than a
 * second transcription of it at each end. The monitor derives the remote
 * reactor's `ReactorCapabilities` row from THIS rather than from the descriptor
 * that named a URL, for the same reason a worker's row is read off its built
 * config (multi-reactor stage 2 review): a descriptor can only state what was
 * asked for, and nothing in a URL says which channel types the far side routes
 * or whether it runs workflows.
 */
export type RemoteInspectionInfo = WireReactorInspectionInfo;

/** One remote's inspection plus its configuration, as the subgraph serves it. */
export type RemoteInspectionRemote = RemoteSyncInspection & {
  readonly meta: WireRemoteMeta;
};

export type RemoteInspectorClientOptions = RemoteInspectionTransportOptions & {
  /**
   * The reported facts, when the caller already fetched them (provisioning
   * does, to derive the capability row). Omitted, the first admin-gated call
   * fetches them. Seeded this way they are still subject to
   * {@link RemoteInspectorClientOptions.infoTtlMs}.
   */
  info?: RemoteInspectionInfo;
  /**
   * How long a fetched {@link RemoteInspectionInfo} is reused before the next
   * read of it goes back to the server. Defaults to
   * {@link DEFAULT_INFO_TTL_MS}.
   */
  infoTtlMs?: number;
  /**
   * How long a fetched `StorageHealth` is reused. Defaults to
   * {@link DEFAULT_STORAGE_HEALTH_TTL_MS}.
   */
  storageHealthTtlMs?: number;
};

/**
 * How long the reported facts are reused before a re-read.
 *
 * Not "forever", which is what the first cut of W3.2 did, and not "every
 * call". The two tier flags in that record are the ONE part of it an operator
 * changes without this handle changing -- restart the host with
 * `PH_INSPECTION_ADMIN=true` and the levers should go live -- and a handle that
 * cached them at provision time dead-ends that flow in both directions: the
 * levers stay disabled after the flag goes on, and stay enabled (refused at the
 * wire) after it goes off. Thirty seconds is short enough that an operator who
 * restarted a Switchboard sees the change on the next poll of a tab, and long
 * enough that the per-lever pre-check does not become a second round trip per
 * click.
 */
export const DEFAULT_INFO_TTL_MS = 30_000;

/**
 * How long a storage-health read is reused.
 *
 * The Sync tab polls every 2s and this dimension is near-constant: it changes
 * only when a PGlite session is poisoned or recreated, which is an event, not a
 * gradient. A short cache drops most of that round trip while keeping the
 * worst-case staleness well inside the time an operator takes to read the
 * panel.
 */
export const DEFAULT_STORAGE_HEALTH_TTL_MS = 5_000;

function toCursor(wire: WireRemoteCursor): RemoteCursorInfo {
  return {
    cursorType: wire.cursorType,
    // Ordinals are served as `Float` because they are bigint-origin; coerced
    // here so a server that spelled one as a string cannot put a string into a
    // field every consumer compares numerically.
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

/** Drops the configuration half, leaving exactly `ISyncInspector`'s shape. */
function withoutMeta(remote: RemoteInspectionRemote): RemoteSyncInspection {
  const { meta: _meta, ...inspection } = remote;
  return inspection;
}

/**
 * The reactor's inspection surfaces -- `IInspector` (W0.3), `ISyncInspector`
 * (W0.5) and the raw-SQL capability -- served by a REMOTE reactor over
 * reactor-api's inspection subgraph (multi-reactor W3.2).
 *
 * The point of implementing the same interfaces the worker proxy and the
 * in-process inspector do is that every monitor tab works against a remote
 * reactor unchanged: there is no remote-specific inspection view, only a third
 * transport under the same contracts.
 *
 * ADMIN TIERS. The server serves its mutating ops only under an explicit
 * opt-in, and raw SQL under a second one (reactor-api's
 * `IReactorInspectionSource`). This client knows which tiers are on from the
 * reported {@link RemoteInspectionInfo} and refuses a lever the far side would
 * refuse anyway, locally and by name, so an operator reads WHY instead of
 * watching a click fail. The monitor UI disables the same levers off the same
 * facts.
 *
 * Those tiers are NOT fixed for the handle's life, and the first cut of W3.2
 * was wrong to treat them so. The documented operator flow is a host restart
 * with `PH_INSPECTION_ADMIN=true`, which a cache-forever client dead-ends in
 * both directions: the levers stay disabled after the flag goes on, and stay
 * enabled after it goes off, refused at the wire with no explanation on
 * screen. So the record is cached on a TTL ({@link DEFAULT_INFO_TTL_MS}) and
 * re-read at the two moments it matters most:
 *
 * - before refusing a lever LOCALLY, so a stale "no" never stands in for a
 *   server that now says yes;
 * - after the server answers `FORBIDDEN`, so a stale "yes" is corrected and
 *   the UI's gate closes with the real reason.
 *
 * {@link refreshInfo} is the explicit form, for a UI affordance that re-checks
 * a host on demand.
 */
export class RemoteInspectorClient
  implements IInspector, ISyncInspector, IReactorDbQuery
{
  private readonly transport: GraphqlInspectionTransport;
  private readonly infoTtlMs: number;
  private readonly storageHealthTtlMs: number;
  private cachedInfo: RemoteInspectionInfo | undefined;
  private cachedInfoAtMs = 0;
  private inFlightInfo: Promise<RemoteInspectionInfo> | undefined;
  private cachedStorageHealth: StorageHealth | undefined;
  private cachedStorageHealthAtMs = 0;

  constructor(options: RemoteInspectorClientOptions) {
    this.transport = new GraphqlInspectionTransport(options);
    this.infoTtlMs = options.infoTtlMs ?? DEFAULT_INFO_TTL_MS;
    this.storageHealthTtlMs =
      options.storageHealthTtlMs ?? DEFAULT_STORAGE_HEALTH_TTL_MS;
    if (options.info) {
      this.cachedInfo = options.info;
      this.cachedInfoAtMs = Date.now();
    }
  }

  /** The endpoint this client inspects. */
  get endpoint(): string {
    return this.transport.endpoint;
  }

  /**
   * The last reported facts this client has, with no request and no TTL check
   * -- `undefined` only before anything has been read.
   *
   * The synchronous window onto the mutable state behind {@link info}, so a
   * handle can expose a LIVE `serverInfo` instead of a copy: every refresh,
   * including the ones the refusal paths below perform on their own, is visible
   * through this.
   */
  get reportedInfo(): RemoteInspectionInfo | undefined {
    return this.cachedInfo;
  }

  /**
   * The facts the remote reactor reports about itself, from cache while they
   * are younger than the TTL.
   *
   * Most of the record describes how the far side was BUILT and cannot change
   * without a different reactor on the other end; the two tier flags can, and
   * they are what every gated lever reads, so the whole record ages out
   * together rather than growing a second, smarter cache.
   */
  async info(): Promise<RemoteInspectionInfo> {
    const cached = this.cachedInfo;
    if (cached && Date.now() - this.cachedInfoAtMs < this.infoTtlMs) {
      return cached;
    }
    return this.refreshInfo();
  }

  /**
   * Re-reads the reported facts now, whatever the cache holds.
   *
   * The seam a "re-check server" affordance drives, and what the refusal paths
   * below use. Concurrent callers share the one in-flight request: a tab
   * switch that renders four gated panels must not become four `info` queries.
   */
  async refreshInfo(): Promise<RemoteInspectionInfo> {
    this.inFlightInfo ??= this.fetchInfo();
    try {
      return await this.inFlightInfo;
    } finally {
      this.inFlightInfo = undefined;
    }
  }

  // --- IInspector ---------------------------------------------------------

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

  async getQueueState(): Promise<QueueStateSnapshot> {
    const data = await this.query<{
      inspection: { queueState: WireQueueState };
    }>("queueState");
    const state = data.inspection.queueState;
    return {
      isPaused: state.isPaused,
      totalPending: state.totalPending,
      totalExecuting: state.totalExecuting,
      pendingJobs: state.pendingJobs,
      executingJobs: state.executingJobs,
    };
  }

  async pauseQueue(): Promise<void> {
    await this.mutate("pauseQueue", "pause the queue");
  }

  async resumeQueue(): Promise<void> {
    await this.mutate("resumeQueue", "resume the queue");
  }

  async getProcessors(): Promise<InspectorProcessorInfo[]> {
    const data = await this.query<{
      inspection: { processors: WireInspectorProcessor[] };
    }>("processors");
    return data.inspection.processors.map(toProcessor);
  }

  async retryProcessor(processorId: string): Promise<void> {
    await this.mutate("retryProcessor", "retry a processor", { processorId });
  }

  async getCatchUpStatus(): Promise<CatchUpStatus> {
    const data = await this.query<{
      inspection: { catchUpStatus: CatchUpStatus };
    }>("catchUpStatus");
    return data.inspection.catchUpStatus;
  }

  async sweepCatchUp(): Promise<SweepResult[]> {
    const data = await this.mutate<{ inspectionSweepCatchUp: SweepResult[] }>(
      "sweepCatchUp",
      "sweep catch-up",
    );
    return data.inspectionSweepCatchUp;
  }

  async validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult> {
    const data = await this.mutate<{
      inspectionValidateDocument: ValidationResult;
    }>("validateDocument", "validate a document", {
      documentId,
      branch: branch ?? null,
    });
    return data.inspectionValidateDocument;
  }

  async rebuildKeyframes(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const data = await this.mutate<{
      inspectionRebuildKeyframes: RebuildResult;
    }>("rebuildKeyframes", "rebuild keyframes", {
      documentId,
      branch: branch ?? null,
    });
    return data.inspectionRebuildKeyframes;
  }

  async rebuildSnapshots(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const data = await this.mutate<{
      inspectionRebuildSnapshots: RebuildResult;
    }>("rebuildSnapshots", "rebuild snapshots", {
      documentId,
      branch: branch ?? null,
    });
    return data.inspectionRebuildSnapshots;
  }

  /**
   * The far side's storage health, from a short cache.
   *
   * Cached because the Sync tab polls every 2s and this dimension changes only
   * on an EVENT (a session poisoned, a session recreated), so the extra round
   * trip buys nothing most of the time; see
   * {@link DEFAULT_STORAGE_HEALTH_TTL_MS} for the window.
   */
  async getStorageHealth(): Promise<StorageHealth> {
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
    const health = data.inspection.storageHealth;
    const decoded: StorageHealth = {
      healthy: health.healthy,
      everRecreated: health.everRecreated,
      recreateCount: health.recreateCount,
      ...(health.lastRecreated ? { lastRecreated: health.lastRecreated } : {}),
    };
    this.cachedStorageHealth = decoded;
    this.cachedStorageHealthAtMs = Date.now();
    return decoded;
  }

  // --- ISyncInspector ----------------------------------------------------

  async inspectRemote(remoteName: string): Promise<RemoteSyncInspection> {
    return withoutMeta(await this.inspectRemoteWithMeta(remoteName));
  }

  async inspectRemotes(): Promise<RemoteSyncInspection[]> {
    return (await this.inspectRemotesWithMeta()).map(withoutMeta);
  }

  /**
   * The remotes with their configuration attached, which is what a remote sync
   * manager needs to present a remote LIST as well as an inspection view. One
   * request feeds both.
   */
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
  ): Promise<DeadLetterPage> {
    const data = await this.query<{
      inspection: { deadLetters: WireDeadLetterPage };
    }>("deadLetters", {
      remoteName,
      cursor: cursor ?? null,
      limit: limit ?? null,
    });
    const page = data.inspection.deadLetters;
    return {
      remoteName: page.remoteName,
      results: page.results,
      ...(page.nextCursor === null ? {} : { nextCursor: page.nextCursor }),
    };
  }

  async rewindInboxCursor(
    remoteName: string,
    toOrdinal: number,
  ): Promise<void> {
    await this.mutate("rewindInboxCursor", "rewind an inbox cursor", {
      remoteName,
      toOrdinal,
    });
  }

  async resetChannel(remoteName: string): Promise<void> {
    await this.mutate("resetChannel", "reset a channel", { remoteName });
  }

  async requeueDeadLetter(remoteName: string, id: string): Promise<void> {
    await this.mutate("requeueDeadLetter", "requeue a dead letter", {
      remoteName,
      id,
    });
  }

  async clearDeadLetter(remoteName: string, id: string): Promise<void> {
    await this.mutate("clearDeadLetter", "clear a dead letter", {
      remoteName,
      id,
    });
  }

  // --- beyond the two inspection interfaces ------------------------------

  /** Sync holds, by remote and/or document. A read, like the rest of them. */
  async listHolds(filter?: {
    remoteName?: string;
    documentId?: string;
  }): Promise<SyncHold[]> {
    const data = await this.query<{ inspection: { holds: SyncHold[] } }>(
      "holds",
      {
        remoteName: filter?.remoteName ?? null,
        documentId: filter?.documentId ?? null,
      },
    );
    return data.inspection.holds;
  }

  /** Nudges one remote's channel to poll now. An operator lever, so admin-gated. */
  async triggerPull(remoteName: string): Promise<void> {
    await this.mutate("triggerPull", "trigger a pull", { remoteName });
  }

  /**
   * Raw SQL against the remote reactor's store.
   *
   * Its own tier on the server, and its own refusal here: a deployment that
   * turned on the operator levers has not thereby agreed to expose its
   * database, so this is never implied by `adminEnabled`.
   */
  async queryDb(sql: string, params?: unknown[]): Promise<unknown[]> {
    let info = await this.info();
    if (!info.sqlEnabled) {
      info = await this.refreshInfo();
    }
    if (!info.sqlEnabled) {
      throw new Error(
        `The remote reactor at ${this.endpoint} does not serve raw SQL against its store: it is served only with PH_INSPECTION_SQL=true (on top of PH_INSPECTION_ADMIN=true) on that host`,
      );
    }
    try {
      const data = await this.transport.request<{
        inspectionQueryDb: unknown[];
      }>("queryDb", INSPECTION_OPERATIONS.queryDb, {
        sql,
        params: params ?? null,
      });
      return data.inspectionQueryDb;
    } catch (error) {
      await this.refreshOnForbidden(error);
      throw error;
    }
  }

  // --- internals ---------------------------------------------------------

  private async fetchInfo(): Promise<RemoteInspectionInfo> {
    const data = await this.transport.request<{
      inspection: { info: RemoteInspectionInfo };
    }>("info", INSPECTION_OPERATIONS.info);
    const info: RemoteInspectionInfo = Object.freeze({
      ...data.inspection.info,
      syncChannels: Object.freeze([...data.inspection.info.syncChannels]),
    });
    this.cachedInfo = info;
    this.cachedInfoAtMs = Date.now();
    return info;
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

  /**
   * One admin-gated op: the local pre-check, the request, and the two places a
   * stale picture of the far side's tiers has to be corrected rather than
   * believed.
   */
  private async mutate<T = unknown>(
    operation: keyof typeof INSPECTION_OPERATIONS,
    what: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    let info = await this.info();
    if (!info.adminEnabled) {
      // A cached "no" is the one answer worth a round trip before refusing: a
      // host restarted WITH the flag is the whole point of the flag, and an
      // operator who just did that must not be told it is still off.
      info = await this.refreshInfo();
    }
    if (!info.adminEnabled) {
      throw new Error(
        `The remote reactor at ${this.endpoint} does not serve admin inspection ops, so it cannot ${what}: set PH_INSPECTION_ADMIN=true on that host to enable them`,
      );
    }
    try {
      return await this.transport.request<T>(
        operation,
        INSPECTION_OPERATIONS[operation],
        variables,
      );
    } catch (error) {
      await this.refreshOnForbidden(error);
      throw error;
    }
  }

  /**
   * Re-reads the reported facts when the far side refused.
   *
   * A `FORBIDDEN` after a local pre-check said yes means this client's picture
   * of that host is stale -- it was restarted without the flag -- so the
   * cached record is replaced before the error surfaces, and the UI's gate
   * closes with the real reason instead of offering the lever again. A failure
   * to re-read is swallowed: the caller's error is the one worth reporting.
   */
  private async refreshOnForbidden(error: unknown): Promise<void> {
    if (
      !(error instanceof InspectionRequestError) ||
      error.code !== FORBIDDEN_CODE
    ) {
      return;
    }
    try {
      await this.refreshInfo();
    } catch (refreshError) {
      console.error(
        `[reactor-monitor] could not re-read the reported facts of ${this.endpoint} after a refusal:`,
        refreshError,
      );
    }
  }
}

/** Convenience constructor matching the descriptor's remote config. */
export function createRemoteInspectorClient(
  options: RemoteInspectorClientOptions,
): RemoteInspectorClient {
  return new RemoteInspectorClient(options);
}
