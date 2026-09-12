import {
  BaseReadModel,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IDocumentModelRegistry,
  type IOperationIndex,
  type IWriteCache,
  type PagedResults,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import type { IAttachmentSchemaCompiler } from "../../reference-index/types.js";
import type {
  AttachmentReferenceInput,
  IAttachmentReferenceWriter,
} from "./types.js";

export const ATTACHMENT_REFERENCE_READ_MODEL_ID =
  "attachment-reference-read-model";

export class AttachmentReferenceReadModel extends BaseReadModel {
  private indexingQueue: Promise<void> = Promise.resolve();
  private checkpointTarget: number | undefined;
  /**
   * How far a replay may skip ahead of the cursor: the highest ordinal already
   * pulled from the index while the cursor was parked.
   *
   * NOT a claim that every ordinal below it committed -- the parked ordinal is
   * precisely the one that did not -- so it is a hint, and {@link replayFrom}
   * re-probes the gap before honouring it.
   */
  private replayedThrough: number | undefined;
  private warnedCheckpoint: number | undefined;

  constructor(
    db: Kysely<DocumentViewDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    private readonly documentModelRegistry: IDocumentModelRegistry,
    private readonly schemaCompiler: IAttachmentSchemaCompiler,
    private readonly referenceWriter: IAttachmentReferenceWriter,
  ) {
    super(db, operationIndex, writeCache, consistencyTracker, {
      readModelId: ATTACHMENT_REFERENCE_READ_MODEL_ID,
      rebuildStateOnInit: false,
    });
  }

  override indexOperations(items: OperationWithContext[]): Promise<void> {
    return this.enqueue(() => this.indexOperationsInOrdinalOrder(items));
  }

  override init(): Promise<void> {
    return this.enqueue(async () => {
      const viewState = await this.loadState();

      if (viewState !== undefined) {
        this.lastOrdinal = viewState;
      } else {
        await this.initializeState();
      }

      let page = await this.operationIndex.getSinceOrdinal(this.lastOrdinal);
      while (page.results.length > 0) {
        await this.indexOperationsInOrdinalOrder(page.results);
        if (!page.next) break;
        page = await page.next();
      }
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const result = this.indexingQueue.then(work);
    this.indexingQueue = result.catch(() => undefined);
    return result;
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    const references: AttachmentReferenceInput[] = [];

    for (const { operation, context } of items) {
      if (operation.error !== undefined) continue;

      const module = this.documentModelRegistry.getModule(context.documentType);
      const extractor = this.schemaCompiler.forModuleAction(
        module,
        operation.action.type,
      );
      const refs = extractor.extract(operation.action);

      for (const ref of refs) {
        references.push({
          documentId: context.documentId,
          ref,
          operationId: operation.id,
          branch: context.branch,
          scope: context.scope,
          ordinal: context.ordinal,
        });
      }
    }

    if (references.length > 0) {
      await this.referenceWriter.addReferences(references);
    }
  }

  private async indexOperationsInOrdinalOrder(
    incoming: OperationWithContext[],
  ): Promise<void> {
    let candidates = this.sortAndDedupe(incoming);
    if (candidates.length === 0) return;

    const incomingMax = candidates[candidates.length - 1]!.context.ordinal;

    if (this.contiguousEnd(candidates) < incomingMax) {
      const replayed = await this.loadThroughOrdinal(incomingMax);
      candidates = this.sortAndDedupe([...replayed, ...candidates]);
    }

    // The ordinal sequence is a Postgres serial, so it has permanent holes
    // (rolled-back inserts) and transient ones (still-open transactions).
    // Index everything delivered, but park the cursor at the end of the
    // contiguous run so a gap that later fills is still replayed. Re-indexing
    // is idempotent, so a conservative cursor only costs repeated work.
    const checkpoint = this.contiguousEnd(candidates);
    if (checkpoint < incomingMax && checkpoint !== this.warnedCheckpoint) {
      this.warnedCheckpoint = checkpoint;
      console.warn(
        `[${this.config.readModelId}] indexed through ordinal ${incomingMax} ` +
          `but parked the cursor at ${checkpoint}: ordinal ${checkpoint + 1} is missing`,
      );
    }

    const previousOrdinal = this.lastOrdinal;
    this.checkpointTarget = checkpoint;
    try {
      await super.indexOperations(candidates);
    } catch (error) {
      this.lastOrdinal = previousOrdinal;
      // A failed batch leaves its range uncommitted, so the mark cannot stand.
      this.replayedThrough = undefined;
      throw error;
    } finally {
      this.checkpointTarget = undefined;
    }

    // A parked cursor makes every later batch non-contiguous; without this mark
    // each replay would restart at the hole and grow without bound.
    if (checkpoint > previousOrdinal) {
      this.replayedThrough = undefined;
    } else if (checkpoint < incomingMax) {
      this.replayedThrough = Math.max(
        this.replayedThrough ?? checkpoint,
        incomingMax,
      );
    }
  }

  /**
   * Writes the cursor parked by indexOperationsInOrdinalOrder instead of the
   * batch maximum, so indexing an operation above a gap never advances past it.
   */
  protected override async saveState(
    trx: Transaction<DocumentViewDatabase>,
    items: OperationWithContext[],
  ): Promise<void> {
    const target = this.checkpointTarget;
    if (target === undefined) {
      await super.saveState(trx, items);
      return;
    }

    this.lastOrdinal = target;
    await trx
      .updateTable("ViewState")
      .set({
        lastOrdinal: target,
        lastOperationTimestamp: new Date(),
      })
      .where("readModelId", "=", this.config.readModelId)
      .execute();
  }

  /** Last ordinal of the contiguous run starting at lastOrdinal + 1. */
  private contiguousEnd(items: OperationWithContext[]): number {
    let expectedOrdinal = this.lastOrdinal + 1;
    for (const item of items) {
      const ordinal = item.context.ordinal;
      if (ordinal < expectedOrdinal) continue;
      if (ordinal > expectedOrdinal) break;
      expectedOrdinal++;
    }
    return expectedOrdinal - 1;
  }

  /**
   * Opens a replay at the lowest ordinal still worth reading.
   *
   * {@link replayedThrough} is what keeps a permanently held hole -- a
   * rolled-back insert, which never fills -- from re-reading the whole tail on
   * every batch. It cannot be trusted on its own: a hole that fills without
   * being delivered here is visible only in the index, and a mark that is
   * never questioned would hide that operation for the life of the process.
   * That happens whenever another writer commits the gap (a second reactor on
   * the same database), and it leaves the cursor parked below an operation
   * whose references were never written -- `hasReference` then answers false
   * for an attachment that is genuinely referenced.
   *
   * So a parked batch spends one page probing the gap: the first row above the
   * cursor is the missing ordinal itself once it commits. Finding it drops the
   * mark and replays from the cursor; not finding it leaves the mark standing,
   * which is the cheap path and the common one.
   */
  private async replayFrom(): Promise<PagedResults<OperationWithContext>> {
    const fromCursor = await this.operationIndex.getSinceOrdinal(
      this.lastOrdinal,
    );
    if (this.replayedThrough === undefined) {
      return fromCursor;
    }

    // Ordinals come back ascending, so the first row answers it outright.
    if (fromCursor.results[0]?.context.ordinal === this.lastOrdinal + 1) {
      this.replayedThrough = undefined;
      return fromCursor;
    }

    return this.operationIndex.getSinceOrdinal(this.replayedThrough);
  }

  private async loadThroughOrdinal(
    maxOrdinal: number,
  ): Promise<OperationWithContext[]> {
    const operations: OperationWithContext[] = [];
    let page = await this.replayFrom();

    for (;;) {
      for (const item of page.results) {
        if (item.context.ordinal <= maxOrdinal) operations.push(item);
      }
      if (
        page.results.some(({ context }) => context.ordinal >= maxOrdinal) ||
        !page.next
      ) {
        break;
      }
      page = await page.next();
    }

    return operations;
  }

  private sortAndDedupe(items: OperationWithContext[]): OperationWithContext[] {
    const byOrdinal = new Map<number, OperationWithContext>();
    for (const item of items) {
      byOrdinal.set(item.context.ordinal, item);
    }
    return [...byOrdinal.values()].sort(
      (left, right) => left.context.ordinal - right.context.ordinal,
    );
  }
}
