import type {
  DocumentNode,
  EnumTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  ObjectTypeDefinitionNode,
} from "graphql";
import { Kind, parse, print } from "graphql";

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

function isShapeTypeNode(node: { kind: string }): node is ShapeTypeNode {
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
    .map(([field, type]) => `${field}:${replaceTypeName(type, name, "__SELF__")}`)
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

function flattenFields(types: TypeFields, renames: Map<string, string>): FieldMap {
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
