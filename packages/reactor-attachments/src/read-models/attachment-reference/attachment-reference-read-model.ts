import {
  BaseReadModel,
  defaultReadModelIndexingConfig,
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

/**
 * Indexes attachment references in chunks.
 *
 * Each reference row stands on its own and is written insert-or-do-nothing, so
 * a batch that commits in pieces exposes no partial structure, and re-indexing
 * the same range writes nothing new: the catch-up sweep needs no stream suffix.
 */
export class AttachmentReferenceReadModel extends BaseReadModel {
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
      indexing: defaultReadModelIndexingConfig,
      replayStreamSuffix: false,
    });
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
}
