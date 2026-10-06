import type { ProcessorStatus } from "@powerhousedao/shared/processors";
import type { RebuildResult, ValidationResult } from "../admin/types.js";
import type { CatchUpStatus, SweepResult } from "../catch-up/types.js";
import type { Job } from "../queue/types.js";

/** Where the reactor's store keeps its bytes. */
export type StoragePersistence =
  | "idb"
  | "memory"
  | "path"
  | "server"
  | "unknown";

/** What the reactor knows about its own store. */
export type ReactorStorageFacts = {
  readonly engine: "pglite" | "postgres" | "unknown";
  readonly persistence: StoragePersistence;
  /** False when the store is in memory or its persistence is unknown. */
  readonly durable: boolean;
  /** Whether a poisoned store session is recreated in place. */
  readonly selfHeal: boolean;
};

/** The inspection tiers a transport serves beyond reads. */
export type InspectorAccess = {
  readonly admin: boolean;
  readonly sql: boolean;
};

/** The facts a reactor reports about itself. */
export type ReactorInfo = {
  readonly storage: ReactorStorageFacts;
  /** Whether a workflow runtime is composed onto this reactor right now. */
  readonly workflows: boolean;
  /** The channel types the built channel factory serves; empty without sync. */
  readonly syncChannels: readonly string[];
  readonly access: InspectorAccess;
};

/** Untracked health reports `healthy: false`, so an unwatched store never reads green. */
export type StorageHealth = {
  tracked: boolean;
  healthy: boolean;
  everRecreated: boolean;
  recreateCount: number;
};

/** The storage-health source a `ReactorInspector` reads, when one is wired. */
export interface IStorageHealthProvider {
  getStorageHealth(): StorageHealth;
}

/** Point-in-time view of the job queue. */
export type QueueStateSnapshot = {
  isPaused: boolean;
  pendingJobs: Job[];
  executingJobs: Job[];
  totalPending: number;
  totalExecuting: number;
};

/** One registered document model and every version its type supports. */
export type InspectorDocumentModelInfo = {
  documentType: string;
  name: string;
  version: number;
  supportedVersions: number[];
};

/** One drive and a summary of its node tree. */
export type InspectorDriveInfo = {
  driveId: string;
  name: string;
  branch: string;
  /** The `drive.<branch>.<driveId>` collection id a remote syncs it under. */
  collectionId: string;
  documentType: string;
  /** Every entry in the raw node array, malformed ones included. */
  nodeCount: number;
  fileCount: number;
  folderCount: number;
  /** Readable nodes whose kind is neither file nor folder. */
  otherNodeCount: number;
  /** Entries with no string id or kind. */
  unreadableNodeCount: number;
  icon: string | undefined;
};

export type InspectorDrivePage = {
  results: InspectorDriveInfo[];
  /** Absent once the last page has been served. */
  nextCursor: string | undefined;
};

export type InspectorDriveIntegrityRef = {
  id: string;
  documentType: string;
};

/** One pass over one drive snapshot, so `checkedNodeCount` equals `totalFileNodeCount`. */
export type InspectorDriveIntegrity = {
  driveId: string;
  checkedNodeCount: number;
  totalFileNodeCount: number;
  missingDocuments: InspectorDriveIntegrityRef[];
  unsupportedTypes: InspectorDriveIntegrityRef[];
};

/** Replicator counters mean nothing when `hasReplicator` is false. */
export type InspectorAttachmentInfo = {
  present: boolean;
  /** The store class, e.g. "kysely", "idb", "memory"; "none" when absent. */
  storeKind: string;
  hasReplicator: boolean;
  replicatorRunning: boolean;
  backlogScanned: boolean;
  refsSeen: number;
  held: number;
  bytesHeld: number;
  queued: number;
  fetching: number;
  pendingFetches: number;
  waiting: number;
  notFound: number;
  failed: number;
  lastError: string | undefined;
};

/** The attachment-store source a `ReactorInspector` reads, when one is wired. */
export interface IInspectableAttachmentStore {
  getAttachmentInfo(): Promise<InspectorAttachmentInfo>;
}

/** A tracked processor without its `retry()` closure, so it can be cloned. */
export type InspectorProcessorInfo = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  lastOrdinal: number;
  status: ProcessorStatus;
  lastError: string | undefined;
  lastErrorTimestamp: Date | undefined;
};

/** The in-memory queue's debugging surface; not part of `IQueue`. */
export interface IInspectableQueue {
  readonly paused: boolean;
  pause(): void;
  resume(): Promise<void>;
  getPendingJobs(): Job[];
  getExecutingJobIds(): Map<string, Set<string>>;
  getJob(jobId: string): Job | undefined;
}

/** Inspection reads: no state changes, plain-data results for any transport. */
export interface IInspector {
  info(): Promise<ReactorInfo>;
  listDocumentModels(): Promise<InspectorDocumentModelInfo[]>;
  listDrives(cursor?: string, limit?: number): Promise<InspectorDrivePage>;
  checkDriveIntegrity(
    driveId: string,
    branch: string,
  ): Promise<InspectorDriveIntegrity>;
  getAttachmentInfo(): Promise<InspectorAttachmentInfo>;
  getQueueState(): Promise<QueueStateSnapshot>;
  getProcessors(): Promise<InspectorProcessorInfo[]>;
  getCatchUpStatus(): Promise<CatchUpStatus>;
  getStorageHealth(): Promise<StorageHealth>;
  /** Replays the whole document; read-only but expensive. */
  validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult>;
}

/** The inspection levers. An action a host cannot perform is refused. */
export interface IInspectorAdmin {
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  retryProcessor(processorId: string): Promise<void>;
  sweepCatchUp(): Promise<SweepResult[]>;
  rebuildKeyframes(documentId: string, branch?: string): Promise<RebuildResult>;
  rebuildSnapshots(documentId: string, branch?: string): Promise<RebuildResult>;
}

/** Raw SQL against the reactor's own store. */
export interface IReactorDbQuery {
  queryDb(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** Host-side setters for the facts a reactor learns after it is built. */
export interface IReactorFactsSink {
  setWorkflows(composed: boolean): void;
}
