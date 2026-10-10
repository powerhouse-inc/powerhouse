import type {
  DocumentModelModule,
  DocumentModelSpecificationDefinition,
  DocumentSpecification,
  FieldDefinition,
  GraphQLTypeSystemDefinitionNode,
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
  foldTypeExtensions,
  namedTypeInventory,
  packageScalarNames,
  printSchemaSegment,
  type StoredSegments,
} from "document-model";
import { isReferenceableScalarName } from "document-model/scalars";
import {
  type DefinitionNode,
  type DirectiveDefinitionNode,
  type DocumentNode,
  type InputObjectTypeDefinitionNode,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  Kind,
  parse,
  print,
  type TypeDefinitionNode,
} from "graphql";
import {
  hasValidSchema,
  moduleDescription,
  STATE_INPUT_TYPES_DESCRIPTION,
} from "./model-schema-templates.js";

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
  readonly types: readonly NamedGraphQLTypeDefinition[];
  readonly segments: Pick<StoredSegments, "global" | "local">;
  readonly packageScalars: ReadonlySet<string>;
  readonly layout: TemplateLayout;
  readonly hostDescriptions: ReadonlyMap<string, string>;
};

type TemplateLayout = {
  readonly modules: readonly {
    readonly name: string;
    readonly types: readonly NamedGraphQLTypeDefinition[];
  }[];
  readonly stateInputs: readonly NamedGraphQLTypeDefinition[];
  readonly scopes: {
    readonly global: readonly NamedGraphQLTypeDefinition[];
    readonly local: readonly NamedGraphQLTypeDefinition[];
  };
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
  const stateSegments = {
    global: inStoredOrder(segments.global, stored?.state.global.schema),
    local: inStoredOrder(segments.local, stored?.state.local.schema),
  };
  const extensionOnly = extensionOnlyTypeNames(
    specification.graphQLCompatibility,
  );
  const printable = (types: readonly NamedGraphQLTypeDefinition[]) =>
    types.filter((type) => !extensionOnly.has(type.name));
  const typesByName = new Map<string, NamedGraphQLTypeDefinition>(
    specification.types.map((type) => [type.name, type]),
  );
  for (const module_ of specification.modules) {
    for (const { input } of module_.operations) {
      if (input !== null) typesByName.set(input.name, input);
    }
  }
  const placement =
    stored === undefined
      ? undefined
      : readStoredPlacement(stored, typesByName, printable);
  const layout = placement?.layout ?? {
    modules: specification.modules.flatMap((module_) => {
      const types = printable(
        module_.operations.flatMap(
          (operation) =>
            segments.operations.get(`${module_.key}/${operation.key}`) ?? [],
        ),
      );
      return types.length === 0 ? [] : [{ name: module_.name, types }];
    }),
    stateInputs: printable(
      stateSegments.global.filter((type) => type.kind === "input"),
    ),
    scopes: stateSegments,
  };
  return {
    specification,
    types: [...typesByName.values()],
    segments: stateSegments,
    packageScalars: new Set(packageScalarNames(specification)),
    layout,
    hostDescriptions:
      placement?.hostDescriptions ?? canonicalHostDescriptions(layout),
  };
}

function canonicalHostDescriptions(
  layout: TemplateLayout,
): ReadonlyMap<string, string> {
  const described = [
    ...layout.modules.map(
      ({ name, types }) => [types[0], moduleDescription(name)] as const,
    ),
    ...layout.stateInputs
      .slice(0, 1)
      .map((type) => [type, STATE_INPUT_TYPES_DESCRIPTION] as const),
  ];
  return new Map(
    described.flatMap(([type, description]) =>
      type.description === null ? [[type.name, description] as const] : [],
    ),
  );
}

function definitionKey(definition: {
  readonly kind: string;
  readonly name: { readonly value: string };
}): string {
  return definition.kind === "DirectiveDefinition"
    ? `@${definition.name.value}`
    : definition.name.value;
}

