import type { IProcessorManager } from "@powerhousedao/shared/processors";
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
import type { Job } from "../queue/types.js";
import type {
  IInspectableQueue,
  IInspector,
  InspectorProcessorInfo,
  QueueStateSnapshot,
} from "./types.js";

/**
 * The components a `ReactorInspector` observes. Every one is optional: a
 * reactor module that lacks a piece (a queue that is not the in-memory one, no
 * catch-up scheduler) still gets an inspector, and the methods needing the
 * missing piece degrade - queue and processor reads come back empty, catch-up
 * and integrity refuse.
 */
export type ReactorInspectorComponents = {
  queue?: IInspectableQueue;
  processorManager?: IProcessorManager;
  catchUp?: ICatchUp;
  integrity?: IDocumentIntegrityService;
};

const emptyQueueState: QueueStateSnapshot = {
  isPaused: false,
  pendingJobs: [],
  executingJobs: [],
  totalPending: 0,
  totalExecuting: 0,
};

function catchUpUnavailable(): Error {
  return new Error("Catch-up not available");
}

function integrityUnavailable(): Error {
  return new Error("Integrity service not available");
}

/** In-process `IInspector` over a reactor module's live components. */
export class ReactorInspector implements IInspector {
  private readonly queue: IInspectableQueue | undefined;
  private readonly processorManager: IProcessorManager | undefined;
  private readonly catchUp: ICatchUp | undefined;
  private readonly integrity: IDocumentIntegrityService | undefined;

  constructor(components: ReactorInspectorComponents) {
    this.queue = components.queue;
    this.processorManager = components.processorManager;
    this.catchUp = components.catchUp;
    this.integrity = components.integrity;
  }

  getQueueState(): Promise<QueueStateSnapshot> {
    const queue = this.queue;
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

  pauseQueue(): Promise<void> {
    this.queue?.pause();
    return Promise.resolve();
  }

  async resumeQueue(): Promise<void> {
    await this.queue?.resume();
  }

  getProcessors(): Promise<InspectorProcessorInfo[]> {
    const tracked = this.processorManager?.getAll() ?? [];
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
      })),
    );
  }

  async retryProcessor(processorId: string): Promise<void> {
    await this.processorManager?.get(processorId)?.retry();
  }

  getCatchUpStatus(): Promise<CatchUpStatus> {
    const catchUp = this.catchUp;
    if (!catchUp) {
      return Promise.reject(catchUpUnavailable());
    }
    return Promise.resolve(catchUp.status());
  }

  sweepCatchUp(): Promise<SweepResult[]> {
    const catchUp = this.catchUp;
    if (!catchUp) {
      return Promise.reject(catchUpUnavailable());
    }
    return catchUp.sweepNow();
  }

  validateDocument(
    documentId: string,
    branch?: string,
  ): Promise<ValidationResult> {
    const integrity = this.integrity;
    if (!integrity) {
      return Promise.reject(integrityUnavailable());
    }
    return integrity.validateDocument(documentId, branch);
  }

  rebuildKeyframes(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const integrity = this.integrity;
    if (!integrity) {
      return Promise.reject(integrityUnavailable());
    }
    return integrity.rebuildKeyframes(documentId, branch);
  }

  rebuildSnapshots(
    documentId: string,
    branch?: string,
  ): Promise<RebuildResult> {
    const integrity = this.integrity;
    if (!integrity) {
      return Promise.reject(integrityUnavailable());
    }
    return integrity.rebuildSnapshots(documentId, branch);
  }
}
