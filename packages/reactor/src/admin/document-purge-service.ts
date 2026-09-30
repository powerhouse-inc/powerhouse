import { v4 as uuidv4 } from "uuid";
import type { InProcessReactorModule } from "../core/types.js";
import { buildSingleJobMeta } from "../core/utils.js";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobPendingEvent } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import { JobStatus, type JobInfo } from "../shared/types.js";

export { DEFAULT_MAX_PURGE_OPERATIONS } from "../executor/types.js";

export type EnqueuePurgeOptions = {
  /** Lifts the executor's maxPurgeOperations cap for every id. */
  allowLarge?: boolean;
};

/** The only local origin of a purge: one purge job per erased document. */
export class DocumentPurgeService {
  constructor(
    private readonly queue: IQueue,
    private readonly jobTracker: IJobTracker,
    private readonly eventBus: IEventBus,
  ) {}

  static fromModule(module: InProcessReactorModule): DocumentPurgeService {
    return new DocumentPurgeService(
      module.queue,
      module.jobTracker,
      module.eventBus,
    );
  }

  /** One purge job per id; resolves once enqueued, not once complete. */
  async enqueuePurge(
    ids: string[],
    requestId: string,
    opts: EnqueuePurgeOptions = {},
  ): Promise<JobInfo[]> {
    const requestDocumentIds = [...new Set(ids)];
    const infos: JobInfo[] = [];
    for (const documentId of requestDocumentIds) {
      const jobId = uuidv4();
      const createdAtUtcIso = new Date().toISOString();
      const meta = buildSingleJobMeta(jobId, {
        purgeRequestId: requestId,
        purgeRequestDocumentIds: requestDocumentIds,
      });
      const job: Job = {
        id: jobId,
        kind: "purge",
        documentId,
        scope: "document",
        branch: "main",
        actions: [],
        operations: [],
        createdAt: createdAtUtcIso,
        queueHint: [],
        maxRetries: 3,
        errorHistory: [],
        meta,
        purge: { requestId, allowLarge: opts.allowLarge ?? false },
      };
      const info: JobInfo = {
        id: jobId,
        documentId,
        status: JobStatus.PENDING,
        createdAtUtcIso,
        consistencyToken: {
          version: 1,
          createdAtUtcIso,
          coordinates: [],
        },
        meta,
      };
      this.jobTracker.registerJob(info);
      const pending: JobPendingEvent = { jobId, jobMeta: meta };
      this.eventBus.emit(ReactorEventTypes.JOB_PENDING, pending).catch(() => {
        // Ignored, as the reactor ignores it for every other job.
      });
      // enqueue settles only after the job runs; its synchronous part queues it.
      const dispatched = this.queue.enqueue(job);
      dispatched.catch(() => {
        // A dispatch failure surfaces on the job, as for every other job.
      });
      await Promise.race([dispatched, Promise.resolve()]);
      infos.push(info);
    }
    return infos;
  }
}
