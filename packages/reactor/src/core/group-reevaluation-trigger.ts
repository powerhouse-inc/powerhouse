import {
  deriveOperationId,
  derivesByRule,
  groupDocumentType,
  groupMembershipActionTypes,
  retractionTarget,
  type Action,
  type Operation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { sql, type Kysely } from "kysely";
import { v4 as uuidv4 } from "uuid";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { SweepResult } from "../catch-up/types.js";
import type { IEventBus } from "../events/interfaces.js";
import { UNGATED, type BaseReducerResolver } from "../protocol/gate.js";
import type { JobWriteReadyEvent, Unsubscribe } from "../events/types.js";
import { ReactorEventTypes } from "../events/types.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import {
  BaseReadModel,
  unchunkedReadModelIndexingConfig,
} from "../read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../read-models/types.js";
import { ConsistencyTracker } from "../shared/consistency-tracker.js";
import type { IOperationStore } from "../storage/interfaces.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import { buildSingleJobMeta } from "./utils.js";

export const GROUP_REEVALUATION_TRIGGER = "group-reevaluation-trigger";

/** Base-reducer 3 retracts membership with a RETRACT. */
const membershipChangeTypes: readonly string[] = [
  ...groupMembershipActionTypes,
  "RETRACT",
];

function isMembershipChange({
  operation,
  context,
}: OperationWithContext): boolean {
  return (
    context.documentType === groupDocumentType &&
    context.scope === "global" &&
    membershipChangeTypes.includes(operation.action.type)
  );
}

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
export class GroupReevaluationTrigger extends BaseReadModel {
  private unsubscribe?: Unsubscribe;

  constructor(
    private readonly logger: ILogger,
    private readonly eventBus: IEventBus,
    private readonly queue: IQueue,
    operationIndex: IOperationIndex,
    db: Kysely<DocumentViewDatabase>,
    private readonly operationStore: IOperationStore,
    private readonly documentMetaCache: IDocumentMetaCache,
    private readonly protocol: BaseReducerResolver = UNGATED,
  ) {
    super(db, operationIndex, {} as IWriteCache, new ConsistencyTracker(), {
      readModelId: GROUP_REEVALUATION_TRIGGER,
      rebuildStateOnInit: false,
      indexing: unchunkedReadModelIndexingConfig,
      startFrom: "head",
      replayStreamSuffix: false,
      // Writes no rows; its lookups and enqueues need the connection.
      purgeFence: "none",
    });
  }

  /** A first start begins at the watermark: it has no history to trust. */
  async startup(): Promise<void> {
    await this.init();
    this.unsubscribe = this.eventBus.subscribe<JobWriteReadyEvent>(
      ReactorEventTypes.JOB_WRITE_READY,
      async (_type, event) => this.onWriteReady(event),
    );
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Sweeps membership changes only; other operations never hold the cursor. */
  override async sweep(
    settledThrough: number,
    _present: readonly number[],
    signal?: AbortSignal,
  ): Promise<SweepResult> {
    signal?.throwIfAborted();
    const rows = await (this.db as unknown as Kysely<StorageDatabase>)
      .selectFrom("operation_index_operations")
      .select("ordinal")
      .where("ordinal", ">", this.appliedThrough)
      .where("ordinal", "<=", settledThrough)
      .where("documentType", "=", groupDocumentType)
      .where("scope", "=", "global")
      .where(sql<string>`action->>'type'`, "in", [...membershipChangeTypes])
      .orderBy("ordinal", "asc")
      .execute();
    return super.sweep(
      settledThrough,
      rows.map((row) => Number(row.ordinal)),
      signal,
    );
  }

  /** Throws when any lookup or enqueue failed, so the batch is retried. */
  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    // groupId -> earliest membership-change timestamp in this batch
    const changed = new Map<string, string>();
    const ruled = new Map<string, Promise<boolean>>();
    for (const item of items) {
      if (!isMembershipChange(item)) continue;
      if (!(await this.retractsMembership(item, items, ruled))) {
        continue;
      }
      const { operation, context } = item;
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

    const failures: unknown[] = [];

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
        failures.push(error);
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
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "group re-evaluation was not enqueued for every affected document",
      );
    }
  }

  /**
   * Whether a RETRACT can change membership: only where the retraction rule
   * derives its scope, and only when its target, through any RETRACTs it
   * names, is a membership action. Any other change passes. A lookup that
   * fails or finds nothing passes too, so a re-evaluation is never lost.
   */
  private async retractsMembership(
    item: OperationWithContext,
    batch: OperationWithContext[],
    ruled: Map<string, Promise<boolean>>,
  ): Promise<boolean> {
    const { operation, context } = item;
    if (operation.action.type !== "RETRACT") {
      return true;
    }
    try {
      const key = `${context.documentId}/${context.scope}/${context.branch}`;
      let derived = ruled.get(key);
      if (derived === undefined) {
        derived = this.derivesRetraction(context);
        ruled.set(key, derived);
      }
      if (!(await derived)) {
        return false;
      }

      const seen = new Set<string>();
      let target = retractionTarget(operation);
      while (target !== undefined && !seen.has(target)) {
        seen.add(target);
        const action = await this.groupAction(item, batch, target);
        if (action === undefined) {
          return true;
        }
        if (action.type !== "RETRACT") {
          return (groupMembershipActionTypes as readonly string[]).includes(
            action.type,
          );
        }
        target = retractionTarget({ action } as Operation);
      }
      return true;
    } catch {
      return true;
    }
  }

  /** Whether the rule derives the stream; so taken when the header has no version or is unreadable. */
  private async derivesRetraction(
    context: OperationWithContext["context"],
  ): Promise<boolean> {
    let caps;
    try {
      const meta = await this.documentMetaCache.getDocumentMeta(
        context.documentId,
        context.branch,
      );
      caps = this.protocol.capabilities(meta.protocolVersions);
    } catch {
      return true;
    }
    return caps === undefined || derivesByRule(caps, context.scope);
  }

  /** The group action with this id, from the batch or the store. */
  private async groupAction(
    item: OperationWithContext,
    batch: OperationWithContext[],
    actionId: string,
  ): Promise<Action | undefined> {
    const { documentId, scope, branch } = item.context;
    const inBatch = batch.find(
      ({ operation, context }) =>
        context.documentId === documentId &&
        context.scope === scope &&
        context.branch === branch &&
        operation.action.id === actionId,
    );
    if (inBatch !== undefined) {
      return inBatch.operation.action;
    }
    // Stored operation ids derive from action ids.
    const [row] = await this.operationStore.getOperationsByIds(
      documentId,
      scope,
      branch,
      [deriveOperationId(documentId, scope, branch, actionId)],
    );
    return row?.action;
  }

  private async onWriteReady(event: JobWriteReadyEvent): Promise<void> {
    const changes = event.operations.filter(isMembershipChange);
    if (changes.length === 0) {
      return;
    }
    try {
      await this.indexOperations(changes);
    } catch {
      // Logged per failure above; the claims are released for the next sweep.
    }
  }
}
