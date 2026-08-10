import {
  groupDocumentType,
  groupMembershipActionTypes,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { v4 as uuidv4 } from "uuid";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IEventBus } from "../events/interfaces.js";
import type { JobWriteReadyEvent, Unsubscribe } from "../events/types.js";
import { ReactorEventTypes } from "../events/types.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import { buildSingleJobMeta } from "./utils.js";

/**
 * Watches committed writes for group membership changes and enqueues a
 * re-evaluation job for every document whose auth history references the
 * changed group, found through the reverse direction of the group-reference
 * relation. Each affected document is re-judged in its own job, so the work
 * runs under that document's execution slot rather than the group's.
 *
 * The job carries the earliest changed membership timestamp; the executor
 * skips the pass when everything the document holds sorts before it, which
 * keeps the common case (a membership write later than all history) free.
 */
export class GroupReevaluationTrigger {
  private unsubscribe?: Unsubscribe;

  constructor(
    private logger: ILogger,
    private eventBus: IEventBus,
    private queue: IQueue,
    private operationIndex: IOperationIndex,
  ) {}

  startup(): void {
    this.unsubscribe = this.eventBus.subscribe<JobWriteReadyEvent>(
      ReactorEventTypes.JOB_WRITE_READY,
      async (_type, event) => this.onWriteReady(event),
    );
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async onWriteReady(event: JobWriteReadyEvent): Promise<void> {
    // groupId -> earliest membership-change timestamp in this event
    const changed = new Map<string, string>();
    for (const { operation, context } of event.operations) {
      if (
        context.documentType !== groupDocumentType ||
        context.scope !== "global" ||
        !(groupMembershipActionTypes as readonly string[]).includes(
          operation.action.type,
        )
      ) {
        continue;
      }
      const existing = changed.get(context.documentId);
      if (
        existing === undefined ||
        Date.parse(operation.timestampUtcMs) < Date.parse(existing)
      ) {
        changed.set(context.documentId, operation.timestampUtcMs);
      }
    }
    if (changed.size === 0) {
      return;
    }

    // One job per affected document, at the earliest trigger among its groups.
    const affected = new Map<string, string>();
    for (const [groupId, timestamp] of changed) {
      let referencers: string[];
      try {
        referencers = await this.operationIndex.getGroupReferencers(groupId);
      } catch (error) {
        this.logger.error(
          "Failed to resolve referencers of group @groupId: @error",
          groupId,
          error,
        );
        continue;
      }
      for (const documentId of referencers) {
        const existing = affected.get(documentId);
        if (
          existing === undefined ||
          Date.parse(timestamp) < Date.parse(existing)
        ) {
          affected.set(documentId, timestamp);
        }
      }
    }

    for (const [documentId, timestamp] of affected) {
      const jobId = uuidv4();
      const job: Job = {
        id: jobId,
        kind: "reevaluation",
        documentId,
        scope: "global",
        branch: "main",
        actions: [],
        operations: [],
        createdAt: new Date().toISOString(),
        queueHint: [],
        maxRetries: 3,
        errorHistory: [],
        meta: {
          ...buildSingleJobMeta(jobId),
          triggerTimestampUtcMs: timestamp,
        },
      };
      try {
        await this.queue.enqueue(job);
      } catch (error) {
        this.logger.error(
          "Failed to enqueue re-evaluation of @documentId: @error",
          documentId,
          error,
        );
      }
    }
  }
}
