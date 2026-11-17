/** Checks the SDL against what code-first descriptors can express, and models the types and entries to emit. */
import { ph } from "document-model";
import { getCatalogScalar } from "document-model/scalars";
import {
  buildASTSchema,
  type ConstDirectiveNode,
  type ConstValueNode,
  type DocumentNode,
  type FieldDefinitionNode,
  Kind,
  type Location,
  type StringValueNode,
  type TypeDefinitionNode,
  type TypeNode,
  visit,
} from "graphql";
import type { Project } from "ts-morph";
import {
  BUILT_IN_SCALARS,
  type Input,
  isRootName,
  refuse,
  type RootName,
  SCALARS_ENTRY,
  type SdlSource,
  sourceFile,
} from "./context.js";
import type { ResolverType } from "./resolver-map.js";
import { withoutKeys } from "./sdl.js";

/** The `ph` factory of each catalog scalar, keyed by scalar name. */
const catalogBuilders: ReadonlyMap<string, string> = new Map(
  Object.keys(ph).flatMap((key) => {
    const factory = (ph as Readonly<Record<string, unknown>>)[key];
    if (!/^[A-Z]/.test(key) || BUILT_IN_SCALARS.has(key)) return [];
    if (typeof factory !== "function") return [];
    const field = (factory as () => { identity: { name: string } })();
    return [[field.identity.name, key] as const];
  }),
);

export type ScalarKind =
  | {
      readonly kind: "builtin" | "catalog" | "host";
      readonly builder: string;
    }
  | { readonly kind: "project"; readonly exportName: string };

