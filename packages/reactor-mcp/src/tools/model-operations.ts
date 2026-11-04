import type {
  DocumentModelDefinition,
  DocumentModelModule,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import {
  childLogger,
  inspectDocumentModelDefinition,
  type DocumentModelDefinitionInspection,
} from "document-model";

const logger = childLogger(["reactor-mcp", "model-operations"]);

type ModelSource = {
  readonly documentModel: Pick<DocumentModelModule["documentModel"], "global">;
  readonly definition?: unknown;
};

export type StructuredOperation = {
  readonly storedName: string;
  readonly creatorKey: string;
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

// An inspected specification is a snapshot nothing mutates, so its index is
// built once.
const indexes = new WeakMap<
  DocumentModelSpecificationDefinition,
  ReadonlyMap<string, StructuredOperation>
>();

const NONE: ReadonlyMap<string, StructuredOperation> = new Map();

/**
 * The operations of a model authored in code, keyed by action type; empty for
 * a model served from its stored specification. Callers consult it only for a
 * type that names no stored operation, so every stored name keeps main's
 * meaning.
 */
export function operationsByActionType(
  module: ModelSource,
): ReadonlyMap<string, StructuredOperation> {
  const inspection = inspect(module);
  if (inspection.kind !== "structured") return NONE;
  const { specification } = inspection;
  let byActionType = indexes.get(specification);
  if (byActionType === undefined) {
    byActionType = new Map(
      specification.modules
        .flatMap((m) => m.operations)
        .map((operation) => [
          operation.actionType,
          {
            storedName: operation.name ?? operation.actionType,
            creatorKey: operation.creatorKey,
          },
        ]),
    );
    indexes.set(specification, byActionType);
  }
  return byActionType;
}
