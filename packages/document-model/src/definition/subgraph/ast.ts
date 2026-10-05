import type {
  DefinitionDiagnostic,
  InputFieldDefinition,
  JsonValue,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  SubgraphEntryDefinition,
  SubgraphScalarReferenceDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { DefinitionDiagnosticCollector } from "../diagnostics.js";
import { compareCodeUnits } from "../primitives.js";
import { SCALAR_CATALOG_NAMES } from "../scalars/catalog.js";
import type { ScalarBinding } from "../scalars/types.js";
import { DescriptorWalk, orderedPackageScalars } from "../structured.js";
import type { AnyFieldDescriptor, ObjectFields } from "../types.js";
import { readEntry, type RegisteredEntry } from "./entries.js";

const ROOT_TYPES = ["Query", "Mutation", "Subscription"] as const;

type RootName = (typeof ROOT_TYPES)[number];

export function isRootTypeName(name: string): name is RootName {
  return (ROOT_TYPES as readonly string[]).includes(name);
}

export type SubgraphSchemaData = {
  readonly types: readonly NamedGraphQLTypeDefinition[];
  readonly entries: readonly SubgraphEntryDefinition[];
  readonly scalars: readonly SubgraphScalarReferenceDefinition[];
  /** The bindings of the package scalars in `scalars`, in its order. */
  readonly packageScalars: readonly ScalarBinding[];
  readonly definitionOrder: readonly string[];
  readonly hasSubscriptions: boolean;
  readonly document: LocationFreeGraphQLDocumentNode;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

export type CompileSubgraphInput = {
  readonly name: string;
  readonly entries: readonly unknown[];
  readonly exposed: readonly unknown[];
  /** Must be a complete permutation of the emitted names. */
  readonly definitionOrder?: readonly string[];
};

/**
 * Compiles a typed declaration to the author's AST. The host adds platform
 * types, document-model definitions, and its own scalar declarations before
 * serving it, and deduplicates keep-first as it does for a schema-first
 * subgraph.
 *
 * Traversal order is the contract. Entries are walked in the order the callback
 * returned them, then `expose` calls in the order they were made. A named type
 * is emitted when it is first reached, and the walk marks its token before
 * visiting its children so a cycle terminates.
 */
export function compileSubgraphSchema(
  input: CompileSubgraphInput,
): SubgraphSchemaData {
  const collector = new DefinitionDiagnosticCollector();
  const walk = new DescriptorWalk(collector, { allowFieldDefaults: true });
  const entries: SubgraphEntryDefinition[] = [];
  const roots = new Map<RootName, FieldNode[]>();
  const computedTargets = new Map<string, ReadonlySet<string>>();
  const boundComputed = new Set<string>();

  const read = input.entries.map((value, index) =>
    readEntry(value, ["entries", index]),
  );

  // Root arguments are walked before the return type, so a type that only an
  // argument names is emitted before the types the return reaches.
  read.forEach((entry, index) => {
    const path = ["entries", index];
    switch (entry.kind) {
      case "query":
      case "mutation":
      case "subscription": {
        const args = argumentDefinitions(walk, entry.args, [...path, "args"]);
        const returns = walk.typeReferenceFor(entry.returns, [
          ...path,
          "returns",
        ]);
        if (returns === undefined) return;
        const root = rootFor(entry.kind);
        const fields = roots.get(root) ?? [];
        fields.push({
          name: entry.fieldName,
          args,
          type: returns,
          description: entry.description,
          deprecated: entry.deprecated,
        });
        roots.set(root, fields);
        entries.push({
          kind: entry.kind,
          key: entry.key,
          fieldName: entry.fieldName,
          description: entry.description,
          deprecated: entry.deprecated,
          args,
          returns,
          access: { kind: "manual" },
        });
        return;
      }
      case "computed-field": {
        const key = `${entry.token.typeName}.${entry.token.fieldName}`;
        if (boundComputed.has(key)) {
          collector.add({
            code: "PH-SG-COMPUTED-FIELD-INVALID",
            path,
            message: `Computed field ${key} is bound twice.`,
            received: key,
            repair: "Bind each computed field once.",
          });
          return;
        }
        boundComputed.add(key);
        entries.push({
          kind: "computed-field",
          typeName: entry.token.typeName,
          fieldName: entry.token.fieldName,
          access: { kind: "manual" },
        });
        return;
      }
      case "resolve-type":
        entries.push({
          kind: "resolve-type",
          typeName: entry.typeName,
          access: { kind: "manual" },
        });
        return;
      case "is-type-of":
        entries.push({
          kind: "is-type-of",
          typeName: entry.typeName,
          access: { kind: "manual" },
        });
    }
  });

  // Exposed types are walked after every entry, in call order, so a type no
  // entry reaches prints after the ones entries reach.
  input.exposed.forEach((type, index) => {
    walk.visitType(type, "output", ["expose", index]);
  });

  for (const [typeName, declared] of walk.computedByType) {
    computedTargets.set(typeName, declared);
  }
  for (const [typeName, fields] of computedTargets) {
    for (const fieldName of fields) {
      if (!boundComputed.has(`${typeName}.${fieldName}`)) {
        collector.add({
          code: "PH-SG-COMPUTED-FIELD-INVALID",
          path: ["entries"],
          message: `Computed field ${typeName}.${fieldName} has no binding.`,
          received: `${typeName}.${fieldName}`,
          repair: `Add field(${typeName}.computedTokens.${fieldName}, { resolve }) to the entries callback.`,
        });
      }
    }
  }
  for (const key of [...boundComputed].sort(compareCodeUnits)) {
    const [typeName, fieldName] = key.split(".");
    if (!computedTargets.get(typeName)?.has(fieldName)) {
      collector.add({
        code: "PH-SG-COMPUTED-FIELD-INVALID",
        path: ["entries"],
        message: `Computed field ${key} is bound, but no reachable type declares it.`,
        received: key,
        repair:
          "Remove the binding, or make the type that declares it reachable from an entry or an expose call.",
      });
    }
  }

  const packageScalars = orderedPackageScalars(walk.packageScalars);
  const scalars = scalarReferences(new Set(walk.scalars), packageScalars);
  primeValueLowering(walk.definitions);
  const rootDefinitions = rootTypeDefinitions(roots);
  const emitted = [...walk.definitions, ...rootDefinitions];

  const defaultOrder = [
    ...scalars.map((scalar) => scalar.name),
    ...walk.definitions.map((definition) => definition.name),
    ...rootDefinitions.map((definition) => definition.name),
  ];
  const definitionOrder = resolveDefinitionOrder(
    input.definitionOrder,
    defaultOrder,
    collector,
  );

  return {
    types: emitted,
    entries,
    scalars,
    packageScalars,
    definitionOrder,
    hasSubscriptions: roots.has("Subscription"),
    document: buildDocument(emitted, scalars, definitionOrder),
    diagnostics: collector.diagnostics,
  };
}

type FieldNode = {
  readonly name: string;
  readonly args: readonly InputFieldDefinition[];
  readonly type: TypeReferenceDefinition;
  readonly description: string | null;
  readonly deprecated: string | null;
};

export function rootFor(kind: "query" | "mutation" | "subscription"): RootName {
  return kind === "query"
    ? "Query"
    : kind === "mutation"
      ? "Mutation"
      : "Subscription";
}

function rootTypeDefinitions(
  roots: ReadonlyMap<RootName, readonly FieldNode[]>,
): readonly NamedGraphQLTypeDefinition[] {
  // An empty `type Mutation {}` is not valid GraphQL.
  return ROOT_TYPES.flatMap((root) => {
    const fields = roots.get(root);
    if (fields === undefined || fields.length === 0) return [];
    return [
      {
        kind: "object" as const,
        name: root,
        description: null,
        fields: fields.map((field) => ({
          key: field.name,
          name: field.name,
          description: field.description,
          deprecated: field.deprecated,
          type: field.type,
          ...(field.args.length > 0 && { args: [...field.args] }),
        })),
      },
    ];
  });
}

function argumentDefinitions(
  walk: DescriptorWalk,
  args: ObjectFields,
  path: readonly (string | number)[],
): readonly InputFieldDefinition[] {
  return Object.entries(args).map(([key, field]) => {
    const type = walk.typeReferenceFor(field, [...path, key], "input") ?? {
      kind: "scalar" as const,
      name: "String",
      required: false,
    };
    const presented = (field as AnyFieldDescriptor).presentation;
    return {
      key,
      name: key,
      description: presented.description,
      deprecated: presented.deprecated,
      type,
      // A declared `= null` is a different schema from no default, so absence
      // and null never share a value.
      ...(presented.default.present && {
        defaultValue: presented.default.value as JsonValue,
      }),
    };
  });
}

function scalarReferences(
  used: ReadonlySet<string>,
  packageScalars: readonly ScalarBinding[],
): readonly SubgraphScalarReferenceDefinition[] {
  // Catalog order, so the declaration block, which is part of the published
  // schema text, does not move when an author reorders fields.
  const catalog = SCALAR_CATALOG_NAMES.filter((entry) => used.has(entry)).map(
    (name) =>
      ({
        name,
        implementation: `powerhouse.catalog#${name}`,
        graphQLProfile: "legacy-graphql-default-v1",
      }) as Extract<
        SubgraphScalarReferenceDefinition,
        { graphQLProfile: "legacy-graphql-default-v1" }
      >,
  );
  const declared = packageScalars.map(({ definition }) => ({
    name: definition.name,
    implementation: `package#${definition.name}` as const,
    graphQLProfile: "declared-coercion-v1" as const,
    definition,
  }));
  return [...catalog, ...declared];
}

/**
 * An authored order lets a subgraph keep the type sequence its existing schema
 * prints, even when reachability would produce another. A partial order would
 * drop the names it leaves out.
 */
function resolveDefinitionOrder(
  authored: readonly string[] | undefined,
  emitted: readonly string[],
  collector: DefinitionDiagnosticCollector,
): readonly string[] {
  if (authored === undefined) return emitted;
  const expected = new Set(emitted);
  const seen = new Set<string>();
  for (const name of authored) {
    if (seen.has(name)) {
      collector.add({
        code: "PH-SG-ENTRY-INVALID",
        path: ["definitionOrder"],
        message: `${name} appears twice in definitionOrder.`,
        received: name,
        repair: "List each emitted definition once.",
      });
      continue;
    }
    seen.add(name);
    if (!expected.has(name)) {
      collector.add({
        code: "PH-SG-ENTRY-INVALID",
        path: ["definitionOrder"],
        message: `definitionOrder names ${name}, which this schema does not emit.`,
        expected: [...expected].join(", "),
        received: name,
        repair: "Remove it, or make the type reachable.",
      });
    }
  }
  for (const name of emitted) {
    if (!seen.has(name)) {
      collector.add({
        code: "PH-SG-ENTRY-INVALID",
        path: ["definitionOrder"],
        message: `definitionOrder omits ${name}.`,
        expected: name,
        received: authored.join(", "),
        repair: "List every emitted definition, including roots and scalars.",
      });
    }
  }
  return collector.size > 0 ? emitted : authored;
}

function buildDocument(
  types: readonly NamedGraphQLTypeDefinition[],
  scalars: readonly SubgraphScalarReferenceDefinition[],
  order: readonly string[],
): LocationFreeGraphQLDocumentNode {
  const byName = new Map(types.map((type) => [type.name, type]));
  const scalarsByName = new Map(scalars.map((scalar) => [scalar.name, scalar]));
  const definitions = order.flatMap((name) => {
    const scalar = scalarsByName.get(name);
    if (scalar !== undefined) {
      // The host describes catalog scalars. A package scalar's description is
      // the only contract a client can introspect.
      return [
        scalarDefinition(
          name,
          "definition" in scalar ? scalar.definition.description : null,
        ),
      ];
    }
    const type = byName.get(name);
    return type === undefined ? [] : [namedTypeNode(type)];
  });
  return { kind: "Document", definitions } as LocationFreeGraphQLDocumentNode;
}

function name(value: string) {
  return { kind: "Name", value } as const;
}

function scalarDefinition(value: string, text: string | null) {
  return {
    kind: "ScalarTypeDefinition",
    ...description(text),
    name: name(value),
    directives: [],
  } as const;
}

function description(value: string | null) {
  return value === null
    ? {}
    : { description: { kind: "StringValue", value, block: true } };
}

function deprecation(value: string | null) {
  return value === null
    ? { directives: [] }
    : {
        directives: [
          {
            kind: "Directive",
            name: name("deprecated"),
            arguments: [
              {
                kind: "Argument",
                name: name("reason"),
                value: { kind: "StringValue", value, block: false },
              },
            ],
          },
        ],
      };
}

function typeNode(reference: TypeReferenceDefinition): unknown {
  const inner: unknown =
    reference.kind === "list"
      ? { kind: "ListType", type: typeNode(reference.item) }
      : { kind: "NamedType", name: name(reference.name) };
  return reference.required ? { kind: "NonNullType", type: inner } : inner;
}

function namedTypeNode(type: NamedGraphQLTypeDefinition): unknown {
  switch (type.kind) {
    case "enum":
      return {
        kind: "EnumTypeDefinition",
        name: name(type.name),
        ...description(type.description),
        directives: [],
        values: type.values.map((value) => ({
          kind: "EnumValueDefinition",
          name: name(value.name),
          ...description(value.description),
          ...deprecation(value.deprecated),
        })),
      };
    case "union":
      return {
        kind: "UnionTypeDefinition",
        name: name(type.name),
        ...description(type.description),
        directives: [],
        types: type.members.map((member) => ({
          kind: "NamedType",
          name: name(member),
        })),
      };
    case "input":
      return {
        kind: "InputObjectTypeDefinition",
        name: name(type.name),
        ...description(type.description),
        directives: [],
        fields: type.fields.map(inputValueNode),
      };
    case "interface":
      return {
        kind: "InterfaceTypeDefinition",
        name: name(type.name),
        ...description(type.description),
        interfaces: [],
        directives: [],
        fields: type.fields.map(fieldNode),
      };
    case "object":
      return {
        kind: "ObjectTypeDefinition",
        name: name(type.name),
        ...description(type.description),
        interfaces: (type.implements ?? []).map((implemented) => ({
          kind: "NamedType",
          name: name(implemented),
        })),
        directives: [],
        fields: type.fields.map(fieldNode),
      };
  }
}

function fieldNode(field: {
  readonly name: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly type: TypeReferenceDefinition;
  readonly args?: readonly InputFieldDefinition[];
}): unknown {
  return {
    kind: "FieldDefinition",
    name: name(field.name),
    ...description(field.description),
    arguments: (field.args ?? []).map(inputValueNode),
    type: typeNode(field.type),
    ...deprecation(field.deprecated),
  };
}

function inputValueNode(field: InputFieldDefinition): unknown {
  return {
    kind: "InputValueDefinition",
    name: name(field.name),
    ...description(field.description),
    type: typeNode(field.type),
    ...("defaultValue" in field
      ? { defaultValue: valueNode(field.defaultValue as JsonValue, field.type) }
      : {}),
    ...deprecation(field.deprecated),
  };
}

/**
 * The JS value alone does not determine the AST node. A string is an EnumValue
 * in an enum-typed field and a StringValue elsewhere, and an object's members
 * keep their declared order instead of the literal's key order.
 */
function valueNode(
  value: JsonValue,
  reference: TypeReferenceDefinition,
): unknown {
  if (value === null) return { kind: "NullValue" };
  if (reference.kind === "list") {
    return {
      kind: "ListValue",
      values: (Array.isArray(value) ? value : [value]).map((member) =>
        valueNode(member as JsonValue, reference.item),
      ),
    };
  }
  if (typeof value === "boolean") return { kind: "BooleanValue", value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { kind: "IntValue", value: String(value) }
      : { kind: "FloatValue", value: String(value) };
  }
  if (typeof value === "string") {
    return reference.kind === "named" && ENUM_TYPES.has(reference.name)
      ? { kind: "EnumValue", value }
      : { kind: "StringValue", value, block: false };
  }
  if (Array.isArray(value)) {
    return {
      kind: "ListValue",
      values: value.map((member) => valueNode(member as JsonValue, reference)),
    };
  }
  const fields = INPUT_FIELDS.get(
    reference.kind === "named" ? reference.name : "",
  );
  const record = value as Readonly<Record<string, JsonValue>>;
  const keys =
    fields === undefined
      ? Object.keys(record)
      : fields.map((field) => field.name).filter((key) => key in record);
  return {
    kind: "ObjectValue",
    fields: keys.map((key) => ({
      kind: "ObjectField",
      name: name(key),
      value: valueNode(
        record[key],
        fields?.find((field) => field.name === key)?.type ?? reference,
      ),
    })),
  };
}

/** Filled per compilation so `valueNode` can read declared shapes. */
const ENUM_TYPES = new Set<string>();
const INPUT_FIELDS = new Map<string, readonly InputFieldDefinition[]>();

export function primeValueLowering(
  types: readonly NamedGraphQLTypeDefinition[],
): void {
  ENUM_TYPES.clear();
  INPUT_FIELDS.clear();
  for (const type of types) {
    if (type.kind === "enum") ENUM_TYPES.add(type.name);
    if (type.kind === "input") INPUT_FIELDS.set(type.name, type.fields);
  }
}

export type { RegisteredEntry };