export type FieldOptions = {
  readonly required: boolean;
  readonly description?: string;
  readonly deprecated?: string;
  readonly defaultValue?: Json;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

export function readProjectScalars(
  project: Project,
  input: Input,
): ReadonlySet<string> {
  if (!input.files.has(SCALARS_ENTRY)) return new Set();
  const file = sourceFile(project, input, SCALARS_ENTRY);
  return new Set(file.getExportedDeclarations().keys());
}

export type Located = { readonly loc?: Location };

export const sdlLine = (source: SdlSource, node: Located) =>
  source.firstLine + (node.loc?.startToken.line ?? 1) - 1;

type ComputedField = {
  readonly typeName: string;
  readonly field: FieldDefinitionNode;
};

export type Model = {
  readonly source: SdlSource;
  readonly types: readonly TypeDefinitionNode[];
  readonly typeKinds: ReadonlyMap<string, TypeDefinitionNode["kind"]>;
  readonly scalars: ReadonlyMap<string, ScalarKind>;
  readonly roots: Partial<Record<RootName, readonly FieldDefinitionNode[]>>;
  readonly computed: readonly ComputedField[];
  /** Fields of each object type left in its descriptor. */
  readonly descriptorFields: ReadonlyMap<
    string,
    readonly FieldDefinitionNode[]
  >;
  readonly resolveTypes: readonly string[];
  /** Types no field reaches, each served by a `schema.type` entry. */
  readonly typeEntries: readonly string[];
  readonly subscriptionsWithResolve: ReadonlySet<string>;
  readonly rootDescriptions: Partial<Record<RootName, string>>;
  /** Each `@key` of an object type, in SDL order. */
  readonly entities: readonly {
    readonly typeName: string;
    readonly key: string;
  }[];
};

export function analyze(
  document: DocumentNode,
  source: SdlSource,
  resolverMap: ReadonlyMap<string, ResolverType> & { readonly file: string },
  projectScalars: ReadonlySet<string>,
): Model {
  function refuseAt(node: Located, reason: string, repair: string): never {
    return refuse(source.file, sdlLine(source, node), reason, repair);
  }

  const definitions = new Map<string, TypeDefinitionNode>();
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case Kind.SCHEMA_DEFINITION:
      case Kind.SCHEMA_EXTENSION:
        refuseAt(
          definition,
          "The SDL declares a schema block, which a code-first subgraph cannot.",
          "Remove the schema block and use the root type names Query, Mutation and Subscription.",
        );
        break;
      case Kind.DIRECTIVE_DEFINITION:
        refuseAt(
          definition,
          `The SDL defines the directive @${definition.name.value}, which a code-first subgraph cannot.`,
          "Keep this subgraph schema-first.",
        );
        break;
      case Kind.OBJECT_TYPE_EXTENSION:
      case Kind.INTERFACE_TYPE_EXTENSION:
      case Kind.UNION_TYPE_EXTENSION:
      case Kind.ENUM_TYPE_EXTENSION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      case Kind.SCALAR_TYPE_EXTENSION:
        refuseAt(
          definition,
          `The SDL extends ${definition.name.value} with extend, which a code-first subgraph cannot.`,
          `Merge the extension into ${definition.name.value}'s definition, or keep this subgraph schema-first.`,
        );
        break;
      case Kind.OPERATION_DEFINITION:
      case Kind.FRAGMENT_DEFINITION:
        refuseAt(
          definition,
          "The SDL holds an operation or fragment.",
          "Remove it from the SDL.",
        );
        break;
      default:
        definitions.set(definition.name.value, definition);
    }
  }

  const entities: { typeName: string; key: string }[] = [];
  const keyUses = new Set<object>();
  for (const definition of definitions.values()) {
    const name = definition.name.value;
    for (const directive of definition.directives ?? []) {
      if (directive.name.value !== "key") continue;
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION || isRootName(name)) {
        refuseAt(
          directive,
          `@key is on ${name}, which is not an object type other than a root type. A code-first subgraph declares a key only for an entity object type.`,
          `Remove @key from ${name}, or keep this subgraph schema-first.`,
        );
      }
      const args = directive.arguments ?? [];
      const [argument] = args;
      if (
        args.length !== 1 ||
        argument.name.value !== "fields" ||
        argument.value.kind !== Kind.STRING
      ) {
        refuseAt(
          directive,
          `@key on ${name} takes arguments other than one fields string, which a code-first entity cannot declare.`,
          `Write the key as @key(fields: "...") on ${name}, or keep this subgraph schema-first.`,
        );
      }
      entities.push({ typeName: name, key: argument.value.value });
      keyUses.add(directive);
    }
  }

  visit(document, {
    Directive(node) {
      if (node.name.value === "deprecated" || keyUses.has(node)) return;
      refuse(
        source.file,
        sdlLine(source, node),
        `@${node.name.value} is a directive other than @deprecated, which a code-first subgraph cannot declare.`,
        `Remove @${node.name.value}, or keep this subgraph schema-first.`,
      );
    },
    NamedType(node) {
      const name = node.name.value;
      if (BUILT_IN_SCALARS.has(name) || definitions.has(name)) return;
      refuseAt(
        node,
        `The SDL references ${name}, which it does not define. A schema-first subgraph can use a type the host adds, such as a document-model type; a code-first one cannot.`,
        `Define ${name} in the SDL, or keep this subgraph schema-first.`,
      );
    },
  });

  try {
    buildASTSchema(withoutKeys(document));
  } catch (error) {
    refuse(
      source.file,
      source.firstLine,
      `The SDL is not a valid schema: ${error instanceof Error ? error.message : String(error)}`,
      "Fix the SDL.",
    );
  }

  const scalars = new Map<string, ScalarKind>();
  for (const name of BUILT_IN_SCALARS) {
    scalars.set(name, { kind: "builtin", builder: name });
  }
  const types: TypeDefinitionNode[] = [];
  const roots: Partial<Record<RootName, readonly FieldDefinitionNode[]>> = {};
  const rootDescriptions: Partial<Record<RootName, string>> = {};
  for (const definition of definitions.values()) {
    const name = definition.name.value;
    if (definition.kind === Kind.SCALAR_TYPE_DEFINITION) {
      const catalog = catalogBuilders.get(name);
      if (definition.description !== undefined) {
        refuseAt(
          definition,
          `The scalar ${name} has a description, which a code-first subgraph does not declare.`,
          "Remove the scalar's description.",
        );
      }
      if (catalog !== undefined) {
        scalars.set(name, { kind: "catalog", builder: catalog });
      } else if (getCatalogScalar(name) !== undefined) {
        scalars.set(name, { kind: "host", builder: name });
      } else if (projectScalars.has(name)) {
        scalars.set(name, { kind: "project", exportName: name });
      } else {
        refuseAt(
          definition,
          `The scalar ${name} is neither a catalog scalar nor exported by ${SCALARS_ENTRY}.`,
          `Declare ${name} with defineScalar and export it from ${SCALARS_ENTRY}.`,
        );
      }
      continue;
    }
    if (isRootName(name)) {
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        refuseAt(
          definition,
          `${name} is not an object type.`,
          `Make ${name} an object type.`,
        );
      }
      if ((definition.interfaces?.length ?? 0) > 0) {
        refuseAt(
          definition,
          `The root type ${name} implements an interface, which a code-first subgraph's root types cannot.`,
          `Remove the interfaces from ${name}, or keep this subgraph schema-first.`,
        );
      }
      if (definition.description !== undefined) {
        rootDescriptions[name] = definition.description.value;
      }
      roots[name] = definition.fields ?? [];
      continue;
    }
    if (name.startsWith("_")) {
      refuseAt(
        definition,
        `The type name ${name} starts with an underscore, which Apollo Federation reserves.`,
        `Rename ${name}.`,
      );
    }
    types.push(definition);
  }
  if (
    roots.Query === undefined &&
    roots.Mutation === undefined &&
    roots.Subscription === undefined
  ) {
    refuse(
      source.file,
      source.firstLine,
      "The SDL declares no Query, Mutation or Subscription type.",
      "Add a root type.",
    );
  }

  const computed: ComputedField[] = [];
  const descriptorFields = new Map<string, readonly FieldDefinitionNode[]>();
  const resolveTypes: string[] = [];
  const subscriptionsWithResolve = new Set<string>();
  function refuseMap(line: number, reason: string, repair: string): never {
    return refuse(resolverMap.file, line, reason, repair);
  }

  for (const [typeName, entry] of resolverMap) {
    const definition = definitions.get(typeName);
    if (definition === undefined) {
      refuseMap(
        entry.line,
        `The resolver map names ${typeName}, which the SDL does not define. The host ignores it.`,
        `Remove ${typeName} from the resolver map.`,
      );
    }
    const kind = definition.kind;
    for (const [fieldName, field] of entry.fields) {
      const coordinate = `${typeName}.${fieldName}`;
      if (fieldName === "__resolveType") {
        if (
          kind !== Kind.UNION_TYPE_DEFINITION &&
          kind !== Kind.INTERFACE_TYPE_DEFINITION
        ) {
          refuseMap(
            field.line,
            `${coordinate} is set on a type that is not a union or an interface.`,
            `Remove ${coordinate}.`,
          );
        }
        resolveTypes.push(typeName);
        continue;
      }
      if (fieldName === "__isTypeOf") {
        refuseMap(
          field.line,
          `${coordinate} has no code-first form.`,
          `Replace ${coordinate} with __resolveType on the abstract types ${typeName} belongs to.`,
        );
      }
      if (fieldName.startsWith("__")) {
        refuseMap(
          field.line,
          fieldName === "__resolveReference"
            ? `${coordinate} has no code-first form. A code-first entity resolves a reference to the representation the gateway sends.`
            : `${coordinate} has no code-first form.`,
          `Remove ${coordinate}, or keep this subgraph schema-first.`,
        );
      }
      if (kind === Kind.SCALAR_TYPE_DEFINITION) {
        refuseMap(
          field.line,
          `The resolver map gives the scalar ${typeName} an implementation. A code-first subgraph's scalars come from the catalog or ${SCALARS_ENTRY}.`,
          `Remove ${typeName} from the resolver map and declare it with defineScalar in ${SCALARS_ENTRY}.`,
        );
      }
      if (kind !== Kind.OBJECT_TYPE_DEFINITION) {
        refuseMap(
          field.line,
          `${coordinate} is set on ${kind === Kind.INTERFACE_TYPE_DEFINITION ? "an interface field, which the host ignores" : kind === Kind.ENUM_TYPE_DEFINITION ? "an enum, whose internal values have no code-first form" : "a type that takes no resolvers"}.`,
          `Remove ${coordinate}.`,
        );
      }
      if (
        !(definition.fields ?? []).some(
          (candidate) => candidate.name.value === fieldName,
        )
      ) {
        refuseMap(
          field.line,
          `The resolver map names ${coordinate}, which the SDL does not define. The host ignores it.`,
          `Remove ${coordinate}.`,
        );
      }
      if (typeName === "Subscription" && field.hasResolve) {
        subscriptionsWithResolve.add(fieldName);
      }
    }
  }
  for (const field of roots.Subscription ?? []) {
    if (!resolverMap.get("Subscription")?.fields.has(field.name.value)) {
      refuseAt(
        field,
        `Subscription.${field.name.value} has no subscribe resolver.`,
        `Add Subscription.${field.name.value}: { subscribe } to the resolver map.`,
      );
    }
  }
  for (const type of types) {
    if (type.kind === Kind.INTERFACE_TYPE_DEFINITION) {
      for (const field of type.fields ?? []) {
        if ((field.arguments?.length ?? 0) > 0) {
          refuseAt(
            field,
            `The interface field ${type.name.value}.${field.name.value} takes arguments, which a code-first interface field cannot.`,
            "Keep this subgraph schema-first.",
          );
        }
      }
    }
    if (type.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    const resolved = resolverMap.get(type.name.value)?.fields;
    const own: FieldDefinitionNode[] = [];
    for (const field of type.fields ?? []) {
      if (
        resolved?.has(field.name.value) ||
        (field.arguments?.length ?? 0) > 0
      ) {
        computed.push({ typeName: type.name.value, field });
      } else {
        own.push(field);
      }
    }
    descriptorFields.set(type.name.value, own);
  }
  const typeKinds = new Map(
    [...definitions].map(
      ([name, definition]) => [name, definition.kind] as const,
    ),
  );
  return {
    source,
    types: declarationOrder(types),
    typeKinds,
    scalars,
    roots,
    computed,
    descriptorFields,
    resolveTypes,
    typeEntries: unreachedTypes(definitions, types, roots),
    subscriptionsWithResolve,
    rootDescriptions,
    entities,
  };
}

