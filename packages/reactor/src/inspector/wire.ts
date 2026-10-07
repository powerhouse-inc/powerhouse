import type { Job } from "../queue/types.js";
import type { DeadLetterRecord } from "../storage/interfaces.js";
import type {
  ConnectionStateSnapshot,
  RemoteFilter,
  RemoteOptions,
  RemotePeer,
} from "../sync/types.js";
import type { QueueStateSnapshot } from "./types.js";
import {
  INSPECTOR_OPS,
  readOpFields,
  SYNC_INSPECTION_OPS,
  type InspectorOpSpec,
} from "./ops.js";

// JSON forms shared by server and clients: dates as epoch ms, absent as null.

export type WireChannelConfig = {
  readonly type?: string;
  readonly parameters?: Record<string, unknown>;
};

/** `RemoteMeta` as JSON delivers it; a vanished remote is identity only. */
export type WireRemoteMeta = {
  readonly id: string;
  readonly name?: string;
  readonly collectionId?: {
    readonly driveId?: string;
    readonly branch?: string;
  };
  readonly channelConfig?: WireChannelConfig;
  readonly filter?: RemoteFilter;
  readonly options?: RemoteOptions;
  readonly peer?: RemotePeer;
};

export type WireReactorStorageFacts = {
  readonly engine: string;
  readonly persistence: string;
  readonly durable: boolean;
  readonly selfHeal: boolean;
};

export type WireInspectorAccess = {
  readonly admin: boolean;
  readonly sql: boolean;
};

/** `access` is null for a caller who is not an operator of the host. */
export type WireReactorInfo = {
  readonly storage: WireReactorStorageFacts;
  readonly workflows: boolean;
  readonly syncChannels: readonly string[];
  readonly access: WireInspectorAccess | null;
};

/** A queued job without its actions or operations. */
export type WireQueueJob = {
  readonly id: string;
  readonly kind: string;
  readonly documentId: string;
  readonly scope: string;
  readonly branch: string;
  readonly status: "pending" | "executing";
  readonly actionCount: number;
  readonly operationCount: number;
  readonly retryCount: number;
};

export type WireQueueState = {
  readonly isPaused: boolean;
  readonly totalPending: number;
  readonly totalExecuting: number;
  readonly pendingJobs: WireQueueJob[];
  readonly executingJobs: WireQueueJob[];
};

export type WireInspectorDocumentModel = {
  readonly documentType: string;
  readonly name: string;
  readonly version: number;
  readonly supportedVersions: number[];
};

export type WireInspectorDrive = {
  readonly driveId: string;
  readonly name: string;
  readonly branch: string;
  readonly collectionId: string;
  readonly documentType: string;
  readonly nodeCount: number;
  readonly fileCount: number;
  readonly folderCount: number;
  readonly otherNodeCount: number;
  readonly unreadableNodeCount: number;
  readonly icon: string | null;
};

export type WireInspectorDrivePage = {
  readonly results: WireInspectorDrive[];
  readonly nextCursor: string | null;
};

export type WireInspectorDriveIntegrityRef = {
  readonly id: string;
  readonly documentType: string;
};

export type WireInspectorDriveIntegrity = {
  readonly driveId: string;
  readonly checkedNodeCount: number;
  readonly totalFileNodeCount: number;
  readonly missingDocuments: WireInspectorDriveIntegrityRef[];
  readonly unsupportedTypes: WireInspectorDriveIntegrityRef[];
};

export type WireInspectorAttachmentInfo = {
  readonly present: boolean;
  readonly storeKind: string;
  readonly hasReplicator: boolean;
  readonly replicatorRunning: boolean;
  readonly backlogScanned: boolean;
  readonly refsSeen: number;
  readonly held: number;
  readonly bytesHeld: number;
  readonly queued: number;
  readonly fetching: number;
  readonly pendingFetches: number;
  readonly waiting: number;
  readonly notFound: number;
  readonly failed: number;
  readonly lastError: string | null;
};

export type WireInspectorProcessor = {
  readonly processorId: string;
  readonly factoryId: string;
  readonly driveId: string;
  readonly processorIndex: number;
  readonly lastOrdinal: number;
  readonly status: string;
  readonly lastError: string | null;
  readonly lastErrorTimestampUtcMs: number | null;
};

export type WireStorageHealth = {
  readonly tracked: boolean;
  readonly healthy: boolean;
  readonly everRecreated: boolean;
  readonly recreateCount: number;
};

