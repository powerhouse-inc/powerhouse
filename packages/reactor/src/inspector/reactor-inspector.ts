import type {
  IProcessorManager,
  ProcessorRerunOptions,
} from "@powerhousedao/shared/processors";
import type {
  IKeyframeCleanup,
  KeyframeCleanupRun,
  KeyframeReclaim,
} from "../admin/keyframe-cleanup-types.js";
import type {
  IDocumentIntegrityService,
  RebuildResult,
  ValidationResult,
} from "../admin/types.js";
import type {
  CatchUpStatus,
  ICatchUp,
  SweepResult,
} from "../catch-up/types.js";
import {
  assertCatchUpPrioritySetting,
  CATCH_UP_LEVELS,
  DYNAMIC_START_LEVEL,
  type CatchUpPriority,
  type CatchUpPrioritySetting,
  type CatchUpPriorityState,
} from "../processors/catch-up-priority.js";
import {
  DEFAULT_PROCESSOR_TIMING_WINDOW_MS,
  type ProcessorTimingSettings,
} from "../processors/processor-stats.js";
import type { Job } from "../queue/types.js";
import type { MemoryTelemetry } from "../telemetry/memory-telemetry.js";
import type {
  MemoryTelemetryChange,
  MemoryTelemetryReport,
} from "../telemetry/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { DriveInspection } from "./drive-inspection.js";
import { READ_ONLY_ACCESS } from "./ops.js";
import { UNKNOWN_STORAGE_FACTS } from "./storage-facts.js";
import { computeProcessorTiming } from "./timing.js";
import type {
  IInspectableAttachmentStore,
  IInspectableQueue,
  IInspector,
  IInspectorAdmin,
  InspectorAccess,
  InspectorAttachmentInfo,
  InspectorDocumentModelInfo,
  InspectorDriveIntegrity,
  InspectorDrivePage,
  InspectorProcessorInfo,
  InspectorProcessorTimingReport,
  IReactorFactsSink,
  IInspectorStorageHealthProvider,
  QueueStateSnapshot,
  ReactorInfo,
  ReactorStorageFacts,
  InspectorStorageHealth,
} from "./types.js";

/** The facts a `ReactorInspector` reports; `workflows` changes after build. */
export type ReactorInspectorFacts = {
  storage?: ReactorStorageFacts;
  syncChannels?: readonly string[];
  access?: InspectorAccess;
  workflows?: boolean;
};

/** A missing component reads as empty; an action on one is refused. */
export type ReactorInspectorComponents = {
  queue?: IInspectableQueue;
  processorManager?: IProcessorManager;
  catchUp?: ICatchUp;
  catchUpPriority?: CatchUpPriority;
  processorTiming?: ProcessorTimingSettings;
  memoryTelemetry?: MemoryTelemetry;
  integrity?: IDocumentIntegrityService;
  keyframeCleanup?: IKeyframeCleanup;
  storageHealth?: IInspectorStorageHealthProvider;
  documentModelRegistry?: IDocumentModelRegistry;
  /** A document model loader is wired; absent reads as false. */
  loadsModelsOnDemand?: boolean;
  drives?: DriveInspection;
  attachmentStore?: IInspectableAttachmentStore;
  facts?: ReactorInspectorFacts;
};

const untrackedStorageHealth: InspectorStorageHealth = {
  tracked: false,
  healthy: false,
  everRecreated: false,
  recreateCount: 0,
};

const emptyQueueState: QueueStateSnapshot = {
  isPaused: false,
  pendingJobs: [],
  executingJobs: [],
  totalPending: 0,
  totalExecuting: 0,
};

const noAttachmentStore: InspectorAttachmentInfo = {
  present: false,
  storeKind: "none",
  hasReplicator: false,
  replicatorRunning: false,
  backlogScanned: false,
  refsSeen: 0,
  held: 0,
  bytesHeld: 0,
  queued: 0,
  fetching: 0,
  pendingFetches: 0,
  waiting: 0,
  notFound: 0,
  failed: 0,
  lastError: undefined,
};