/**
 * The types no root field reaches, in SDL order, leaving out a type that an
 * earlier one reaches. A code-first subgraph serves a type only through an
 * entry, and nothing leads from an interface to the types that implement it.
 */
function unreachedTypes(
  definitions: ReadonlyMap<string, TypeDefinitionNode>,
  types: readonly TypeDefinitionNode[],
  roots: Partial<Record<RootName, readonly FieldDefinitionNode[]>>,
): readonly string[] {
  const reached = new Set<string>();
  const fieldTypes = (fields: readonly FieldDefinitionNode[]) =>
    fields.flatMap((field) => [
      field.type,
      ...(field.arguments ?? []).map((argument) => argument.type),
    ]);
  const reach = (name: string) => {
    const definition = definitions.get(name);
    if (
      reached.has(name) ||
      definition === undefined ||
      definition.kind === Kind.SCALAR_TYPE_DEFINITION
    ) {
      return;
    }
    reached.add(name);
    switch (definition.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_DEFINITION:
        (definition.interfaces ?? []).forEach((entry) =>
          reach(entry.name.value),
        );
        fieldTypes(definition.fields ?? []).forEach((type) =>
          reach(namedTypeOf(type)),
        );
        return;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        (definition.fields ?? []).forEach((field) =>
          reach(namedTypeOf(field.type)),
        );
        return;
      case Kind.UNION_TYPE_DEFINITION:
        (definition.types ?? []).forEach((member) => reach(member.name.value));
    }
  };
  for (const fields of Object.values(roots)) {
    fieldTypes(fields).forEach((type) => reach(namedTypeOf(type)));
  }
  return types.flatMap((type) => {
    const name = type.name.value;
    if (reached.has(name)) return [];
    reach(name);
    return [name];
  });
}