/** Issues ride a JSON scalar; each carries the scope it was found in. */
export type WireValidationResult = {
  readonly documentId: string;
  readonly isConsistent: boolean;
  readonly keyframeIssues: Record<string, unknown>[];
  readonly snapshotIssues: Record<string, unknown>[];
  readonly streamOrderIssues: Record<string, unknown>[];
};

export type WireRemoteCursor = {
  readonly cursorType: "inbox" | "outbox";
  readonly cursorOrdinal: number;
  readonly lastSyncedAtUtcMs: number | null;
  readonly liveAckOrdinal: number;
  readonly liveLatestOrdinal: number;
};

export type WireMailboxDepths = {
  readonly inbox: number;
  readonly outbox: number;
  readonly deadLetter: number;
};

export type WireRemoteConnectionHealth = {
  readonly snapshot: ConnectionStateSnapshot;
  readonly neverSucceeded: boolean;
  readonly stalenessMs: number | null;
};

/** One remote's inspection plus its configuration. */
export type WireRemoteSyncInspection = {
  readonly remoteName: string;
  readonly remoteId: string;
  readonly inboxCursor: WireRemoteCursor;
  readonly outboxCursor: WireRemoteCursor;
  readonly mailboxDepths: WireMailboxDepths;
  readonly connection: WireRemoteConnectionHealth;
  readonly meta: WireRemoteMeta;
};

/** A dead letter without its operations. */
export type WireDeadLetter = {
  readonly id: string;
  readonly jobId: string;
  readonly documentId: string;
  readonly branch: string;
  readonly scopes: string[];
  readonly errorType: string;
  readonly errorMessage: string;
  readonly operationCount: number;
};

export type WireDeadLetterPage = {
  readonly remoteName: string;
  readonly results: WireDeadLetter[];
  readonly nextCursor: string | null;
};

function toWireQueueJob(
  job: Job,
  status: WireQueueJob["status"],
): WireQueueJob {
  return {
    id: job.id,
    kind: job.kind,
    documentId: job.documentId,
    scope: job.scope,
    branch: job.branch,
    status,
    actionCount: job.actions.length,
    operationCount: job.operations.length,
    retryCount: job.retryCount ?? 0,
  };
}

/** The queue as the inspection surface serves it: no document content. */
export function toWireQueueState(snapshot: QueueStateSnapshot): WireQueueState {
  return {
    isPaused: snapshot.isPaused,
    totalPending: snapshot.totalPending,
    totalExecuting: snapshot.totalExecuting,
    pendingJobs: snapshot.pendingJobs.map((job) =>
      toWireQueueJob(job, "pending"),
    ),
    executingJobs: snapshot.executingJobs.map((job) =>
      toWireQueueJob(job, "executing"),
    ),
  };
}

/** A dead letter as the inspection surface serves it: no document content. */
export function toWireDeadLetter(record: DeadLetterRecord): WireDeadLetter {
  return {
    id: record.id,
    jobId: record.jobId,
    documentId: record.documentId,
    branch: record.branch,
    scopes: [...record.scopes],
    errorType: record.errorType,
    errorMessage: record.errorMessage,
    operationCount: record.operations.length,
  };
}

type MissingKeys<T, A extends readonly PropertyKey[]> = Exclude<
  keyof T,
  A[number]
>;

/** Compile error unless `names` lists every key of `T` and nothing else. */
function fieldsOf<T>() {
  return <const A extends readonly (keyof T & string)[]>(
    names: A & (MissingKeys<T, A> extends never ? unknown : never),
  ): A => names;
}

