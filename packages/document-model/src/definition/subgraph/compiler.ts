import type {
  InputFieldDefinitionV1,
  ResolverCoordinateDefinitionV1,
  ScalarNameV1,
  SubgraphDefinitionV1,
  SubgraphEntryDefinitionV1,
  SubgraphScalarReferenceDefinitionV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { snapshotDataArray, snapshotDataRecord } from "../data-properties.js";
import { failDefinition } from "../diagnostics.js";
import {
  isFieldDescriptor as isRegisteredFieldDescriptor,
  isTypeDescriptor as isRegisteredTypeDescriptor,
} from "../descriptor-registry.js";
import {
  isComputedFieldToken,
  toInputFieldDefinition,
  toTypeReference,
} from "../field.js";
import { isGraphQLName, isRecord } from "../primitives.js";
import { collectPositionedNamedDefinitions } from "../printer.js";
import { scalarCatalog } from "../scalars/catalog.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  ComputedFieldToken,
  InterfaceDescriptor,
  ObjectDescriptor,
  ObjectFields,
  UnionDescriptor,
} from "../types.js";
import { buildTypedSubgraphDocument, toLocationFreeDocument } from "./ast.js";
import type {
  DefinedSubgraphConstructor,
  EntryBuilders,
  SubgraphBaseConstructor,
  SubgraphBaseInstance,
  SubgraphConfig,
  TypedSubgraphEntry,
} from "./types.js";

const BUILT_IN_SCALARS = new Set<ScalarNameV1>([
  "ID",
  "String",
  "Boolean",
  "Int",
  "Float",
]);

const FEDERATION_NAMES = new Set(["_Any", "_Entity", "_Service"]);
const RESOLVER_OWNED_ACCESS = Object.freeze({ kind: "manual" as const });

type RuntimeFunction = (...args: unknown[]) => unknown;

type RuntimeRootEntry = TypedSubgraphEntry & {
  readonly entryKind: "query" | "mutation" | "subscription";
  readonly key: string;
  readonly fieldName: string;
  readonly description: string | null;
  readonly compatibilityName: string | null;
  readonly args: ObjectFields;
  readonly returns: AnyFieldDescriptor;
  readonly resolve?: RuntimeFunction;
  readonly subscribe?: RuntimeFunction;
};

type RuntimeFieldEntry = TypedSubgraphEntry & {
  readonly entryKind: "field";
  readonly target: ComputedFieldToken;
  readonly resolve: RuntimeFunction;
};

type RuntimeResolveTypeEntry = TypedSubgraphEntry & {
  readonly entryKind: "resolveType";
  readonly type: InterfaceDescriptor | UnionDescriptor;
  readonly resolve: RuntimeFunction;
};

type RuntimeIsTypeOfEntry = TypedSubgraphEntry & {
  readonly entryKind: "isTypeOf";
  readonly type: ObjectDescriptor;
  readonly resolve: RuntimeFunction;
};

type RuntimeTypeEntry = TypedSubgraphEntry & {
  readonly entryKind: "type";
  readonly type: AnyTypeDescriptor;
};

type RuntimeEntry =
  | RuntimeRootEntry
  | RuntimeFieldEntry
  | RuntimeResolveTypeEntry
  | RuntimeIsTypeOfEntry
  | RuntimeTypeEntry;

const runtimeEntries = new WeakSet<object>();
const compiledSubgraphDefinitions = new WeakMap<object, SubgraphDefinitionV1>();

export function getCompiledSubgraphDefinition(
  value: unknown,
): SubgraphDefinitionV1 | undefined {
  return value !== null &&
    (typeof value === "object" || typeof value === "function")
    ? compiledSubgraphDefinitions.get(value)
    : undefined;
}

function runtimeEntry<TEntry extends RuntimeEntry>(entry: TEntry): TEntry {
  const frozen = Object.freeze(entry);
  runtimeEntries.add(frozen);
  return frozen;
}

function snapshotRecord(
  value: unknown,
  path: readonly (string | number)[],
): Readonly<Record<string, unknown>> {
  const inspected = snapshotDataRecord(value);
  if (inspected.ok) return inspected.value;
  if (inspected.reason === "symbol-key") {
    return failDefinition({
      code: "PH-GQL-SYMBOL-KEY-UNSUPPORTED",
      path,
      message: "Subgraph configurations cannot contain symbol keys.",
      repair: "Use only documented string properties.",
    });
  }
  return failDefinition({
    code: "PH-GQL-CONFIG-INVALID",
    path:
      inspected.key === undefined
        ? path
        : [
            ...path,
            typeof inspected.key === "number"
              ? inspected.key
              : String(inspected.key),
          ],
    message:
      "A subgraph configuration must contain stable enumerable data properties.",
    repair:
      "Pass a plain object without accessors, proxies, or custom prototypes.",
  });
}

function assertKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failDefinition({
        code: key.toLowerCase().includes("federation")
          ? "PH-GQL-FEDERATION-UNSUPPORTED"
          : "PH-GQL-CONFIG-OPTION-UNSUPPORTED",
        path: [...path, key],
        message: key.toLowerCase().includes("federation")
          ? "Typed Federation declarations are not supported in subgraph format V1."
          : `Subgraph option ${JSON.stringify(key)} is not supported.`,
        repair: key.toLowerCase().includes("federation")
          ? "Use graphql-ast-compat mode to preserve an existing Federation schema."
          : "Remove the option or use the documented compatibility adapter.",
      });
    }
  }
}

function assertGraphQLName(
  value: unknown,
  path: readonly (string | number)[],
): string {
  if (!isGraphQLName(value)) {
    failDefinition({
      code: "PH-GQL-NAME-INVALID",
      path,
      message:
        "An author-defined GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and cannot start with two underscores.",
      received: typeof value === "string" ? value : typeof value,
      repair: "Use a nonempty GraphQL-compatible name.",
    });
  }
  return value;
}

function assertFunction(
  value: unknown,
  path: readonly (string | number)[],
): asserts value is RuntimeFunction {
  if (typeof value !== "function") {
    failDefinition({
      code: "PH-GQL-RESOLVER-INVALID",
      path,
      message: "A subgraph resolver must be a function.",
      received: typeof value,
      repair: "Provide the documented resolver function.",
    });
  }
}

function assertFieldDescriptor(
  value: unknown,
  path: readonly (string | number)[],
): asserts value is AnyFieldDescriptor {
  if (!isRegisteredFieldDescriptor(value)) {
    failDefinition({
      code: "PH-GQL-FIELD-DESCRIPTOR-INVALID",
      path,
      message: "A subgraph field position requires a ph field descriptor.",
      repair: "Use a scalar factory, ph.list(...), or ph.ref(Type).",
    });
  }
}

function assertTypeDescriptor(
  value: unknown,
  path: readonly (string | number)[],
): asserts value is AnyTypeDescriptor {
  if (!isRegisteredTypeDescriptor(value)) {
    failDefinition({
      code: "PH-GQL-TYPE-DESCRIPTOR-INVALID",
      path,
      message: "A typed subgraph entry requires a named ph type descriptor.",
      repair: "Use ph.object, ph.input, ph.enum, ph.interface, or ph.union.",
    });
  }
}

function copyArgs(
  value: unknown,
  path: readonly (string | number)[],
): ObjectFields {
  if (value === undefined) return Object.freeze({});
  const snapshot = snapshotRecord(value, path);
  const result = Object.create(null) as Record<string, AnyFieldDescriptor>;
  for (const [key, descriptor] of Object.entries(snapshot)) {
    assertGraphQLName(key, [...path, key]);
    assertFieldDescriptor(descriptor, [...path, key]);
    result[key] = descriptor;
  }
  return Object.freeze(result);
}

