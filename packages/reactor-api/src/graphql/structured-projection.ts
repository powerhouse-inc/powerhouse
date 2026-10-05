import type {
  DocumentModelModule,
  DocumentModelSpecificationDefinition,
  FieldDefinition,
  InputFieldDefinition,
  InputTypeDefinition,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import {
  assignStoredSegments,
  checkDocumentModelDefinitionShape,
  DefinitionDiagnosticCollector,
  packageScalarNames,
  type StoredSegments,
} from "document-model";
import { isReferenceableScalarName } from "document-model/scalars";
import { parse, print, type DocumentNode } from "graphql";

/**
 * A code-first model's GraphQL types, projected from its structured definition
 * instead of regex over stored SDL. A regex cannot tell a scalar from an
 * object type, or a type name from a matching field name or description text.
 * The output must match the stored-SDL path exactly for any model both paths
 * can describe.
 */
export type StructuredModel = {
  /**
   * The latest specification, as the stored-SDL path does with
   * `specifications.at(-1)`, so a versioned model emits one set of types.
   */
  readonly specification: DocumentModelSpecificationDefinition;
  readonly segments: StoredSegments;
  readonly packageScalars: ReadonlySet<string>;
};

const structuredModels = new WeakMap<
  DocumentModelModule,
  StructuredModel | null
>();

/**
 * Returns the structured model the host projects for this module, or `null`
 * when the module carries no definition that matches the V1 wire shape. Such a
 * module uses the stored-SDL path, so a malformed definition cannot stop the
 * model from registering.
 */
export function structuredModelOf(
  module: DocumentModelModule,
): StructuredModel | null {
  if (!structuredModels.has(module)) {
    structuredModels.set(module, readStructuredModel(module));
  }
  return structuredModels.get(module) ?? null;
}

function readStructuredModel(
  module: DocumentModelModule,
): StructuredModel | null {
  const definition = (module as { definition?: unknown }).definition;
  if (
    definition === undefined ||
    !checkDocumentModelDefinitionShape(
      new DefinitionDiagnosticCollector(),
      definition,
    )
  ) {
    return null;
  }
  const specification =
    definition.specifications[definition.specifications.length - 1];
  const segments = assignStoredSegments({
    types: specification.types,
    globalRoot: specification.state.global.root.name,
    localRoot: specification.state.local.root?.name ?? null,
    operations: specification.modules.flatMap((module_) =>
      module_.operations.map((operation) => ({
        key: `${module_.key}/${operation.key}`,
        input: operation.input,
      })),
    ),
  });
  // The stored-SDL path emits types in stored order. Only a retained
  // schema-first serialization can order them differently from the definition.
  const stored =
    definition.compatibility.serialization === "explicit-schema-first"
      ? module.documentModel.global.specifications.at(-1)
      : undefined;
  const storedOperationSchemas = new Map(
    stored?.modules.flatMap((storedModule) =>
      storedModule.operations.map((operation) => [
        operation.id,
        operation.schema ?? undefined,
      ]),
    ),
  );
  return {
    specification,
    segments: {
      global: inStoredOrder(segments.global, stored?.state.global.schema),
      local: inStoredOrder(segments.local, stored?.state.local.schema),
      operations: new Map(
        specification.modules.flatMap((module_) =>
          module_.operations.flatMap((operation) => {
            const key = `${module_.key}/${operation.key}`;
            const types = segments.operations.get(key);
            return types === undefined
              ? []
              : [
                  [
                    key,
                    inStoredOrder(
                      types,
                      storedOperationSchemas.get(operation.id),
                    ),
                  ] as const,
                ];
          }),
        ),
      ),
    },
    packageScalars: new Set(packageScalarNames(specification)),
  };
}

function inStoredOrder(
  types: readonly NamedGraphQLTypeDefinition[],
  schema: string | undefined,
): readonly NamedGraphQLTypeDefinition[] {
  if (schema === undefined) return types;
  let names: readonly string[];
  try {
    names = parse(schema, { noLocation: true }).definitions.flatMap(
      (definition) =>
        "name" in definition && definition.name !== undefined
          ? [definition.name.value]
          : [],
    );
  } catch {
    return types;
  }
  const position = (name: string): number => {
    const index = names.indexOf(name);
    return index === -1 ? names.length : index;
  };
  return [...types].sort((a, b) => position(a.name) - position(b.name));
}

type Rename = (name: string) => string;

type Renames = { readonly type: Rename; readonly scalar: Rename };

function renameReference(
  reference: TypeReferenceDefinition,
  rename: Renames,
): TypeReferenceDefinition {
  switch (reference.kind) {
    case "list":
      return { ...reference, item: renameReference(reference.item, rename) };
    case "named":
      return { ...reference, name: rename.type(reference.name) };
    case "scalar":
      // A catalog scalar keeps its name because the host declares it. A
      // package scalar belongs to the model and takes the model prefix like
      // its types.
      return { ...reference, name: rename.scalar(reference.name) };
  }
}

function renameField(field: FieldDefinition, rename: Renames): FieldDefinition {
  return {
    ...field,
    type: renameReference(field.type, rename),
    ...(field.args !== undefined && {
      args: field.args.map((argument) => renameInputField(argument, rename)),
    }),
  };
}

function renameInputField(
  field: InputFieldDefinition,
  rename: Renames,
): InputFieldDefinition {
  return { ...field, type: renameReference(field.type, rename) };
}

function renameNamedType(
  definition: NamedGraphQLTypeDefinition,
  rename: Renames,
): NamedGraphQLTypeDefinition {
  const named = { ...definition, name: rename.type(definition.name) };
  switch (named.kind) {
    case "enum":
      return named;
    case "union":
      return { ...named, members: named.members.map(rename.type) };
    case "input":
      return {
        ...named,
        fields: named.fields.map((field) => renameInputField(field, rename)),
      };
    case "object":
    case "interface":
      return {
        ...named,
        ...(named.implements !== undefined && {
          implements: named.implements.map(rename.type),
        }),
        fields: named.fields.map((field) => renameField(field, rename)),
      };
  }
}

/**
 * Namespaces every type in a segment under the host's per-model prefix, and
 * every reference to one of the model's package scalars with it.
 */
export function namespaceTypes(
  types: readonly NamedGraphQLTypeDefinition[],
  prefix: string,
  packageScalars: ReadonlySet<string>,
): readonly NamedGraphQLTypeDefinition[] {
  const type: Rename = (name) => `${prefix}_${name}`;
  const scalar: Rename = (name) =>
    packageScalars.has(name) ? type(name) : name;
  return types.map((definition) =>
    renameNamedType(definition, { type, scalar }),
  );
}

const NAMED_DEFINITION_KINDS = new Set([
  "ObjectTypeDefinition",
  "InterfaceTypeDefinition",
  "UnionTypeDefinition",
  "EnumTypeDefinition",
  "InputObjectTypeDefinition",
  "ScalarTypeDefinition",
  "ObjectTypeExtension",
  "InterfaceTypeExtension",
  "UnionTypeExtension",
  "EnumTypeExtension",
  "InputObjectTypeExtension",
  "ScalarTypeExtension",
]);

/**
 * Namespaces a recorded compatibility document. A retained GraphQL AST is the
 * whole projection. It may hold schema definitions, directive definitions, and
 * type extensions that the descriptor grammar cannot express, and each must
 * reach the host in its recorded order.
 */
export function printCompatibilityDocument(
  document: LocationFreeGraphQLDocumentNode,
  prefix: string,
  packageScalars: ReadonlySet<string>,
): string {
  const declaredTypes = new Set<string>();
  const declaredScalars = new Set<string>();
  for (const definition of document.definitions) {
    if (definition.kind === "ScalarTypeDefinition") {
      declaredScalars.add(definition.name.value);
    } else if (
      "name" in definition &&
      NAMED_DEFINITION_KINDS.has(definition.kind) &&
      definition.kind !== "ScalarTypeExtension"
    ) {
      declaredTypes.add(definition.name.value);
    }
  }
  const rename = (name: string): string =>
    !packageScalars.has(name) &&
    !declaredTypes.has(name) &&
    (declaredScalars.has(name) || isReferenceableScalarName(name))
      ? name
      : `${prefix}_${name}`;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    const walked = Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, walk(value)]),
    );
    const name = record.name as { kind: string; value: string } | undefined;
    const isNamed =
      record.kind === "NamedType" ||
      (typeof record.kind === "string" &&
        NAMED_DEFINITION_KINDS.has(record.kind));
    return isNamed && name !== undefined
      ? { ...walked, name: { ...name, value: rename(name.value) } }
      : walked;
  };
  return print(walk(document) as DocumentNode);
}