/** Every wire record's fields, by the GraphQL type that serves it. */
export const INSPECTION_WIRE_FIELDS = {
  ReactorInfo: fieldsOf<WireReactorInfo>()([
    "storage",
    "workflows",
    "syncChannels",
    "access",
  ]),
  ReactorStorageFacts: fieldsOf<WireReactorStorageFacts>()([
    "engine",
    "persistence",
    "durable",
    "selfHeal",
  ]),
  InspectorAccess: fieldsOf<WireInspectorAccess>()(["admin", "sql"]),
  InspectionDocumentModel: fieldsOf<WireInspectorDocumentModel>()([
    "documentType",
    "name",
    "version",
    "supportedVersions",
  ]),
  InspectionDrive: fieldsOf<WireInspectorDrive>()([
    "driveId",
    "name",
    "branch",
    "collectionId",
    "documentType",
    "nodeCount",
    "fileCount",
    "folderCount",
    "otherNodeCount",
    "unreadableNodeCount",
    "icon",
  ]),
  InspectionDrivePage: fieldsOf<WireInspectorDrivePage>()([
    "results",
    "nextCursor",
  ]),
  InspectionDriveIntegrityRef: fieldsOf<WireInspectorDriveIntegrityRef>()([
    "id",
    "documentType",
  ]),
  InspectionDriveIntegrity: fieldsOf<WireInspectorDriveIntegrity>()([
    "driveId",
    "checkedNodeCount",
    "totalFileNodeCount",
    "missingDocuments",
    "unsupportedTypes",
  ]),
  InspectionAttachmentInfo: fieldsOf<WireInspectorAttachmentInfo>()([
    "present",
    "storeKind",
    "hasReplicator",
    "replicatorRunning",
    "backlogScanned",
    "refsSeen",
    "held",
    "bytesHeld",
    "queued",
    "fetching",
    "pendingFetches",
    "waiting",
    "notFound",
    "failed",
    "lastError",
  ]),
  InspectionQueueJob: fieldsOf<WireQueueJob>()([
    "id",
    "kind",
    "documentId",
    "scope",
    "branch",
    "status",
    "actionCount",
    "operationCount",
    "retryCount",
  ]),
  InspectionQueueState: fieldsOf<WireQueueState>()([
    "isPaused",
    "totalPending",
    "totalExecuting",
    "pendingJobs",
    "executingJobs",
  ]),
  InspectionProcessor: fieldsOf<WireInspectorProcessor>()([
    "processorId",
    "factoryId",
    "driveId",
    "processorIndex",
    "lastOrdinal",
    "status",
    "lastError",
    "lastErrorTimestampUtcMs",
  ]),
  InspectionStorageHealth: fieldsOf<WireStorageHealth>()([
    "tracked",
    "healthy",
    "everRecreated",
    "recreateCount",
  ]),
  InspectionValidation: fieldsOf<WireValidationResult>()([
    "documentId",
    "isConsistent",
    "keyframeIssues",
    "snapshotIssues",
    "streamOrderIssues",
  ]),
  InspectionCursor: fieldsOf<WireRemoteCursor>()([
    "cursorType",
    "cursorOrdinal",
    "lastSyncedAtUtcMs",
    "liveAckOrdinal",
    "liveLatestOrdinal",
  ]),
  InspectionMailboxDepths: fieldsOf<WireMailboxDepths>()([
    "inbox",
    "outbox",
    "deadLetter",
  ]),
  InspectionConnectionHealth: fieldsOf<WireRemoteConnectionHealth>()([
    "snapshot",
    "neverSucceeded",
    "stalenessMs",
  ]),
  InspectionRemote: fieldsOf<WireRemoteSyncInspection>()([
    "remoteName",
    "remoteId",
    "inboxCursor",
    "outboxCursor",
    "mailboxDepths",
    "connection",
    "meta",
  ]),
  InspectionDeadLetter: fieldsOf<WireDeadLetter>()([
    "id",
    "jobId",
    "documentId",
    "branch",
    "scopes",
    "errorType",
    "errorMessage",
    "operationCount",
  ]),
  InspectionDeadLetterPage: fieldsOf<WireDeadLetterPage>()([
    "remoteName",
    "results",
    "nextCursor",
  ]),
} as const;

function rootFieldsOf(...tables: Readonly<Record<string, InspectorOpSpec>>[]) {
  return tables.flatMap((table) =>
    Object.values(readOpFields(table)).filter(
      (field): field is string => field !== undefined,
    ),
  );
}

/** The root fields the inspection subgraph serves: the read rows only. */
export const INSPECTION_ROOT_FIELDS: {
  readonly ReactorInspection: readonly string[];
} = Object.freeze({
  ReactorInspection: Object.freeze(
    rootFieldsOf(INSPECTOR_OPS, SYNC_INSPECTION_OPS),
  ),
});

/** Ordinals pass 2^31, so these are `Float` rather than `Int`. */
export const INSPECTION_ORDINAL_FIELDS = {
  InspectionProcessor: ["lastOrdinal"],
  InspectionCursor: ["cursorOrdinal", "liveAckOrdinal", "liveLatestOrdinal"],
} as const satisfies Record<string, readonly string[]>;
