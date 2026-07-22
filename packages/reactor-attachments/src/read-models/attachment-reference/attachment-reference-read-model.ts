import {
  BaseReadModel,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IDocumentModelRegistry,
  type IOperationIndex,
  type IWriteCache,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import type { IAttachmentSchemaCompiler } from "../../reference-index/types.js";
import type {
  AttachmentReferenceInput,
  IAttachmentReferenceWriter,
} from "./types.js";

export const ATTACHMENT_REFERENCE_READ_MODEL_ID =
  "attachment-reference-read-model";

export class AttachmentReferenceReadModel extends BaseReadModel {
  private indexingQueue: Promise<void> = Promise.resolve();

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
    const result = this.indexingQueue.then(() =>
      this.indexOperationsInOrdinalOrder(items),
    );
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
    const pending = this.sortAndDedupe(
      incoming.filter(({ context }) => context.ordinal > this.lastOrdinal),
    );
    if (pending.length === 0) return;

    const incomingMax = pending[pending.length - 1]!.context.ordinal;
    let candidates = pending;

    if (!this.isContiguousThrough(candidates, incomingMax)) {
      const replayed = await this.loadThroughOrdinal(incomingMax);
      candidates = this.sortAndDedupe([...replayed, ...pending]);
    }

    const contiguous: OperationWithContext[] = [];
    let expectedOrdinal = this.lastOrdinal + 1;
    for (const item of candidates) {
      const ordinal = item.context.ordinal;
      if (ordinal < expectedOrdinal) continue;
      if (ordinal > expectedOrdinal || ordinal > incomingMax) break;
      contiguous.push(item);
      expectedOrdinal++;
    }

    if (expectedOrdinal <= incomingMax) {
      throw new Error(
        `Attachment reference read model cannot advance past missing ordinal ${expectedOrdinal}`,
      );
    }

    const previousOrdinal = this.lastOrdinal;
    try {
      await super.indexOperations(contiguous);
    } catch (error) {
      this.lastOrdinal = previousOrdinal;
      throw error;
    }
  }

  private isContiguousThrough(
    items: OperationWithContext[],
    maxOrdinal: number,
  ): boolean {
    let expectedOrdinal = this.lastOrdinal + 1;
    for (const item of items) {
      if (item.context.ordinal !== expectedOrdinal) return false;
      expectedOrdinal++;
    }
    return expectedOrdinal > maxOrdinal;
  }

  private async loadThroughOrdinal(
    maxOrdinal: number,
  ): Promise<OperationWithContext[]> {
    const operations: OperationWithContext[] = [];
    let page = await this.operationIndex.getSinceOrdinal(this.lastOrdinal);

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