function rootEntry(
  entryKind: RuntimeRootEntry["entryKind"],
  keyValue: unknown,
  optionsValue: unknown,
): RuntimeRootEntry {
  const key = assertGraphQLName(keyValue, ["entries", entryKind, "key"]);
  const options = snapshotRecord(optionsValue, ["entries", key]);
  const allowed = new Set([
    "args",
    "returns",
    "description",
    "fieldName",
    "compatibilityName",
    ...(entryKind === "subscription" ? ["subscribe", "resolve"] : ["resolve"]),
  ]);
  assertKeys(options, allowed, ["entries", key]);
  assertFieldDescriptor(options.returns, ["entries", key, "returns"]);
  if (
    options.description !== undefined &&
    typeof options.description !== "string"
  ) {
    failDefinition({
      code: "PH-GQL-DESCRIPTION-INVALID",
      path: ["entries", key, "description"],
      message: "A resolver description must be a string.",
      repair: "Use a string description or omit it.",
    });
  }
  const fieldName = assertGraphQLName(options.fieldName ?? key, [
    "entries",
    key,
    "fieldName",
  ]);
  const compatibilityName =
    options.compatibilityName === undefined
      ? null
      : assertGraphQLName(options.compatibilityName, [
          "entries",
          key,
          "compatibilityName",
        ]);
  if (entryKind === "subscription") {
    assertFunction(options.subscribe, ["entries", key, "subscribe"]);
    if (options.resolve !== undefined) {
      assertFunction(options.resolve, ["entries", key, "resolve"]);
    }
  } else {
    assertFunction(options.resolve, ["entries", key, "resolve"]);
  }
  return runtimeEntry({
    __powerhouseSubgraphEntry: true,
    entryKind,
    key,
    fieldName,
    description: (options.description as string | undefined) ?? null,
    compatibilityName,
    args: copyArgs(options.args, ["entries", key, "args"]),
    returns: options.returns,
    ...(entryKind === "subscription"
      ? {
          subscribe: options.subscribe as RuntimeFunction,
          ...(options.resolve === undefined
            ? {}
            : { resolve: options.resolve as RuntimeFunction }),
        }
      : { resolve: options.resolve as RuntimeFunction }),
  });
}

function createEntryBuilders(): EntryBuilders<any, any, any, any> {
  return Object.freeze({
    query: (key: string, options: unknown) => rootEntry("query", key, options),
    mutation: (key: string, options: unknown) =>
      rootEntry("mutation", key, options),
    subscription: (key: string, options: unknown) =>
      rootEntry("subscription", key, options),
    field(target: unknown, optionsValue: unknown): RuntimeFieldEntry {
      if (!isComputedFieldToken(target)) {
        failDefinition({
          code: "PH-GQL-COMPUTED-FIELD-TOKEN-INVALID",
          path: ["entries", "field", "target"],
          message:
            "A field resolver must target a token from a ph.object computed field.",
          repair: "Pass Object.computedField to the field entry builder.",
        });
      }
      const options = snapshotRecord(optionsValue, [
        "entries",
        "field",
        target.objectName,
        target.key,
      ]);
      assertKeys(options, new Set(["resolve"]), [
        "entries",
        "field",
        target.objectName,
        target.key,
      ]);
      assertFunction(options.resolve, [
        "entries",
        "field",
        target.objectName,
        target.key,
        "resolve",
      ]);
      return runtimeEntry({
        __powerhouseSubgraphEntry: true,
        entryKind: "field",
        target: target as unknown as ComputedFieldToken,
        resolve: options.resolve,
      });
    },
    resolveType(type: unknown, resolve: unknown): RuntimeResolveTypeEntry {
      assertTypeDescriptor(type, ["entries", "resolveType", "type"]);
      if (type.kind !== "interface" && type.kind !== "union") {
        failDefinition({
          code: "PH-GQL-ABSTRACT-TYPE-INVALID",
          path: ["entries", "resolveType", "type"],
          message:
            "resolveType can target only an interface or union descriptor.",
          repair: "Pass a descriptor returned by ph.interface or ph.union.",
        });
      }
      assertFunction(resolve, ["entries", "resolveType", "resolve"]);
      return runtimeEntry({
        __powerhouseSubgraphEntry: true,
        entryKind: "resolveType",
        type: type as InterfaceDescriptor | UnionDescriptor,
        resolve,
      });
    },
    isTypeOf(type: unknown, resolve: unknown): RuntimeIsTypeOfEntry {
      assertTypeDescriptor(type, ["entries", "isTypeOf", "type"]);
      if (type.kind !== "object") {
        failDefinition({
          code: "PH-GQL-OBJECT-TYPE-INVALID",
          path: ["entries", "isTypeOf", "type"],
          message: "isTypeOf can target only an object descriptor.",
          repair: "Pass a descriptor returned by ph.object.",
        });
      }
      assertFunction(resolve, ["entries", "isTypeOf", "resolve"]);
      return runtimeEntry({
        __powerhouseSubgraphEntry: true,
        entryKind: "isTypeOf",
        type: type as ObjectDescriptor,
        resolve,
      });
    },
    type(type: unknown): RuntimeTypeEntry {
      assertTypeDescriptor(type, ["entries", "type"]);
      return runtimeEntry({
        __powerhouseSubgraphEntry: true,
        entryKind: "type",
        type,
      });
    },
  }) as EntryBuilders<any, any, any, any>;
}

