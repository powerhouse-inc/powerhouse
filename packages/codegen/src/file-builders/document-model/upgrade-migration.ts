import { getPHCustomScalarByTypeName } from "@powerhousedao/document-engineering/graphql";
import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import type {
  DocumentNode,
  EnumTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  TypeDefinitionNode,
  TypeNode,
} from "graphql";
import { Kind, parse, print } from "graphql";

export type ScopeFill = Record<string, unknown>;

/**
 * How the generated upgrade transition migrates state from the previous
 * version. "fill" carries per-scope objects of added fields with their
 * initial values; "manual" means the schema difference cannot be migrated
 * mechanically and the generated reducer must throw until hand-written.
 */
export type MigrationPlan =
  | { kind: "fill"; fills: { global?: ScopeFill; local?: ScopeFill } }
  | { kind: "manual"; reason: string };

type ScopeAnalysis =
  | { kind: "fill"; fill: ScopeFill | undefined }
  | { kind: "manual"; reason: string };

/**
 * Derives the migration between two consecutive spec versions. Mechanical
 * changes — field additions on the scope's state type (initialized from the
 * new version's initial value, falling back to the schema's zero value) and
 * field removals — produce a "fill" plan. Anything else (changed field
 * types, edits to nested types that pre-existing documents reference,
 * additions codegen cannot synthesize a value for) produces a "manual" plan.
 */
export function buildMigrationPlan(args: {
  previousSpec: DocumentSpecification | undefined;
  specification: DocumentSpecification;
  stateName: string;
  localStateName: string;
}): MigrationPlan {
  const { previousSpec, specification, stateName, localStateName } = args;

  if (!previousSpec) {
    return {
      kind: "manual",
      reason: "the previous specification version is not available",
    };
  }

  const fills: { global?: ScopeFill; local?: ScopeFill } = {};
  const scopes = [
    { scope: "global" as const, typeName: stateName },
    { scope: "local" as const, typeName: localStateName },
  ];

  for (const { scope, typeName } of scopes) {
    const oldState = previousSpec.state[scope];
    const newState = specification.state[scope];
    const analysis = analyzeScope({
      oldSchema: oldState?.schema ?? "",
      newSchema: newState?.schema ?? "",
      newInitialValue: newState?.initialValue ?? "",
      typeName,
      scope,
    });
    if (analysis.kind === "manual") {
      return analysis;
    }
    if (analysis.fill && Object.keys(analysis.fill).length > 0) {
      fills[scope] = analysis.fill;
    }
  }

  return { kind: "fill", fills };
}

function analyzeScope(args: {
  oldSchema: string;
  newSchema: string;
  newInitialValue: string;
  typeName: string;
  scope: string;
}): ScopeAnalysis {
  const { oldSchema, newSchema, newInitialValue, typeName, scope } = args;

  const oldDoc = safeParseSdl(oldSchema);
  const newDoc = safeParseSdl(newSchema);
  if (oldSchema.trim() && !oldDoc) {
    return {
      kind: "manual",
      reason: `the previous ${scope} state schema could not be parsed`,
    };
  }
  if (newSchema.trim() && !newDoc) {
    return {
      kind: "manual",
      reason: `the new ${scope} state schema could not be parsed`,
    };
  }

  const oldType = oldDoc ? findObjectType(oldDoc, typeName) : undefined;
  const newType = newDoc ? findObjectType(newDoc, typeName) : undefined;

  // Scope absent in the new version, or never defined: nothing to migrate.
  if (!newType || !newDoc) {
    return { kind: "fill", fill: undefined };
  }

  // Nested types that pre-existing documents already contain must be
  // unchanged: codegen cannot rewrite existing data.
  if (oldType && oldDoc) {
    const oldReachable = collectReachableTypes(oldDoc, typeName);
    for (const [name, oldDefinition] of oldReachable) {
      if (name === typeName) continue;
      const newDefinition = findTypeDefinition(newDoc, name);
      if (!newDefinition) continue; // only reachable via removed fields
      if (print(oldDefinition) !== print(newDefinition)) {
        return {
          kind: "manual",
          reason: `the ${scope} state type "${name}" changed between versions`,
        };
      }
    }
  }

  const oldFields = new Map(
    (oldType?.fields ?? []).map((field) => [field.name.value, field]),
  );
  const newFields = newType.fields ?? [];
  const initialValueObject = safeParseJsonRecord(newInitialValue);

  const fill: ScopeFill = {};
  for (const field of newFields) {
    const fieldName = field.name.value;
    const oldField = oldFields.get(fieldName);
    if (oldField) {
      if (print(oldField.type) !== print(field.type)) {
        return {
          kind: "manual",
          reason: `the ${scope} state field "${fieldName}" changed type between versions`,
        };
      }
      continue;
    }

    // Prefer the value the model author put in the new version's initial
    // value (the model editor keeps it in sync with the schema); fall back
    // to the schema's zero value.
    if (initialValueObject && fieldName in initialValueObject) {
      fill[fieldName] = initialValueObject[fieldName];
      continue;
    }
    const zero = zeroValueForType(field.type, newDoc, new Set());
    if (!zero.ok) {
      return {
        kind: "manual",
        reason: `no initial value could be derived for the added ${scope} state field "${fieldName}"`,
      };
    }
    fill[fieldName] = zero.value;
  }

  return { kind: "fill", fill };
}