function isDescribable(
  definition: DefinitionNode,
): definition is TypeDefinitionNode | DirectiveDefinitionNode {
  return (
    isTypeDefinitionNode(definition) ||
    definition.kind === Kind.DIRECTIVE_DEFINITION
  );
}

function storedDefinitions(
  sdl: string | null | undefined,
): readonly DefinitionNode[] {
  return sdl === null || sdl === undefined || sdl.trim() === ""
    ? []
    : parse(sdl, { noLocation: true }).definitions;
}

/**
 * Reads a retained schema-first serialization the way `storedModelProjection`
 * does, so both hosts print the same types in each template slot and describe
 * the same ones. The stored-SDL path is left untouched, so its rule is
 * mirrored here rather than shared.
 */
function readStoredPlacement(
  stored: DocumentSpecification,
  typesByName: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
  printable: (
    types: readonly NamedGraphQLTypeDefinition[],
  ) => readonly NamedGraphQLTypeDefinition[],
):
  | {
      readonly layout: TemplateLayout;
      readonly hostDescriptions: ReadonlyMap<string, string>;
    }
  | undefined {
  let parsed;
  try {
    parsed = {
      global: storedDefinitions(stored.state.global.schema),
      local: storedDefinitions(stored.state.local.schema),
      modules: stored.modules.map((module_) => ({
        name: module_.name,
        operations: module_.operations.map((operation) => ({
          valid: hasValidSchema(operation.schema),
          definitions: storedDefinitions(operation.schema),
        })),
      })),
    };
  } catch {
    return undefined;
  }

  const structuredTypes = (definitions: readonly DefinitionNode[]) =>
    definitions.flatMap((definition) => {
      const type = isTypeDefinitionNode(definition)
        ? typesByName.get(definition.name.value)
        : undefined;
      return type === undefined ? [] : [type];
    });
  const modules = parsed.modules.map(({ name, operations }) => ({
    name,
    definitions: operations.flatMap(({ valid, definitions }) =>
      valid ? definitions : [],
    ),
  }));
  const operationTypeNames = new Set(
    parsed.modules
      .flatMap(({ operations }) => operations)
      .flatMap(({ definitions }) => definitions)
      .flatMap((definition) =>
        isTypeDefinitionNode(definition) || isTypeExtensionNode(definition)
          ? [definition.name.value]
          : [],
      ),
  );

  const hostDescriptions = new Map<string, string>();
  const declared = new Set(
    [...parsed.global, ...parsed.local].flatMap((definition) =>
      isTypeDefinitionNode(definition) &&
      definition.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION
        ? [definitionKey(definition)]
        : [],
    ),
  );
  for (const { name, definitions } of modules) {
    const first = definitions.at(0);
    if (
      first !== undefined &&
      isDescribable(first) &&
      first.description === undefined &&
      !declared.has(definitionKey(first))
    ) {
      hostDescriptions.set(definitionKey(first), moduleDescription(name));
    }
    for (const definition of definitions) {
      if (isDescribable(definition)) declared.add(definitionKey(definition));
    }
  }
  const firstStateInput = parsed.global.find(
    (definition): definition is InputObjectTypeDefinitionNode =>
      definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      !operationTypeNames.has(definition.name.value),
  );
  if (firstStateInput !== undefined) {
    hostDescriptions.set(
      definitionKey(firstStateInput),
      STATE_INPUT_TYPES_DESCRIPTION,
    );
  }

  return {
    layout: {
      modules: modules.flatMap(({ name, definitions }) => {
        const types = structuredTypes(definitions);
        return types.length === 0 ? [] : [{ name, types }];
      }),
      stateInputs: inStoredOrder(
        printable(
          [...typesByName.values()].filter(
            (type) =>
              type.kind === "input" && !operationTypeNames.has(type.name),
          ),
        ),
        stored.state.global.schema,
      ),
      scopes: {
        global: structuredTypes(parsed.global),
        local: structuredTypes(parsed.local),
      },
    },
    hostDescriptions,
  };
}

type DescribableDefinition = Exclude<
  GraphQLTypeSystemDefinitionNode,
  { readonly kind: "SchemaDefinition" }
>;