function unsupported(what: string, why: string): Error {
  return new Error(`${what} is unsupported on this host: ${why}`);
}

const NO_INSPECTABLE_QUEUE =
  "its queue is not the in-memory one, so it cannot be paused or resumed";
const NO_CATCH_UP = "it was built without catch-up";
const NO_INTEGRITY = "it has no document integrity service";
const NO_PROCESSORS = "it was built without a processor manager";
const NO_TELEMETRY = "it was built without memory telemetry";
const NO_KEYFRAME_CLEANUP = "it has no keyframe clean-up";

const noCatchUpPriority: CatchUpPriorityState = {
  mode: "dynamic",
  level: DYNAMIC_START_LEVEL,
  settings: CATCH_UP_LEVELS[DYNAMIC_START_LEVEL]!,
  reason: "no processor manager",
  sample: undefined,
};

/** In-process inspector over a reactor module's live components. */
export class ReactorInspector
  implements IInspector, IInspectorAdmin, IReactorFactsSink
{
  private readonly components: ReactorInspectorComponents;
  private readonly storageFacts: ReactorStorageFacts;
  private readonly syncChannels: readonly string[];
  private readonly access: InspectorAccess;
  private workflows: boolean;

  constructor(components: ReactorInspectorComponents) {
    this.components = components;
    const facts = components.facts ?? {};
    this.storageFacts = facts.storage ?? UNKNOWN_STORAGE_FACTS;
    this.syncChannels = Object.freeze([...(facts.syncChannels ?? [])]);
    this.access = facts.access ?? READ_ONLY_ACCESS;
    this.workflows = facts.workflows ?? false;
  }

  setWorkflows(composed: boolean): void {
    this.workflows = composed;
  }

  info(): Promise<ReactorInfo> {
    return Promise.resolve({
      storage: { ...this.storageFacts },
      workflows: this.workflows,
      syncChannels: [...this.syncChannels],
      access: { ...this.access },
    });
  }

  loadsModelsOnDemand(): Promise<boolean> {
    return Promise.resolve(this.components.loadsModelsOnDemand ?? false);
  }

  listDocumentModels(): Promise<InspectorDocumentModelInfo[]> {
    const registry = this.components.documentModelRegistry;
    if (!registry) {
      return Promise.resolve([]);
    }
    const byType = new Map<string, InspectorDocumentModelInfo>();
    for (const module of registry.getAllModules()) {
      const documentType = module.documentModel.global.id;
      if (byType.has(documentType)) {
        continue;
      }
      const supportedVersions = registry.getSupportedVersions(documentType);
      byType.set(documentType, {
        documentType,
        name: module.documentModel.global.name,
        version: supportedVersions.at(-1) ?? module.version ?? 1,
        supportedVersions,
      });
    }
    return Promise.resolve([...byType.values()]);
  }

  listDrives(cursor?: string, limit?: number): Promise<InspectorDrivePage> {
    const drives = this.components.drives;
    if (!drives) {
      return Promise.resolve({ results: [], nextCursor: undefined });
    }
    return drives.listDrives(cursor, limit);
  }

  checkDriveIntegrity(
    driveId: string,
    branch: string,
  ): Promise<InspectorDriveIntegrity> {
    const drives = this.components.drives;
    if (!drives) {
      return Promise.resolve({
        driveId,
        checkedNodeCount: 0,
        totalFileNodeCount: 0,
        missingDocuments: [],
        unsupportedTypes: [],
      });
    }
    return drives.checkDriveIntegrity(driveId, branch);
  }

  getAttachmentInfo(): Promise<InspectorAttachmentInfo> {
    const store = this.components.attachmentStore;
    if (!store) {
      return Promise.resolve({ ...noAttachmentStore });
    }
    return store.getAttachmentInfo();
  }

  getQueueState(): Promise<QueueStateSnapshot> {
    const queue = this.components.queue;
    if (!queue) {
      return Promise.resolve({ ...emptyQueueState });
    }
    const pendingJobs = queue.getPendingJobs();
    const executingJobs: Job[] = [];
    for (const jobIds of queue.getExecutingJobIds().values()) {
      for (const jobId of jobIds) {
        const job = queue.getJob(jobId);
        if (job) {
          executingJobs.push(job);
        }
      }
    }
    return Promise.resolve({
      isPaused: queue.paused,
      pendingJobs,
      executingJobs,
      totalPending: pendingJobs.length,
      totalExecuting: executingJobs.length,
    });
  }

  getProcessors(): Promise<InspectorProcessorInfo[]> {
    const tracked = this.components.processorManager?.getAll() ?? [];
    return Promise.resolve(
      tracked.map((processor) => ({
        processorId: processor.processorId,
        factoryId: processor.factoryId,
        driveId: processor.driveId,
        processorIndex: processor.processorIndex,
        lastOrdinal: processor.lastOrdinal,
        status: processor.status,
        lastError: processor.lastError,
        lastErrorTimestamp: processor.lastErrorTimestamp,
        floor: processor.floor,
        clearable: typeof processor.record.processor.clear === "function",
        runFrom: processor.runFrom,
        phase: processor.phase,
      })),
    );
  }

  getProcessorTiming(): Promise<InspectorProcessorTimingReport> {
    const { processorManager, catchUp, processorTiming } = this.components;
    return Promise.resolve(
      computeProcessorTiming(
        processorManager?.getAll() ?? [],
        catchUp?.status(),
        processorTiming?.level ?? "off",
        processorTiming?.windowMs ?? DEFAULT_PROCESSOR_TIMING_WINDOW_MS,
      ),
    );
  }

  getMemoryTelemetry(
    limit?: number,
    sinceIso?: string,
  ): Promise<MemoryTelemetryReport> {
    const telemetry = this.components.memoryTelemetry;
    if (!telemetry) {
      return Promise.reject(
        unsupported("Reading memory telemetry", NO_TELEMETRY),
      );
    }
    return Promise.resolve(telemetry.report(limit, sinceIso));
  }

  getCatchUpStatus(): Promise<CatchUpStatus> {
    const catchUp = this.components.catchUp;
    if (!catchUp) {
      return Promise.reject(unsupported("Reading catch-up", NO_CATCH_UP));
    }
    return Promise.resolve(catchUp.status());
  }

  getCatchUpPriority(): Promise<CatchUpPriorityState> {
    const priority = this.components.catchUpPriority;
    if (!priority) {
      return Promise.resolve({
        ...noCatchUpPriority,
        settings: { ...noCatchUpPriority.settings },
      });
    }
    return Promise.resolve(priority.get());
  }

  getStorageHealth(): Promise<InspectorStorageHealth> {
    const provider = this.components.storageHealth;
    if (!provider) {
      return Promise.resolve({ ...untrackedStorageHealth });
    }
    return Promise.resolve(provider.getStorageHealth());
  }

  validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult> {
    const integrity = this.components.integrity;
    if (!integrity) {
      return Promise.reject(unsupported("Validating a document", NO_INTEGRITY));
    }
    return integrity.validateDocument(documentId, branch);
  }

  pauseQueue(): Promise<void> {
    const queue = this.components.queue;
    if (!queue) {
      return Promise.reject(
        unsupported("Pausing the queue", NO_INSPECTABLE_QUEUE),
      );
    }
    queue.pause();
    return Promise.resolve();
  }

  resumeQueue(): Promise<void> {
    const queue = this.components.queue;
    if (!queue) {
      return Promise.reject(
        unsupported("Resuming the queue", NO_INSPECTABLE_QUEUE),
      );
    }
    return queue.resume();
  }

  retryProcessor(processorId: string): Promise<void> {
    const manager = this.components.processorManager;
    if (!manager) {
      return Promise.reject(unsupported("Retrying a processor", NO_PROCESSORS));
    }
    const processor = manager.get(processorId);
    if (!processor) {
      return Promise.reject(
        new Error(
          `Cannot retry processor ${JSON.stringify(processorId)}: this reactor is not tracking it`,
        ),
      );
    }
    return processor.retry();
  }

  rerunProcessor(
    processorId: string,
    options: ProcessorRerunOptions,
  ): Promise<void> {
    const manager = this.components.processorManager;
    if (!manager) {
      return Promise.reject(
        unsupported("Rerunning a processor", NO_PROCESSORS),
      );
    }
    return manager.rerun(processorId, options);
  }

  sweepCatchUp(): Promise<SweepResult[]> {
    const catchUp = this.components.catchUp;
    if (!catchUp) {
      return Promise.reject(unsupported("Sweeping catch-up", NO_CATCH_UP));
    }
    return catchUp.sweepNow();
  }

  setCatchUpPriority(setting: CatchUpPrioritySetting): Promise<void> {
    const priority = this.components.catchUpPriority;
    if (!priority) {
      return Promise.reject(
        unsupported("Setting the catch-up priority", NO_PROCESSORS),
      );
    }
    try {
      assertCatchUpPrioritySetting(setting);
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    priority.set(setting);
    return Promise.resolve();
  }

  setMemoryTelemetry(change: MemoryTelemetryChange): Promise<void> {
    const telemetry = this.components.memoryTelemetry;
    if (!telemetry) {
      return Promise.reject(
        unsupported("Setting memory telemetry", NO_TELEMETRY),
      );
    }
    telemetry.reconfigure(change);
    return Promise.resolve();
  }

  writeHeapSnapshot(force = false): Promise<string> {
    const telemetry = this.components.memoryTelemetry;
    if (!telemetry) {
      return Promise.reject(
        unsupported("Writing a heap snapshot", NO_TELEMETRY),
      );
    }
    return telemetry.writeHeapSnapshot(force);
  }

  rebuildKeyframes(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const integrity = this.components.integrity;
    if (!integrity) {
      return Promise.reject(unsupported("Rebuilding keyframes", NO_INTEGRITY));
    }
    return integrity.rebuildKeyframes(documentId, branch);
  }

  rebuildSnapshots(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const integrity = this.components.integrity;
    if (!integrity) {
      return Promise.reject(unsupported("Rebuilding snapshots", NO_INTEGRITY));
    }
    return integrity.rebuildSnapshots(documentId, branch);
  }

  startKeyframeCleanup(options: {
    dryRun: boolean;
  }): Promise<KeyframeCleanupRun> {
    const cleanup = this.components.keyframeCleanup;
    if (!cleanup) {
      return Promise.reject(
        unsupported("Cleaning up keyframes", NO_KEYFRAME_CLEANUP),
      );
    }
    try {
      return Promise.resolve(cleanup.start({ dryRun: options.dryRun }));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  getKeyframeCleanup(): Promise<KeyframeCleanupRun | null> {
    return Promise.resolve(this.components.keyframeCleanup?.status() ?? null);
  }

  cancelKeyframeCleanup(): Promise<void> {
    this.components.keyframeCleanup?.cancel();
    return Promise.resolve();
  }

  reclaimKeyframeSpace(): Promise<KeyframeReclaim> {
    const cleanup = this.components.keyframeCleanup;
    if (!cleanup) {
      return Promise.reject(
        unsupported("Reclaiming keyframe space", NO_KEYFRAME_CLEANUP),
      );
    }
    return cleanup.reclaim();
  }

  getKeyframeReclaim(): Promise<KeyframeReclaim | null> {
    return Promise.resolve(
      this.components.keyframeCleanup?.reclaimStatus() ?? null,
    );
  }
}