type ZeroValueResult = { ok: true; value: unknown } | { ok: false };

function zeroValueForType(
  typeNode: TypeNode,
  schemaDoc: DocumentNode,
  visitedTypes: Set<string>,
): ZeroValueResult {
  if (typeNode.kind !== Kind.NON_NULL_TYPE) {
    return { ok: true, value: null };
  }

  const inner = typeNode.type;
  if (inner.kind === Kind.LIST_TYPE) {
    return { ok: true, value: [] };
  }

  const name = inner.name.value;
  switch (name) {
    case "String":
    case "ID":
      return { ok: true, value: "" };
    case "Int":
    case "Float":
      return { ok: true, value: 0 };
    case "Boolean":
      return { ok: true, value: false };
  }

  const definition = findTypeDefinition(schemaDoc, name);
  if (!definition) {
    const scalar = getPHCustomScalarByTypeName(name);
    const defaultValue = scalar?.getDefaultValue?.();
    if (defaultValue !== undefined) {
      return { ok: true, value: defaultValue };
    }
    return { ok: false };
  }

  if (definition.kind === Kind.ENUM_TYPE_DEFINITION) {
    return zeroValueForEnum(definition);
  }
  if (definition.kind === Kind.OBJECT_TYPE_DEFINITION) {
    if (visitedTypes.has(name)) {
      return { ok: false };
    }
    visitedTypes.add(name);
    const value: Record<string, unknown> = {};
    for (const field of definition.fields ?? []) {
      const fieldZero = zeroValueForType(field.type, schemaDoc, visitedTypes);
      if (!fieldZero.ok) {
        return { ok: false };
      }
      value[field.name.value] = fieldZero.value;
    }
    visitedTypes.delete(name);
    return { ok: true, value };
  }
  if (definition.kind === Kind.SCALAR_TYPE_DEFINITION) {
    const scalar = getPHCustomScalarByTypeName(name);
    const defaultValue = scalar?.getDefaultValue?.();
    if (defaultValue !== undefined) {
      return { ok: true, value: defaultValue };
    }
    return { ok: false };
  }

  // unions, interfaces: no mechanical zero value
  return { ok: false };
}

function zeroValueForEnum(definition: EnumTypeDefinitionNode): ZeroValueResult {
  const first = definition.values?.[0]?.name.value;
  if (first === undefined) {
    return { ok: false };
  }
  return { ok: true, value: first };
}

function collectReachableTypes(
  schemaDoc: DocumentNode,
  rootTypeName: string,
): Map<string, TypeDefinitionNode> {
  const reachable = new Map<string, TypeDefinitionNode>();
  const queue = [rootTypeName];

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (reachable.has(name)) continue;
    const definition = findTypeDefinition(schemaDoc, name);
    if (!definition) continue;
    reachable.set(name, definition);

    if (definition.kind === Kind.OBJECT_TYPE_DEFINITION) {
      for (const field of definition.fields ?? []) {
        queue.push(namedTypeOf(field.type));
      }
    } else if (definition.kind === Kind.UNION_TYPE_DEFINITION) {
      for (const member of definition.types ?? []) {
        queue.push(member.name.value);
      }
    }
  }

  return reachable;
}

function namedTypeOf(typeNode: TypeNode): string {
  let node = typeNode;
  while (node.kind !== Kind.NAMED_TYPE) {
    node = node.type;
  }
  return node.name.value;
}

function findObjectType(
  schemaDoc: DocumentNode,
  name: string,
): ObjectTypeDefinitionNode | undefined {
  const definition = findTypeDefinition(schemaDoc, name);
  return definition?.kind === Kind.OBJECT_TYPE_DEFINITION
    ? definition
    : undefined;
}

function findTypeDefinition(
  schemaDoc: DocumentNode,
  name: string,
): TypeDefinitionNode | undefined {
  for (const definition of schemaDoc.definitions) {
    switch (definition.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.ENUM_TYPE_DEFINITION:
      case Kind.SCALAR_TYPE_DEFINITION:
      case Kind.UNION_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_DEFINITION:
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        if (definition.name.value === name) {
          return definition;
        }
    }
  }
  return undefined;
}

function safeParseSdl(sdl: string): DocumentNode | null {
  if (!sdl.trim()) return null;
  try {
    return parse(sdl);
  } catch {
    return null;
  }
}

function safeParseJsonRecord(json: string): Record<string, unknown> | null {
  if (!json.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Serializes a fill value to TypeScript source. Fill values come from JSON
 * (initial values) or the zero-value synthesizer, so JSON serialization is
 * sufficient.
 */
export function fillToTsLiteral(fill: ScopeFill): string {
  return JSON.stringify(fill, null, 2);
}