function assertRuntimeEntries(value: unknown): readonly RuntimeEntry[] {
  const inspected = snapshotDataArray(value);
  if (!inspected.ok) {
    return failDefinition({
      code: "PH-GQL-ENTRIES-INVALID",
      path: ["entries"],
      message: "The entries callback must return an array.",
      repair:
        "Return a readonly array of values created by the entry builders.",
    });
  }
  const entries = inspected.value;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isRecord(entry) || !runtimeEntries.has(entry)) {
      failDefinition({
        code: "PH-GQL-ENTRY-INVALID",
        path: ["entries", index],
        message: "Every typed entry must be created by an entry builder.",
        repair:
          "Use query, mutation, subscription, field, resolveType, isTypeOf, or type.",
      });
    }
  }
  return Object.freeze(entries.slice()) as readonly RuntimeEntry[];
}

function structuredEntry(
  entry: RuntimeEntry,
): SubgraphEntryDefinitionV1 | null {
  switch (entry.entryKind) {
    case "type":
      return null;
    case "field":
      return {
        kind: "field",
        target: {
          typeName: entry.target.objectName,
          fieldName: entry.target.key,
        },
        access: RESOLVER_OWNED_ACCESS,
      };
    case "resolveType":
      return { kind: "resolveType", typeName: entry.type.name as string };
    case "isTypeOf":
      return { kind: "isTypeOf", typeName: entry.type.name as string };
    case "query":
    case "mutation":
    case "subscription":
      return {
        kind: entry.entryKind,
        key: entry.key,
        fieldName: entry.fieldName,
        description: entry.description,
        args: Object.entries(entry.args).map(([key, descriptor]) =>
          toInputFieldDefinition(key, descriptor),
        ),
        returns: toTypeReference(entry.returns),
        access: RESOLVER_OWNED_ACCESS,
        compatibilityName: entry.compatibilityName,
      };
  }
}

