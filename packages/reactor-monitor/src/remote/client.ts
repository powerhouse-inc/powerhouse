import type {
  CatchUpStatus,
  ConnectionStateSnapshot,
  DeadLetterPage,
  DeadLetterRecord,
  IInspector,
  InspectorProcessorInfo,
  IReactorDbQuery,
  ISyncInspector,
  Job,
  QueueStateSnapshot,
  RebuildResult,
  RemoteCursorInfo,
  RemoteMeta,
  RemoteSyncInspection,
  StorageHealth,
  SweepResult,
  SyncHold,
  ValidationResult,
} from "@powerhousedao/reactor";
import { INSPECTION_OPERATIONS } from "./operations.js";
import {
  GraphqlInspectionTransport,
  type RemoteInspectionTransportOptions,
} from "./transport.js";

/**
 * What a remote reactor reports about itself over its inspection surface --
 * the server side of the capability contract.
 *
 * Mirrors reactor-api's `ReactorInspectionInfo`. The monitor derives the
 * remote reactor's `ReactorCapabilities` row from THIS rather than from the
 * descriptor that named a URL, for the same reason a worker's row is read off
 * its built config (multi-reactor stage 2 review): a descriptor can only state
 * what was asked for, and nothing in a URL says which channel types the far
 * side routes or whether it runs workflows.
 */
export type RemoteInspectionInfo = {
  readonly hosting: string;
  readonly inspection: string;
  /** The server's own store class ("postgres" | "pglite"), informational. */
  readonly storageKind: string;
  readonly processors: boolean;
  readonly workflows: boolean;
  readonly syncChannels: readonly string[];
  /** Whether the server serves the mutating inspection ops at all. */
  readonly adminEnabled: boolean;
  /** Whether the server serves raw SQL against the reactor store. */
  readonly sqlEnabled: boolean;
};

/**
 * `RemoteMeta` as JSON delivers it.
 *
 * Every field is optional and `collectionId` is a plain object, because that
 * is what actually arrives: the subgraph serves a remote's configuration
 * through a JSON scalar, so `DriveCollectionId` loses its prototype and a
 * remote that vanished between the inspection and the server's own lookup
 * comes back as identity alone. Typing it as `RemoteMeta` would make the
 * rehydration's defensive defaults look like dead code while remaining the
 * only thing standing between the wire and a `TypeError` in a UI.
 */
export type WireRemoteMeta = {
  readonly id: string;
  readonly name?: string;
  readonly collectionId?: {
    readonly driveId?: string;
    readonly branch?: string;
  };
  readonly channelConfig?: RemoteMeta["channelConfig"];
  readonly filter?: RemoteMeta["filter"];
  readonly options?: RemoteMeta["options"];
  readonly peer?: RemoteMeta["peer"];
};

/** One remote's inspection plus its configuration, as the subgraph serves it. */
export type RemoteInspectionRemote = RemoteSyncInspection & {
  readonly meta: WireRemoteMeta;
};

export type RemoteInspectorClientOptions = RemoteInspectionTransportOptions & {
  /**
   * The reported facts, when the caller already fetched them (provisioning
   * does, to derive the capability row). Omitted, the first admin-gated call
   * fetches them.
   */
  info?: RemoteInspectionInfo;
};

/** Wire shape of a processor row: a Date cannot cross JSON. */
type WireProcessor = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  lastOrdinal: number;
  status: string;
  lastError: string | null;
  lastErrorTimestampUtcMs: number | null;
};

type WireRemote = Omit<RemoteSyncInspection, "connection"> & {
  meta: WireRemoteMeta;
  connection: {
    snapshot: ConnectionStateSnapshot;
    neverSucceeded: boolean;
    stalenessMs: number | null;
  };
  inboxCursor: WireCursor;
  outboxCursor: WireCursor;
};

type WireCursor = Omit<RemoteCursorInfo, "lastSyncedAtUtcMs"> & {
  lastSyncedAtUtcMs: number | null;
};

function toCursor(wire: WireCursor): RemoteCursorInfo {
  return {
    cursorType: wire.cursorType,
    cursorOrdinal: wire.cursorOrdinal,
    liveAckOrdinal: wire.liveAckOrdinal,
    liveLatestOrdinal: wire.liveLatestOrdinal,
    ...(wire.lastSyncedAtUtcMs === null
      ? {}
      : { lastSyncedAtUtcMs: wire.lastSyncedAtUtcMs }),
  };
}

function toProcessor(wire: WireProcessor): InspectorProcessorInfo {
  return {
    processorId: wire.processorId,
    factoryId: wire.factoryId,
    driveId: wire.driveId,
    processorIndex: wire.processorIndex,
    lastOrdinal: wire.lastOrdinal,
    status: wire.status as InspectorProcessorInfo["status"],
    lastError: wire.lastError ?? undefined,
    lastErrorTimestamp:
      wire.lastErrorTimestampUtcMs === null
        ? undefined
        : new Date(wire.lastErrorTimestampUtcMs),
  };
}