const namedTypeOf = (type: TypeNode): string =>
  type.kind === Kind.NAMED_TYPE ? type.name.value : namedTypeOf(type.type);

/**
 * Union members and implemented interfaces must be declared first. Among
 * the types that can come next, the one with the fewest field references to
 * undeclared types does, so few references need a thunk.
 */
function declarationOrder(
  types: readonly TypeDefinitionNode[],
): readonly TypeDefinitionNode[] {
  const names = new Set(types.map((type) => type.name.value));
  const strict = (type: TypeDefinitionNode): string[] =>
    type.kind === Kind.UNION_TYPE_DEFINITION
      ? (type.types ?? []).map((member) => member.name.value)
      : type.kind === Kind.OBJECT_TYPE_DEFINITION ||
          type.kind === Kind.INTERFACE_TYPE_DEFINITION
        ? (type.interfaces ?? []).map((entry) => entry.name.value)
        : [];
  const referenced = (type: TypeDefinitionNode): string[] =>
    type.kind === Kind.OBJECT_TYPE_DEFINITION ||
    type.kind === Kind.INTERFACE_TYPE_DEFINITION ||
    type.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
      ? (type.fields ?? [])
          .map((field) => namedTypeOf(field.type))
          .filter((name) => names.has(name))
      : [];
  const declared = new Set<string>();
  const order: TypeDefinitionNode[] = [];
  const pending = [...types];
  while (pending.length > 0) {
    const ready = pending.filter((type) =>
      strict(type).every((name) => declared.has(name)),
    );
    const next = ready.reduce((best, type) => {
      const missing = (candidate: TypeDefinitionNode) =>
        referenced(candidate).filter((name) => !declared.has(name)).length;
      return missing(type) < missing(best) ? type : best;
    });
    order.push(next);
    declared.add(next.name.value);
    pending.splice(pending.indexOf(next), 1);
  }
  return order;
}

export function description(node: { readonly description?: StringValueNode }) {
  return node.description?.value;
}

export function deprecationOf(node: {
  readonly directives?: readonly ConstDirectiveNode[];
}): string | undefined {
  const directive = node.directives?.find(
    (candidate) => candidate.name.value === "deprecated",
  );
  if (directive === undefined) return undefined;
  const reason = directive.arguments?.find(
    (argument) => argument.name.value === "reason",
  )?.value;
  return reason?.kind === Kind.STRING ? reason.value : "No longer supported";
}

export function jsonValue(
  node: ConstValueNode,
  refuseAt: (node: Located, reason: string, repair: string) => never,
): Json {
  switch (node.kind) {
    case Kind.INT: {
      const value = Number(node.value);
      if (!Number.isSafeInteger(value)) {
        refuseAt(
          node,
          `The default value ${node.value} is outside the integers JSON keeps exactly.`,
          "Use a smaller default value.",
        );
      }
      return value;
    }
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map((value) => jsonValue(value, refuseAt));
    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map((field) => [
          field.name.value,
          jsonValue(field.value, refuseAt),
        ]),
      );
  }
}