function collectTypedDefinition(
  nameValue: string,
  entries: readonly RuntimeEntry[],
): Extract<SubgraphDefinitionV1, { readonly schemaKind: "typed" }> {
  const positioned: Array<
    Parameters<typeof collectPositionedNamedDefinitions>[0][number]
  > = [];
  for (const entry of entries) {
    switch (entry.entryKind) {
      case "type":
      case "resolveType":
      case "isTypeOf":
        positioned.push({ descriptor: entry.type, position: "type" });
        break;
      case "field":
        for (const descriptor of Object.values(entry.target.args)) {
          positioned.push({ descriptor, position: "input" });
        }
        positioned.push({
          descriptor: entry.target.returns,
          position: "output",
        });
        break;
      case "query":
      case "mutation":
      case "subscription":
        for (const descriptor of Object.values(entry.args)) {
          positioned.push({ descriptor, position: "input" });
        }
        positioned.push({ descriptor: entry.returns, position: "output" });
        break;
    }
  }
  const types = collectPositionedNamedDefinitions(positioned, {
    inputUnknownKeys: "reject",
  });
  const typeIndex = new Map(types.map((type) => [type.name, type]));
  const resolverCoordinates = new Set<string>();
  const structuredEntries: SubgraphEntryDefinitionV1[] = [];

  for (const entry of entries) {
    const structured = structuredEntry(entry);
    if (structured === null) continue;
    let coordinate: string;
    if (
      structured.kind === "query" ||
      structured.kind === "mutation" ||
      structured.kind === "subscription"
    ) {
      const root =
        structured.kind === "query"
          ? "Query"
          : structured.kind === "mutation"
            ? "Mutation"
            : "Subscription";
      coordinate = `${root}.${structured.fieldName}`;
      if (
        FEDERATION_NAMES.has(
          structured.returns.kind === "list" ? "" : structured.returns.name,
        ) ||
        structured.fieldName === "_service" ||
        structured.fieldName === "_entities"
      ) {
        failDefinition({
          code: "PH-GQL-FEDERATION-UNSUPPORTED",
          path: ["entries", structured.key],
          message:
            "Typed Federation declarations are not supported in subgraph format V1.",
          repair: "Use graphql-ast-compat mode to preserve Federation syntax.",
        });
      }
    } else if (structured.kind === "field") {
      coordinate = `${structured.target.typeName}.${structured.target.fieldName}`;
      const target = typeIndex.get(structured.target.typeName);
      const field =
        target?.kind === "object" || target?.kind === "interface"
          ? target.fields.find(
              (candidate) => candidate.name === structured.target.fieldName,
            )
          : undefined;
      if (!field || field.args === undefined) {
        failDefinition({
          code: "PH-GQL-COMPUTED-FIELD-TARGET-UNRESOLVED",
          path: ["entries", structuredEntries.length, "target"],
          message: `Computed field ${coordinate} is not reachable from the typed schema.`,
          repair:
            "Make its object type reachable or add a type(...) entry before the resolver.",
        });
      }
    } else if ("typeName" in structured) {
      coordinate = `${structured.typeName}.__${structured.kind}`;
      if (!typeIndex.has(structured.typeName)) {
        failDefinition({
          code: "PH-GQL-RESOLVER-TARGET-UNRESOLVED",
          path: ["entries", structuredEntries.length, "typeName"],
          message: `Resolver target ${structured.typeName} is not reachable from the typed schema.`,
          repair: "Make the target type reachable or add a type(...) entry.",
        });
      }
    } else {
      return failDefinition({
        code: "PH-GQL-ENTRY-INVALID",
        path: ["entries", structuredEntries.length],
        message: "A typed subgraph entry has an unsupported shape.",
        repair: "Recreate the entry with a current entry builder.",
      });
    }
    if (resolverCoordinates.has(coordinate)) {
      failDefinition({
        code: "PH-GQL-RESOLVER-DUPLICATE",
        path: ["entries", structuredEntries.length],
        message: `Resolver coordinate ${coordinate} is declared more than once.`,
        repair: "Keep one resolver entry for each GraphQL coordinate.",
      });
    }
    resolverCoordinates.add(coordinate);
    structuredEntries.push(structured);
  }

  for (const type of types) {
    if (FEDERATION_NAMES.has(type.name)) {
      failDefinition({
        code: "PH-GQL-FEDERATION-UNSUPPORTED",
        path: ["types", type.name],
        message:
          "Typed Federation declarations are not supported in subgraph format V1.",
        repair: "Use graphql-ast-compat mode to preserve Federation syntax.",
      });
    }
    if (type.kind !== "object") continue;
    for (const field of type.fields) {
      if (
        field.args !== undefined &&
        !resolverCoordinates.has(`${type.name}.${field.name}`)
      ) {
        failDefinition({
          code: "PH-GQL-COMPUTED-FIELD-RESOLVER-MISSING",
          path: ["types", type.name, "fields", field.key],
          message: `Computed field ${type.name}.${field.name} has no resolver entry.`,
          repair: "Add a field(Object.field, { resolve }) entry.",
        });
      }
    }
  }

  const scalarNames: ScalarNameV1[] = [];
  const seenScalars = new Set<ScalarNameV1>();
  const visitReference = (type: TypeReferenceDefinitionV1): void => {
    if (type.kind === "list") return visitReference(type.item);
    if (type.kind !== "scalar" || BUILT_IN_SCALARS.has(type.name)) return;
    if (!(scalarCatalog.names as readonly string[]).includes(type.name)) {
      failDefinition({
        code: "PH-SCALAR-UNREGISTERED",
        path: ["scalars", type.name],
        message: `Scalar ${type.name} is absent from the compiler-owned catalog.`,
        repair: "Use a scalar exposed by ph or use graphql-ast-compat mode.",
      });
    }
    if (!seenScalars.has(type.name)) {
      seenScalars.add(type.name);
      scalarNames.push(type.name);
    }
  };
  const visitInput = (field: InputFieldDefinitionV1) =>
    visitReference(field.type);
  for (const type of types) {
    if (type.kind === "union" || type.kind === "enum") continue;
    for (const field of type.fields) {
      visitReference(field.type);
      if ("args" in field) field.args?.forEach(visitInput);
    }
  }
  for (const entry of structuredEntries) {
    if (
      entry.kind === "query" ||
      entry.kind === "mutation" ||
      entry.kind === "subscription"
    ) {
      entry.args.forEach(visitInput);
      visitReference(entry.returns);
    }
  }
  const scalars: SubgraphScalarReferenceDefinitionV1[] = scalarNames.map(
    (name) => ({
      name,
      implementation: `powerhouse.catalog#${name}`,
      graphQLProfile: "legacy-graphql-default-v1",
    }),
  );

  return {
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name: nameValue,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "typed",
    hasSubscriptions: structuredEntries.some(
      (entry) => entry.kind === "subscription",
    ),
    types,
    entries: structuredEntries,
    scalars,
  };
}