/**
 * Converts each state object into the input type the new API's initial-state
 * argument takes. Every field becomes optional, object references take the
 * `Input` suffix, and union or interface references become `JSONObject`
 * because GraphQL has no input unions. The output matches the stored-SDL path
 * field for field.
 */
export function initialStateInputTypes(
  types: readonly NamedGraphQLTypeDefinition[],
  excluded: ReadonlySet<string>,
): readonly InputTypeDefinition[] {
  const objects = new Set<string>();
  const abstract = new Set<string>();
  const existingInputs = new Set<string>();
  for (const type of types) {
    if (type.kind === "object") objects.add(type.name);
    if (type.kind === "union" || type.kind === "interface") {
      abstract.add(type.name);
    }
    if (type.kind === "input") existingInputs.add(type.name);
  }

  const convert = (
    reference: TypeReferenceDefinition,
  ): TypeReferenceDefinition => {
    switch (reference.kind) {
      case "list":
        // The string path drops the inner non-null marker with the outer one.
        return { kind: "list", required: false, item: convert(reference.item) };
      case "scalar":
        return { ...reference, required: false };
      case "named":
        if (objects.has(reference.name)) {
          return {
            kind: "named",
            name: `${reference.name}Input`,
            required: false,
          };
        }
        if (abstract.has(reference.name)) {
          return { kind: "scalar", name: "JSONObject", required: false };
        }
        return { ...reference, required: false };
    }
  };

  const inputs: InputTypeDefinition[] = [];
  for (const type of types) {
    if (type.kind !== "object" || type.fields.length === 0) continue;
    const name = `${type.name}Input`;
    if (existingInputs.has(name) || excluded.has(name)) continue;
    inputs.push({
      kind: "input",
      name,
      description: null,
      unknownKeys: "preserve",
      fields: type.fields.map((field) => ({
        key: field.key,
        name: field.name,
        description: null,
        deprecated: null,
        type: convert(field.type),
      })),
    });
  }
  return inputs;
}