export function withHostDescriptions(
  document: LocationFreeGraphQLDocumentNode,
  hostDescriptions: ReadonlyMap<string, string>,
): LocationFreeGraphQLDocumentNode {
  const pending = new Map(hostDescriptions);
  return {
    ...document,
    definitions: document.definitions.map((definition) => {
      if (
        definition.kind === "SchemaDefinition" ||
        !definition.kind.endsWith("Definition")
      ) {
        return definition;
      }
      const describable = definition as DescribableDefinition;
      const key = definitionKey(describable);
      const value = pending.get(key);
      if (value === undefined) return definition;
      pending.delete(key);
      return describable.description == null
        ? {
            ...describable,
            description: { kind: "StringValue", value, block: true },
          }
        : definition;
    }),
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

const UNDECLARED_DIRECTIVE = "equals";

function withoutUndeclaredDirectives<
  T extends FieldDefinition | InputFieldDefinition,
>(field: T): T {
  return field.directives === undefined
    ? field
    : {
        ...field,
        directives: field.directives.filter(
          ({ name }) => name !== UNDECLARED_DIRECTIVE,
        ),
      };
}

function isUndeclaredDirectiveUse(node: unknown): boolean {
  const use = node as {
    readonly kind?: unknown;
    readonly name?: { readonly value?: unknown };
  } | null;
  return use?.kind === "Directive" && use.name?.value === UNDECLARED_DIRECTIVE;
}

function renameField(field: FieldDefinition, rename: Renames): FieldDefinition {
  return withoutUndeclaredDirectives({
    ...field,
    type: renameReference(field.type, rename),
    ...(field.args !== undefined && {
      args: field.args.map((argument) => renameInputField(argument, rename)),
    }),
  });
}

function renameInputField(
  field: InputFieldDefinition,
  rename: Renames,
): InputFieldDefinition {
  return withoutUndeclaredDirectives({
    ...field,
    type: renameReference(field.type, rename),
  });
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
function namespaceTypes(
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

export function printNamespacedTypes(
  { types: modelTypes, packageScalars }: StructuredModel,
  types: readonly NamedGraphQLTypeDefinition[],
  prefix: string,
): string {
  return printSchemaSegment(
    namespaceTypes(types, prefix, packageScalars),
    namedTypeInventory(namespaceTypes(modelTypes, prefix, packageScalars)),
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
    if (Array.isArray(node)) {
      return node.filter((item) => !isUndeclaredDirectiveUse(item)).map(walk);
    }
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

export function definesObjectType(
  compatibility: DocumentModelSpecificationDefinition["graphQLCompatibility"],
  name: string,
): boolean {
  return (
    compatibility === null ||
    compatibility.document.definitions.some(
      (definition) =>
        definition.kind === "ObjectTypeDefinition" &&
        definition.name.value === name,
    )
  );
}

export function extensionOnlyTypeNames(
  compatibility: DocumentModelSpecificationDefinition["graphQLCompatibility"],
): ReadonlySet<string> {
  if (compatibility === null) return new Set();
  const { definitions } = compatibility.document;
  return new Set(
    [...foldTypeExtensions(definitions, []).types]
      .filter(([, { index }]) => definitions[index].kind.endsWith("Extension"))
      .map(([name]) => name),
  );
}

export function asStoredStateObjects(
  types: readonly NamedGraphQLTypeDefinition[],
  compatibility: DocumentModelSpecificationDefinition["graphQLCompatibility"],
): readonly NamedGraphQLTypeDefinition[] {
  if (compatibility === null) return types;
  const { definitions } = compatibility.document;
  const folded = foldTypeExtensions(definitions, []);
  return types.flatMap((type) => {
    const effective = folded.types.get(type.name);
    if (type.kind !== "object" || effective === undefined) return [type];
    if (definitions[effective.index].kind !== "ObjectTypeDefinition") return [];
    return [
      {
        ...type,
        fields: type.fields.filter(
          (field) =>
            (effective.contributors.get(`fields:${field.name}`) ??
              effective.index) === effective.index,
        ),
      },
    ];
  });
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
