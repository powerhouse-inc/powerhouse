import type {
  DocumentModelDefinition,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  childLogger,
  inspectDocumentModelDefinition,
  operationsByActionType as modelOperationsByActionType,
  type DocumentModelDefinitionInspection,
  type StructuredOperation,
} from "document-model";

const logger = childLogger(["reactor-mcp", "model-operations"]);

type ModelSource = {
  readonly documentModel: Pick<DocumentModelModule["documentModel"], "global">;
  readonly definition?: unknown;
};

const logged = new Set<string>();

function inspect(module: ModelSource): DocumentModelDefinitionInspection {
  const inspection = inspectDocumentModelDefinition(module);
  if ("diagnostics" in inspection) {
    const documentType = module.documentModel.global.id;
    const key = `${documentType}\n${inspection.reason}`;
    if (!logged.has(key)) {
      logged.add(key);
      logger.warn(
        "Serving @type from its stored model; its definition is @reason: @diagnostics",
        documentType,
        inspection.reason,
        inspection.diagnostics.map((d) => d.message).join("; "),
      );
    }
  }
  return inspection;
}

export function structuredDefinition(
  module: ModelSource,
): DocumentModelDefinition | null {
  const inspection = inspect(module);
  return inspection.kind === "structured" ? inspection.definition : null;
}

/**
 * The operations of a model authored in code, keyed by action type; empty for
 * a model served from its stored specification. Callers consult it only for a
 * type that names no stored operation, so every stored name keeps main's
 * meaning.
 */
export function operationsByActionType(
  module: ModelSource,
): ReadonlyMap<string, StructuredOperation> {
  inspect(module);
  return modelOperationsByActionType(module);
}
