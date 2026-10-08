import type {
  AttachmentRef,
  IDocumentModelRegistry,
} from "@powerhousedao/reactor";
import {
  isPurgeMarker,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { AttachmentSchemaCompiler } from "../reference-index/attachment-schema-compiler.js";
import type { IAttachmentSchemaCompiler } from "../reference-index/types.js";
import type { IOperationAttachmentRefs } from "./types.js";

/**
 * The production {@link IOperationAttachmentRefs}: the compiled, schema-driven
 * extractor, reused rather than reimplemented.
 *
 * This is the same `(registry, compiler)` pair `AttachmentReferenceReadModel`
 * runs, so a ref the index records and a ref the replicator chases are found by
 * one piece of code -- including the compiler's per-module/per-action cache,
 * which is held by the compiler instance a host shares between the two. A host
 * with no read model to share one with takes the default compiler.
 *
 * Extraction failures do NOT propagate. A malformed ref or an unregistered
 * document type must not take down the event-bus subscriber the replicator
 * runs on: that would turn an attachment problem into a reactor-wide write
 * failure, since `IEventBus.emit` aggregates subscriber errors back to the
 * emitter. The read model is the component whose job is to refuse a bad ref
 * loudly; this one is a best-effort byte chaser, so it reports and moves on.
 */
export class SchemaCompiledOperationRefs implements IOperationAttachmentRefs {
  constructor(
    private readonly registry: IDocumentModelRegistry,
    private readonly compiler: IAttachmentSchemaCompiler = new AttachmentSchemaCompiler(),
    private readonly onDiagnostic: (
      message: string,
      error: unknown,
    ) => void = () => undefined,
  ) {}

  refsOf(item: OperationWithContext): readonly AttachmentRef[] {
    const { operation, context } = item;
    if (isPurgeMarker(operation) || operation.error !== undefined) {
      return [];
    }
    try {
      const module = this.registry.getModule(context.documentType);
      return this.compiler
        .forModuleAction(module, operation.action.type)
        .extract(operation.action);
    } catch (error) {
      this.onDiagnostic(
        `extracting attachment refs from ${context.documentType}/${operation.action.type} failed`,
        error,
      );
      return [];
    }
  }
}
