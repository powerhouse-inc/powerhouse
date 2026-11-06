import type {
  DefinitionDiagnostic,
  DocumentModelDefinition,
  DocumentModelSpecificationDefinition,
} from "@powerhousedao/shared/document-model";
import {
  type CompilerDiagnosticCode,
  compilerDiagnostics,
} from "../compiler/diagnostic-codes.js";
import { definitionModuleMismatch } from "../compiler/module-definition.js";
import { checkDocumentModelDefinitionShape } from "../compiler/wire-shape.js";
import { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";

export type DocumentModelDefinitionInspection =
  | {
      readonly kind: "structured";
      readonly definition: DocumentModelDefinition;
      readonly specification: DocumentModelSpecificationDefinition;
    }
  | { readonly kind: "stored"; readonly reason: "absent" | "retained" }
  | {
      readonly kind: "stored";
      readonly reason: "invalid" | "mismatch";
      readonly diagnostics: readonly DefinitionDiagnostic[];
    };

export type InspectableDocumentModelModule = {
  readonly documentModel: { readonly global: { readonly id: string } };
  readonly version?: unknown;
  readonly definition?: unknown;
};

const REPAIR =
  "Materialize the module and its definition from the same declaration, and export the module materialize returned.";

function keepsSchemaFirstText(
  definition: DocumentModelDefinition,
  specification: DocumentModelSpecificationDefinition,
): boolean {
  return (
    definition.compatibility.serialization !== "canonical-v1" ||
    specification.graphQLCompatibility !== null
  );
}

type ReadDefinition =
  | { readonly kind: "absent" }
  | { readonly kind: "read"; readonly value: unknown }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly DefinitionDiagnostic[];
    };

// A definition is a value: it is checked once per object, and a host that
// changes it replaces the object.
const checkedDefinitions = new WeakMap<object, ReadDefinition>();

function readDefinition(
  module: InspectableDocumentModelModule,
): ReadDefinition {
  let read: unknown;
  try {
    read = module.definition;
  } catch (error) {
    return unreadable(error);
  }
  if (read === undefined) return { kind: "absent" };
  if (typeof read !== "object" || read === null) return checkedSnapshot(read);
  let checked = checkedDefinitions.get(read);
  if (checked === undefined) {
    checked = checkedSnapshot(read);
    checkedDefinitions.set(read, checked);
  }
  return checked;
}

function checkedSnapshot(read: unknown): ReadDefinition {
  try {
    // Getters and proxies run here, inside the boundary; every later reader
    // gets inert data.
    const value: unknown = structuredClone(read);
    const diagnostics = checkDocumentModelDefinitionShape(value, [
      "definition",
    ]);
    if (diagnostics.length > 0) return { kind: "invalid", diagnostics };
    return { kind: "read", value: deepFreeze(value) };
  } catch (error) {
    return unreadable(error);
  }
}

// The snapshot is shared by every later inspection of the same definition, so
// a reader that edits what it was handed cannot change what others see.
function deepFreeze<T>(value: T): T {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next !== "object" || next === null || Object.isFrozen(next)) {
      continue;
    }
    Object.freeze(next);
    pending.push(...Object.values(next as Record<string, unknown>));
  }
  return value;
}

function unreadable(error: unknown): ReadDefinition {
  const thrown = describeThrown(error);
  const collector = new DefinitionDiagnosticCollector<CompilerDiagnosticCode>(
    compilerDiagnostics,
  );
  collector.add({
    code: "PH-DM-DECLARATION-INVALID",
    path: ["definition"],
    message: `The structured definition cannot be read: ${thrown.message}`,
    expected: "a finite, plain JSON definition",
    received: thrown.name,
    repair: REPAIR,
  });
  return { kind: "invalid", diagnostics: collector.diagnostics };
}

function describeThrown(error: unknown): { message: string; name: string } {
  try {
    return error instanceof Error
      ? { message: String(error.message), name: String(error.name) }
      : { message: String(error), name: typeof error };
  } catch {
    return {
      message: "a thrown value that cannot be described",
      name: typeof error,
    };
  }
}

/**
 * Reads the structured definition a module carries. `structured` holds the
 * specification the stored path serves, `specifications.at(-1)`. A module
 * without a valid, matching, canonically serialized definition is served from
 * its stored model.
 */
export function inspectDocumentModelDefinition(
  module: InspectableDocumentModelModule,
): DocumentModelDefinitionInspection {
  const read = readDefinition(module);
  if (read.kind === "absent") return { kind: "stored", reason: "absent" };
  if (read.kind === "invalid") {
    return { kind: "stored", reason: "invalid", diagnostics: read.diagnostics };
  }
  const definition = read.value as DocumentModelDefinition;
  const { version } = module;
  const mismatch = definitionModuleMismatch(
    definition,
    {
      documentType: module.documentModel.global.id,
      version: typeof version === "number" ? version : undefined,
    },
    ["definition"],
  );
  if (mismatch !== undefined) {
    const collector = new DefinitionDiagnosticCollector<CompilerDiagnosticCode>(
      compilerDiagnostics,
    );
    collector.add(mismatch);
    return {
      kind: "stored",
      reason: "mismatch",
      diagnostics: collector.diagnostics,
    };
  }
  const specification = definition.specifications.at(
    -1,
  ) as DocumentModelSpecificationDefinition;
  if (keepsSchemaFirstText(definition, specification)) {
    return { kind: "stored", reason: "retained" };
  }
  return { kind: "structured", definition, specification };
}

/**
 * An operation of a model authored in code: the name it is stored under and
 * the key of its action creator.
 *
 * @experimental
 */
export type StructuredOperation = {
  readonly storedName: string;
  readonly creatorKey: string;
};

// An inspected specification is a snapshot nothing mutates, so its index is
// built once.
const operationIndexes = new WeakMap<
  DocumentModelSpecificationDefinition,
  ReadonlyMap<string, StructuredOperation>
>();

const NO_OPERATIONS: ReadonlyMap<string, StructuredOperation> = new Map();

/**
 * The operations of a model authored in code, keyed by action type. Empty for
 * a model served from its stored specification, whose operations are stored
 * under their action types.
 *
 * @experimental
 */
export function operationsByActionType(
  module: InspectableDocumentModelModule,
): ReadonlyMap<string, StructuredOperation> {
  const inspection = inspectDocumentModelDefinition(module);
  if (inspection.kind !== "structured") return NO_OPERATIONS;
  const { specification } = inspection;
  let byActionType = operationIndexes.get(specification);
  if (byActionType === undefined) {
    byActionType = new Map(
      specification.modules
        .flatMap((specModule) => specModule.operations)
        .map((operation) => [
          operation.actionType,
          {
            storedName: operation.name ?? operation.actionType,
            creatorKey: operation.creatorKey,
          },
        ]),
    );
    operationIndexes.set(specification, byActionType);
  }
  return byActionType;
}