function toRemoteInspection(wire: WireRemote): RemoteInspectionRemote {
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
 * refuse anyway, locally and by name -- the tiers are fixed for a deployment's
 * life, so a round trip could only produce the same answer more slowly and
 * less legibly. The monitor UI disables the same levers off the same facts.
 */
export class RemoteInspectorClient
  implements IInspector, ISyncInspector, IReactorDbQuery
{
  private readonly transport: GraphqlInspectionTransport;
  private cachedInfo: RemoteInspectionInfo | undefined;
  private inFlightInfo: Promise<RemoteInspectionInfo> | undefined;

  constructor(options: RemoteInspectorClientOptions) {
    this.transport = new GraphqlInspectionTransport(options);
    this.cachedInfo = options.info;
  }

  /** The endpoint this client inspects. */
  get endpoint(): string {
    return this.transport.endpoint;
  }

  /**
   * The facts the remote reactor reports about itself, fetched once and
   * cached: they describe how the far side was BUILT and which tiers that
   * deployment serves, neither of which changes under a holder.
   */
  async info(): Promise<RemoteInspectionInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }
    this.inFlightInfo ??= this.fetchInfo();
    try {
      return await this.inFlightInfo;
    } finally {
      this.inFlightInfo = undefined;
    }
  }

  // --- IInspector ---------------------------------------------------------

  async getQueueState(): Promise<QueueStateSnapshot> {
    const data = await this.query<{
      inspection: {
        queueState: Omit<
          QueueStateSnapshot,
          "pendingJobs" | "executingJobs"
        > & {
          pendingJobs: Job[];
          executingJobs: Job[];
        };
      };
    }>("queueState");
    return data.inspection.queueState;
  }

  async pauseQueue(): Promise<void> {
    await this.mutate("pauseQueue", "pause the queue");
  }

  async resumeQueue(): Promise<void> {
    await this.mutate("resumeQueue", "resume the queue");
  }

  async getProcessors(): Promise<InspectorProcessorInfo[]> {
    const data = await this.query<{
      inspection: { processors: WireProcessor[] };
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

  async getStorageHealth(): Promise<StorageHealth> {
    const data = await this.query<{
      inspection: {
        storageHealth: Omit<StorageHealth, "lastRecreated"> & {
          lastRecreated: StorageHealth["lastRecreated"] | null;
        };
      };
    }>("storageHealth");
    const health = data.inspection.storageHealth;
    return {
      healthy: health.healthy,
      everRecreated: health.everRecreated,
      recreateCount: health.recreateCount,
      ...(health.lastRecreated ? { lastRecreated: health.lastRecreated } : {}),
    };
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
    const data = await this.query<{ inspection: { remotes: WireRemote[] } }>(
      "remotes",
    );
    return data.inspection.remotes.map(toRemoteInspection);
  }

  async inspectRemoteWithMeta(
    remoteName: string,
  ): Promise<RemoteInspectionRemote> {
    const data = await this.query<{ inspection: { remote: WireRemote } }>(
      "remote",
      { remoteName },
    );
    return toRemoteInspection(data.inspection.remote);
  }

  async listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<DeadLetterPage> {
    const data = await this.query<{
      inspection: {
        deadLetters: {
          remoteName: string;
          results: DeadLetterRecord[];
          nextCursor: string | null;
        };
      };
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
    const info = await this.info();
    if (!info.sqlEnabled) {
      throw new Error(
        `The remote reactor at ${this.endpoint} does not serve raw SQL against its store: it is served only with PH_INSPECTION_SQL=true (on top of PH_INSPECTION_ADMIN=true) on that host`,
      );
    }
    const data = await this.transport.request<{
      inspectionQueryDb: unknown[];
    }>("queryDb", INSPECTION_OPERATIONS.queryDb, {
      sql,
      params: params ?? null,
    });
    return data.inspectionQueryDb;
  }

  // --- internals ---------------------------------------------------------

  private async fetchInfo(): Promise<RemoteInspectionInfo> {
    const data = await this.transport.request<{
      inspection: { info: RemoteInspectionInfo };
    }>("info", INSPECTION_OPERATIONS.info);
    this.cachedInfo = Object.freeze({
      ...data.inspection.info,
      syncChannels: Object.freeze([...data.inspection.info.syncChannels]),
    });
    return this.cachedInfo;
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

  private async mutate<T = unknown>(
    operation: keyof typeof INSPECTION_OPERATIONS,
    what: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const info = await this.info();
    if (!info.adminEnabled) {
      throw new Error(
        `The remote reactor at ${this.endpoint} does not serve admin inspection ops, so it cannot ${what}: set PH_INSPECTION_ADMIN=true on that host to enable them`,
      );
    }
    return this.transport.request<T>(
      operation,
      INSPECTION_OPERATIONS[operation],
      variables,
    );
  }
}

/** Convenience constructor matching the descriptor's remote config. */
export function createRemoteInspectorClient(
  options: RemoteInspectorClientOptions,
): RemoteInspectorClient {
  return new RemoteInspectorClient(options);
}
