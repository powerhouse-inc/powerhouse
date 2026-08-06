import type {
  DefinitionNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  ObjectTypeDefinitionNode,
} from "graphql";
import { Kind, parse, print } from "graphql";
import type {
  DocumentModelAction,
  DocumentSpecification,
  ModuleSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import { compareStringsWithoutWhitespace } from "./helpers.js";

export type StateShapeDiff = {
  addedFields: string[];
  removedFields: string[];
  changedFields: string[];
};

type FieldMap = Map<string, string>;
type TypeFields = Map<string, Map<string, string>>;

type ShapeTypeNode =
  | ObjectTypeDefinitionNode
  | InputObjectTypeDefinitionNode
  | EnumTypeDefinitionNode;

function isShapeTypeNode(node: DefinitionNode): node is ShapeTypeNode {
  return (
    node.kind === Kind.OBJECT_TYPE_DEFINITION ||
    node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
    node.kind === Kind.ENUM_TYPE_DEFINITION
  );
}

function collectTypeFields(doc: DocumentNode): TypeFields {
  const types: TypeFields = new Map();
  for (const definition of doc.definitions) {
    if (!isShapeTypeNode(definition)) continue;
    const fields = new Map<string, string>();
    if (definition.kind === Kind.ENUM_TYPE_DEFINITION) {
      for (const value of definition.values ?? []) {
        fields.set(value.name.value, "value");
      }
    } else {
      for (const field of definition.fields ?? []) {
        fields.set(field.name.value, print(field.type));
      }
    }
    types.set(definition.name.value, fields);
  }
  return types;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceTypeName(
  printedType: string,
  oldName: string,
  newName: string,
): string {
  return printedType.replace(
    new RegExp(`\\b${escapeRegExp(oldName)}\\b`, "g"),
    newName,
  );
}

function typeSignature(name: string, fields: Map<string, string>): string {
  return [...fields.entries()]
    .map(
      ([field, type]) => `${field}:${replaceTypeName(type, name, "__SELF__")}`,
    )
    .sort()
    .join("|");
}

function detectTypeRenames(
  oldTypes: TypeFields,
  newTypes: TypeFields,
): Map<string, string> {
  const renames = new Map<string, string>();
  const removed = [...oldTypes.keys()].filter((name) => !newTypes.has(name));
  const added = new Set(
    [...newTypes.keys()].filter((name) => !oldTypes.has(name)),
  );
  for (const oldName of removed) {
    const oldSignature = typeSignature(oldName, oldTypes.get(oldName)!);
    for (const newName of added) {
      if (typeSignature(newName, newTypes.get(newName)!) === oldSignature) {
        renames.set(oldName, newName);
        added.delete(newName);
        break;
      }
    }
  }
  return renames;
}

function flattenFields(
  types: TypeFields,
  renames: Map<string, string>,
): FieldMap {
  const fields: FieldMap = new Map();
  for (const [typeName, typeFields] of types) {
    const resolvedTypeName = renames.get(typeName) ?? typeName;
    for (const [fieldName, printedType] of typeFields) {
      let resolvedType = printedType;
      for (const [oldName, newName] of renames) {
        resolvedType = replaceTypeName(resolvedType, oldName, newName);
      }
      fields.set(`${resolvedTypeName}.${fieldName}`, resolvedType);
    }
  }
  return fields;
}

export function hasShapeChange(diff: StateShapeDiff): boolean {
  return (
    diff.addedFields.length > 0 ||
    diff.removedFields.length > 0 ||
    diff.changedFields.length > 0
  );
}

export function diffSdlShapes(oldSdl: string, newSdl: string): StateShapeDiff {
  const empty: StateShapeDiff = {
    addedFields: [],
    removedFields: [],
    changedFields: [],
  };
  let oldDoc: DocumentNode;
  let newDoc: DocumentNode;
  try {
    oldDoc = parse(oldSdl);
    newDoc = parse(newSdl);
  } catch {
    return empty;
  }
  const oldTypes = collectTypeFields(oldDoc);
  const newTypes = collectTypeFields(newDoc);
  const renames = detectTypeRenames(oldTypes, newTypes);
  const oldFields = flattenFields(oldTypes, renames);
  const newFields = flattenFields(newTypes, new Map());
  const diff: StateShapeDiff = {
    addedFields: [],
    removedFields: [],
    changedFields: [],
  };
  for (const [key, newType] of newFields) {
    const oldType = oldFields.get(key);
    if (oldType === undefined) {
      diff.addedFields.push(key);
    } else if (oldType !== newType) {
      diff.changedFields.push(`${key}: ${oldType} → ${newType}`);
    }
  }
  for (const key of oldFields.keys()) {
    if (!newFields.has(key)) {
      diff.removedFields.push(key);
    }
  }
  return diff;
}

export type ActionClassification =
  | { kind: "safe" }
  | { kind: "version-relevant"; reason: string; diff?: StateShapeDiff };

const SAFE: ActionClassification = { kind: "safe" };

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim() || value.trim() === "{}";
}

/**
 * True for a blank SDL, or an SDL whose types contain nothing but the
 * `_placeholder` field the editor seeds new state/operation schemas with
 * (see `makeInitialSchemaDoc` / `makeOperationInitialDoc` in ./helpers.ts).
 * Replacing a placeholder-only schema with real fields is a user's first
 * edit on a brand-new model, not a version-relevant change.
 */
function isPlaceholderOnlySchema(sdl: string): boolean {
  if (isBlank(sdl)) return true;
  let doc: DocumentNode;
  try {
    doc = parse(sdl);
  } catch {
    return false;
  }
  const types = collectTypeFields(doc);
  return [...types.values()].every(
    (fields) =>
      fields.size === 0 || (fields.size === 1 && fields.has("_placeholder")),
  );
}

function findOperation(
  spec: DocumentSpecification,
  operationId: string,
): OperationSpecification | undefined {
  for (const module of spec.modules) {
    const operation = module.operations.find((op) => op.id === operationId);
    if (operation) return operation;
  }
  return undefined;
}

function addedSinceLastRelease(
  operationId: string,
  previousSpec: DocumentSpecification | undefined,
): boolean {
  return (
    previousSpec !== undefined && !findOperation(previousSpec, operationId)
  );
}

function classifySetStateSchema(
  input: { schema: string; scope: string },
  latestSpec: DocumentSpecification,
): ActionClassification {
  const currentSchema =
    input.scope === "local"
      ? latestSpec.state.local.schema
      : latestSpec.state.global.schema;
  if (isPlaceholderOnlySchema(currentSchema)) return SAFE;
  const diff = diffSdlShapes(currentSchema, input.schema);
  if (!hasShapeChange(diff)) return SAFE;
  return {
    kind: "version-relevant",
    reason:
      input.scope === "local"
        ? `You're changing the local fields that version ${latestSpec.version} documents store.`
        : `You're changing the fields that version ${latestSpec.version} documents store.`,
    diff,
  };
}

/**
 * The editor pre-fills a fresh model's initial value from the placeholder
 * schema, so a value that is blank or carries only the `_placeholder` key is
 * still being initialized rather than changed.
 */
function isPlaceholderOnlyInitialValue(value: string): boolean {
  if (isBlank(value)) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  return Object.keys(parsed).every((key) => key === "_placeholder");
}

function classifySetInitialState(
  input: { initialValue: string; scope: string },
  latestSpec: DocumentSpecification,
): ActionClassification {
  const currentValue =
    input.scope === "local"
      ? latestSpec.state.local.initialValue
      : latestSpec.state.global.initialValue;
  if (isPlaceholderOnlyInitialValue(currentValue)) return SAFE;
  if (compareStringsWithoutWhitespace(currentValue, input.initialValue)) {
    return SAFE;
  }
  return {
    kind: "version-relevant",
    reason: `You're changing the starting content that version ${latestSpec.version} documents are built on.`,
  };
}

function classifyOperationChange(
  action: DocumentModelAction,
  operationId: string,
  latestSpec: DocumentSpecification,
  previousSpec: DocumentSpecification | undefined,
): ActionClassification {
  if (addedSinceLastRelease(operationId, previousSpec)) return SAFE;
  const operation = findOperation(latestSpec, operationId);
  if (!operation) return SAFE;
  const operationLabel = operation.name || "an operation";
  switch (action.type) {
    case "DELETE_OPERATION":
      return {
        kind: "version-relevant",
        reason: `You're removing the "${operationLabel}" operation from version ${latestSpec.version}.`,
      };
    case "SET_OPERATION_NAME": {
      if (isBlank(operation.name)) return SAFE;
      return {
        kind: "version-relevant",
        reason: `You're renaming the "${operationLabel}" operation in version ${latestSpec.version}.`,
      };
    }
    case "SET_OPERATION_SCHEMA": {
      if (isPlaceholderOnlySchema(operation.schema ?? "")) return SAFE;
      if (isBlank(action.input.schema)) {
        return {
          kind: "version-relevant",
          reason: `You're changing the information that the "${operationLabel}" operation accepts in version ${latestSpec.version}.`,
        };
      }
      const diff = diffSdlShapes(
        operation.schema ?? "",
        action.input.schema ?? "",
      );
      if (!hasShapeChange(diff)) return SAFE;
      return {
        kind: "version-relevant",
        reason: `You're changing the information that the "${operationLabel}" operation accepts in version ${latestSpec.version}.`,
        diff,
      };
    }
    default:
      return SAFE;
  }
}

function classifyDeleteModule(
  moduleId: string,
  latestSpec: DocumentSpecification,
  previousSpec: DocumentSpecification | undefined,
): ActionClassification {
  const module: ModuleSpecification | undefined = latestSpec.modules.find(
    (candidate) => candidate.id === moduleId,
  );
  if (!module || module.operations.length === 0) return SAFE;
  const allAddedSinceRelease = module.operations.every((operation) =>
    addedSinceLastRelease(operation.id, previousSpec),
  );
  if (allAddedSinceRelease) return SAFE;
  return {
    kind: "version-relevant",
    reason: `You're removing the "${module.name}" module and all of its operations from version ${latestSpec.version}.`,
  };
}

/**
 * Classifies a document-model action as version-relevant (would break
 * documents created with the current version) or safe. `previousSpec` is the
 * last released specification, used to exempt operations added since the
 * release.
 */
export function classifyDocumentModelAction(
  action: DocumentModelAction,
  latestSpec: DocumentSpecification,
  previousSpec?: DocumentSpecification,
): ActionClassification {
  switch (action.type) {
    case "SET_STATE_SCHEMA":
      return classifySetStateSchema(action.input, latestSpec);
    case "SET_INITIAL_STATE":
      return classifySetInitialState(action.input, latestSpec);
    case "DELETE_OPERATION":
    case "SET_OPERATION_NAME":
    case "SET_OPERATION_SCHEMA":
      return classifyOperationChange(
        action,
        action.input.id,
        latestSpec,
        previousSpec,
      );
    case "DELETE_MODULE":
      return classifyDeleteModule(action.input.id, latestSpec, previousSpec);
    default:
      return SAFE;
  }
}

export type DispatchDecision =
  | { kind: "dispatch" }
  | { kind: "prompt"; reason: string; diff?: StateShapeDiff };

/**
 * Pure decision core of the version advisory: given the actions about to be
 * dispatched, decide whether to dispatch immediately or prompt the user.
 */
export function decideDispatch(
  actions: DocumentModelAction[],
  latestSpec: DocumentSpecification,
  previousSpec: DocumentSpecification | undefined,
  hasSessionChoice: boolean,
): DispatchDecision {
  if (hasSessionChoice) return { kind: "dispatch" };
  for (const action of actions) {
    const classification = classifyDocumentModelAction(
      action,
      latestSpec,
      previousSpec,
    );
    if (classification.kind === "version-relevant") {
      return {
        kind: "prompt",
        reason: classification.reason,
        diff: classification.diff,
      };
    }
  }
  return { kind: "dispatch" };
}