function resolverRecord(
  value: unknown,
  path: readonly (string | number)[],
  required: true,
): Readonly<Record<string, unknown>>;
function resolverRecord(
  value: unknown,
  path: readonly (string | number)[],
  required: false,
): Readonly<Record<string, unknown>> | undefined;
function resolverRecord(
  value: unknown,
  path: readonly (string | number)[],
  required: boolean,
): Readonly<Record<string, unknown>> | undefined {
  const inspected = snapshotDataRecord(value, {
    allowCustomPrototype: true,
    ignoreNonEnumerable: true,
  });
  if (inspected.ok) return inspected.value;
  if (!required && inspected.reason === "not-record") return undefined;
  return failDefinition({
    code: "PH-GQL-RESOLVER-MAP-INVALID",
    path:
      inspected.key === undefined
        ? path
        : [
            ...path,
            typeof inspected.key === "number"
              ? inspected.key
              : String(inspected.key),
          ],
    message:
      "The compatibility resolver factory must return stable object maps.",
    repair:
      "Return plain resolver maps without accessors, proxies, or symbol keys.",
  });
}

function resolverCoordinates(
  resolverValue: unknown,
): readonly ResolverCoordinateDefinitionV1[] {
  const resolvers = resolverRecord(
    resolverValue,
    ["compatibility", "getResolvers"],
    true,
  );
  const result: ResolverCoordinateDefinitionV1[] = [];
  for (const [typeName, typeResolver] of Object.entries(resolvers)) {
    const typeMap = resolverRecord(
      typeResolver,
      ["compatibility", "getResolvers", typeName],
      false,
    );
    if (!typeMap) continue;
    if (
      typeof typeMap.serialize === "function" ||
      typeof typeMap.parseValue === "function" ||
      typeof typeMap.parseLiteral === "function"
    ) {
      result.push({ typeName, fieldName: null, resolverKind: "scalar" });
      continue;
    }
    const values = Object.entries(typeMap);
    if (
      values.length > 0 &&
      values.every(([fieldName, value]) => {
        if (typeof value === "function") return false;
        const wrapper = resolverRecord(
          value,
          ["compatibility", "getResolvers", typeName, fieldName],
          false,
        );
        return (
          !wrapper ||
          (typeof wrapper.resolve !== "function" &&
            typeof wrapper.subscribe !== "function")
        );
      })
    ) {
      result.push({ typeName, fieldName: null, resolverKind: "enum" });
      continue;
    }
    for (const [fieldName, resolver] of values) {
      if (fieldName === "__resolveType" && typeof resolver === "function") {
        result.push({ typeName, fieldName: null, resolverKind: "resolveType" });
      } else if (fieldName === "__isTypeOf" && typeof resolver === "function") {
        result.push({ typeName, fieldName: null, resolverKind: "isTypeOf" });
      } else if (typeof resolver === "function") {
        result.push({ typeName, fieldName, resolverKind: "field" });
      } else {
        const wrapper = resolverRecord(
          resolver,
          ["compatibility", "getResolvers", typeName, fieldName],
          false,
        );
        if (typeof wrapper?.subscribe === "function") {
          result.push({ typeName, fieldName, resolverKind: "subscribe" });
        }
        if (typeof wrapper?.resolve === "function") {
          result.push({ typeName, fieldName, resolverKind: "resolve" });
        }
      }
    }
  }
  return result;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

function createDefinitionProbe(): unknown {
  const state: { value?: unknown } = {};
  const target = () => state.value;
  const probe: unknown = new Proxy(target, {
    get(_value, property) {
      if (property === Symbol.toPrimitive) return () => "definition-probe";
      if (property === "then") return undefined;
      return probe;
    },
    apply() {
      return probe;
    },
    construct() {
      return probe as object;
    },
  });
  state.value = probe;
  return probe;
}

function resolverCall(
  resolver: RuntimeFunction,
  subgraph: Record<string, unknown>,
) {
  return (
    parent: unknown,
    args: Record<string, unknown>,
    request: unknown,
    info: unknown,
  ) =>
    resolver({
      parent,
      args,
      subgraph,
      request,
      info,
    });
}

function typedResolvers(
  entries: readonly RuntimeEntry[],
  subgraph: Record<string, unknown>,
): Record<string, unknown> {
  const result = Object.create(null) as Record<string, Record<string, unknown>>;
  const target = (typeName: string) =>
    (result[typeName] ??= Object.create(null) as Record<string, unknown>);
  for (const entry of entries) {
    switch (entry.entryKind) {
      case "type":
        break;
      case "query":
      case "mutation": {
        const root = entry.entryKind === "query" ? "Query" : "Mutation";
        target(root)[entry.fieldName] = resolverCall(
          entry.resolve as RuntimeFunction,
          subgraph,
        );
        break;
      }
      case "subscription": {
        const resolver: Record<string, unknown> = {
          subscribe: resolverCall(entry.subscribe as RuntimeFunction, subgraph),
        };
        if (entry.resolve) {
          resolver.resolve = resolverCall(entry.resolve, subgraph);
        }
        target("Subscription")[entry.fieldName] = resolver;
        break;
      }
      case "field":
        target(entry.target.objectName)[entry.target.key] = resolverCall(
          entry.resolve,
          subgraph,
        );
        break;
      case "resolveType":
        target(entry.type.name as string).__resolveType = (
          value: unknown,
          request: unknown,
          info: unknown,
          abstractType: unknown,
        ) => {
          const resolved = entry.resolve({
            value,
            subgraph,
            request,
            info,
            abstractType,
          });
          if (resolved instanceof Promise) {
            return resolved.then((item: unknown) =>
              isRecord(item) && typeof item.name === "string"
                ? item.name
                : item,
            );
          }
          return isRecord(resolved) && typeof resolved.name === "string"
            ? resolved.name
            : resolved;
        };
        break;
      case "isTypeOf":
        target(entry.type.name as string).__isTypeOf = (
          value: unknown,
          request: unknown,
          info: unknown,
        ) =>
          entry.resolve({
            value,
            subgraph,
            request,
            info,
          });
        break;
    }
  }
  return result;
}

export function createSubgraphDefiner<
  TArgs,
  TContext,
  TDocument,
  TInfo = unknown,
  TAbstractType = unknown,
  TInstance extends SubgraphBaseInstance<TDocument> =
    SubgraphBaseInstance<TDocument>,
  TBase extends SubgraphBaseConstructor<TArgs, TDocument, TInstance> =
    SubgraphBaseConstructor<TArgs, TDocument, TInstance>,
>(Base: TBase) {
  return function defineBoundSubgraph<TRequest extends TContext = TContext>(
    configValue: SubgraphConfig<
      TRequest,
      TInstance,
      TDocument,
      TInfo,
      TAbstractType
    >,
  ): DefinedSubgraphConstructor<TArgs, TInstance, TBase> {
    const config = snapshotRecord(configValue, []);
    const schemaKind: unknown = config.schemaKind;
    const allowed = new Set([
      "name",
      "onSetup",
      "schemaKind",
      ...(schemaKind === "typed" ? ["entries"] : ["compatibility"]),
    ]);
    assertKeys(config, allowed, []);
    const nameValue = config.name;
    if (typeof nameValue !== "string" || nameValue.length === 0) {
      failDefinition({
        code: "PH-GQL-SUBGRAPH-NAME-INVALID",
        path: ["name"],
        message: "A subgraph name must be a nonempty string.",
        repair: "Use the existing route segment as the subgraph name.",
      });
    }
    const subgraphName = nameValue as string;
    const setupValue = config.onSetup;
    if (setupValue !== undefined) {
      assertFunction(setupValue, ["onSetup"]);
    }

    let definition: SubgraphDefinitionV1;
    let typedEntries: readonly RuntimeEntry[] | undefined;
    let compatibilityResolvers:
      | ((call: { readonly subgraph: TInstance }) => Record<string, unknown>)
      | undefined;
    let runtimeTypeDefs: TDocument;
    let runtimeHasSubscriptions: boolean | undefined;

    if (schemaKind === "typed") {
      const typedConfig = config as unknown as Extract<
        SubgraphConfig<TRequest, TInstance, TDocument, TInfo, TAbstractType>,
        { readonly schemaKind: "typed" }
      >;
      assertFunction(typedConfig.entries, ["entries"]);
      typedEntries = assertRuntimeEntries(
        typedConfig.entries(
          createEntryBuilders() as EntryBuilders<
            TInstance,
            TRequest,
            TInfo,
            TAbstractType
          >,
        ),
      );
      definition = collectTypedDefinition(subgraphName, typedEntries);
      runtimeTypeDefs = buildTypedSubgraphDocument(
        definition as Extract<
          SubgraphDefinitionV1,
          { readonly schemaKind: "typed" }
        >,
      ) as unknown as TDocument;
      runtimeHasSubscriptions = definition.hasSubscriptions;
    } else if (schemaKind === "graphql-ast-compat") {
      const compatibilityConfig = config as unknown as Extract<
        SubgraphConfig<TRequest, TInstance, TDocument, TInfo, TAbstractType>,
        { readonly schemaKind: "graphql-ast-compat" }
      >;
      const compatibility = snapshotRecord(compatibilityConfig.compatibility, [
        "compatibility",
      ]);
      assertKeys(
        compatibility,
        new Set([
          "kind",
          "typeDefs",
          "getResolvers",
          "hasSubscriptions",
          "preserveDefinitionOrder",
        ]),
        ["compatibility"],
      );
      const compatibilityKind: unknown = compatibility.kind;
      const preserveDefinitionOrder: unknown =
        compatibility.preserveDefinitionOrder;
      const getResolvers = compatibility.getResolvers;
      const typeDefs = compatibility.typeDefs as TDocument;
      const hasSubscriptions = compatibility.hasSubscriptions;
      if (
        compatibilityKind !== "graphql-ast-v1" ||
        preserveDefinitionOrder !== true ||
        (hasSubscriptions !== undefined &&
          typeof hasSubscriptions !== "boolean")
      ) {
        failDefinition({
          code: "PH-GQL-COMPATIBILITY-INVALID",
          path: ["compatibility"],
          message: "The GraphQL AST compatibility contract is incomplete.",
          repair:
            "Use kind graphql-ast-v1, preserveDefinitionOrder true, and the exact legacy transport flag.",
        });
      }
      assertFunction(getResolvers, ["compatibility", "getResolvers"]);
      const document = toLocationFreeDocument(typeDefs);
      const coordinateProbe = getResolvers({
        subgraph: createDefinitionProbe() as TInstance,
      });
      definition = {
        kind: "powerhouse.subgraph",
        formatVersion: 1,
        name: subgraphName,
        compositionPolicy: "host-current",
        federationProfile: "host-current",
        schemaKind: "graphql-ast-compat",
        hasSubscriptions: hasSubscriptions ?? null,
        document,
        resolverCoordinates: resolverCoordinates(coordinateProbe),
        access: "manual",
      };
      compatibilityResolvers = getResolvers as (call: {
        readonly subgraph: TInstance;
      }) => Record<string, unknown>;
      runtimeTypeDefs = typeDefs;
      runtimeHasSubscriptions = hasSubscriptions as boolean | undefined;
    } else {
      return failDefinition({
        code: "PH-GQL-SCHEMA-KIND-INVALID",
        path: ["schemaKind"],
        message: "A subgraph schemaKind must be typed or graphql-ast-compat.",
        received: String(schemaKind),
        repair: "Choose one of the two supported schema declaration modes.",
      });
    }

    const frozenDefinition = deepFreeze(definition);
    const setup = setupValue as
      | ((request: { readonly subgraph: TInstance }) => void | Promise<void>)
      | undefined;
    const BoundBase = Base as unknown as SubgraphBaseConstructor<
      TArgs,
      TDocument
    >;

    class DefinedSubgraph extends BoundBase {
      static readonly definition = frozenDefinition;
      declare name: string;
      declare typeDefs: TDocument;
      declare resolvers: Record<string, unknown>;
      declare hasSubscriptions?: boolean;

      constructor(args: TArgs) {
        super(args);
        this.name = subgraphName;
        this.typeDefs = runtimeTypeDefs;
        this.hasSubscriptions = runtimeHasSubscriptions;
        this.resolvers = typedEntries
          ? typedResolvers(
              typedEntries,
              this as unknown as Record<string, unknown>,
            )
          : (
              compatibilityResolvers as NonNullable<
                typeof compatibilityResolvers
              >
            )({
              subgraph: this as unknown as TInstance,
            });
      }

      async onSetup(): Promise<void> {
        await setup?.({
          subgraph: this as unknown as TInstance,
        });
      }
    }

    compiledSubgraphDefinitions.set(DefinedSubgraph, frozenDefinition);

    return DefinedSubgraph as unknown as DefinedSubgraphConstructor<
      TArgs,
      TInstance,
      TBase
    >;
  };
}
