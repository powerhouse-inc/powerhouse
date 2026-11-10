import type {
  DefinitionDiagnostic,
  DefinitionPath,
} from "@powerhousedao/shared/document-model";
import { isTypeDescriptor } from "../dsl/descriptor-registry.js";
import { ph } from "../dsl/field.js";
import {
  assertAuthoredName,
  assertFieldUse,
  snapshotDescriptorOptions,
  snapshotFieldMap,
  stringOption,
} from "../dsl/field-options.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  InputDescriptor,
} from "../dsl/types.js";
import { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { getGlobalRegistry } from "../kernel/global-registry.js";
import { subgraphDiagnostics } from "./diagnostic-codes.js";
import type {
  SubgraphEntry,
  SubgraphEntryBuilders,
  SubgraphResolveTypeCall,
  SubgraphResolverCall,
} from "./types.js";

export type EntryResolver = (
  call: SubgraphResolverCall<unknown, unknown, unknown, unknown, unknown>,
) => unknown;

export type EntryTypeResolver = (
  call: SubgraphResolveTypeCall<unknown, unknown, unknown, unknown>,
) => unknown;

export type EntryField = {
  readonly name: string;
  readonly args: InputDescriptor | null;
  readonly type: AnyFieldDescriptor;
  readonly description: string | null;
  readonly deprecated: string | null;
};

/**
 * What a builder recorded. A member is absent when the author's value was
 * invalid; `diagnostics` then says why, with paths relative to the entry.
 */
export type EntryRecord = {
  readonly diagnostics: readonly DefinitionDiagnostic[];
} & (
  | {
      readonly kind: "query" | "mutation";
      readonly field?: EntryField;
      readonly resolve?: EntryResolver;
    }
  | {
      readonly kind: "subscription";
      readonly field?: EntryField;
      readonly subscribe?: EntryResolver;
      readonly resolve?: EntryResolver;
    }
  | {
      readonly kind: "computed-field";
      readonly parent?: AnyTypeDescriptor;
      readonly field?: EntryField;
      readonly resolve?: EntryResolver;
    }
  | {
      readonly kind: "resolve-type";
      readonly type?: AnyTypeDescriptor;
      readonly resolveType?: EntryTypeResolver;
    }
  | {
      readonly kind: "type";
      readonly type?: AnyTypeDescriptor;
    }
);

type Collector = DefinitionDiagnosticCollector<
  keyof typeof subgraphDiagnostics.codes
>;

const records = getGlobalRegistry(
  "powerhouse.document-model.subgraph-entries.v1",
  () => new WeakMap<object, EntryRecord>(),
);

export function readEntry(value: unknown): EntryRecord | undefined {
  return value !== null && typeof value === "object"
    ? records.get(value)
    : undefined;
}

function register(record: EntryRecord): SubgraphEntry {
  const entry: SubgraphEntry = Object.freeze({ kind: record.kind });
  records.set(entry, Object.freeze(record));
  return entry;
}

const FIELD_SPEC_KEYS = ["args", "type", "description", "deprecated"];

function argsInput(
  value: unknown,
  path: DefinitionPath,
): InputDescriptor | null {
  if (value === undefined) return null;
  const members = snapshotFieldMap(value, path);
  const keys = Object.keys(members);
  if (keys.length === 0) return null;
  for (const key of keys) {
    assertAuthoredName(key, [...path, key]);
    assertFieldUse(members[key], [...path, key]);
  }
  return ph.input({
    fields: members as Readonly<Record<string, AnyFieldDescriptor>>,
  });
}

function entryField(
  collector: Collector,
  name: unknown,
  config: { readonly [key: string]: unknown },
): EntryField | undefined {
  const validName = collector.capture(() => assertAuthoredName(name, ["name"]));
  const args = collector.capture(() =>
    argsInput(config.args, ["spec", "args"]),
  );
  const type = collector.capture(() => {
    if (config.type === undefined) {
      subgraphDiagnostics.fail({
        code: "PH-SG-ENTRY-INVALID",
        path: ["spec", "type"],
        message: "The entry declares no type.",
        repair:
          "Add type: a field use such as ph.String() or ph.ref(SomeType).",
      });
    }
    assertFieldUse(config.type, ["spec", "type"]);
    return config.type;
  });
  const description = collector.capture(() =>
    stringOption(config, "description", ["spec"]),
  );
  const deprecated = collector.capture(() =>
    stringOption(config, "deprecated", ["spec"]),
  );
  if (
    validName === undefined ||
    args === undefined ||
    type === undefined ||
    description === undefined ||
    deprecated === undefined
  ) {
    return undefined;
  }
  return { name: validName, args, type, description, deprecated };
}

function resolverOption<TResolver = EntryResolver>(
  collector: Collector,
  value: unknown,
  path: DefinitionPath,
  subject: string,
): TResolver | undefined {
  if (typeof value === "function") return value as TResolver;
  collector.add({
    code: "PH-SG-RESOLVER-MISSING",
    path,
    message: `${subject} has no ${String(path.at(-1))} function.`,
    expected: "a function",
    received: describeReceived(value),
    repair: `Add ${String(path.at(-1))}: a function that takes { parent, args, request, info, subgraph }.`,
  });
  return undefined;
}

function snapshotSpec(
  collector: Collector,
  spec: unknown,
  keys: readonly string[],
): { readonly [key: string]: unknown } | undefined {
  return collector.capture(() =>
    snapshotDescriptorOptions(spec, keys, ["spec"]),
  );
}

function rootEntry(
  kind: "query" | "mutation" | "subscription",
  name: unknown,
  spec: unknown,
): SubgraphEntry {
  const collector: Collector = new DefinitionDiagnosticCollector(
    subgraphDiagnostics,
  );
  const functions =
    kind === "subscription" ? ["subscribe", "resolve"] : ["resolve"];
  const config = snapshotSpec(collector, spec, [
    ...FIELD_SPEC_KEYS,
    ...functions,
  ]);
  if (config === undefined) {
    return register({ kind, diagnostics: collector.diagnostics });
  }
  const field = entryField(collector, name, config);
  const subject = `${kind} ${JSON.stringify(field?.name ?? name)}`;
  if (kind === "subscription") {
    const subscribe = resolverOption(
      collector,
      config.subscribe,
      ["spec", "subscribe"],
      subject,
    );
    const resolve =
      config.resolve === undefined
        ? undefined
        : resolverOption(
            collector,
            config.resolve,
            ["spec", "resolve"],
            subject,
          );
    return register({
      kind,
      ...(field !== undefined && { field }),
      ...(subscribe !== undefined && { subscribe }),
      ...(resolve !== undefined && { resolve }),
      diagnostics: collector.diagnostics,
    });
  }
  const resolve = resolverOption(
    collector,
    config.resolve,
    ["spec", "resolve"],
    subject,
  );
  return register({
    kind,
    ...(field !== undefined && { field }),
    ...(resolve !== undefined && { resolve }),
    diagnostics: collector.diagnostics,
  });
}

function computedFieldEntry(
  parent: unknown,
  name: unknown,
  spec: unknown,
): SubgraphEntry {
  const collector: Collector = new DefinitionDiagnosticCollector(
    subgraphDiagnostics,
  );
  const objectParent =
    isTypeDescriptor(parent) && parent.kind === "object" ? parent : undefined;
  if (objectParent === undefined) {
    collector.add({
      code: "PH-SG-FIELD-PARENT-INVALID",
      path: ["parent"],
      message: "A computed field's parent must be an object type.",
      expected: "a descriptor returned by ph.object",
      received: isTypeDescriptor(parent)
        ? `${parent.kind} ${JSON.stringify(parent.name)}`
        : describeReceived(parent),
      repair: "Pass the ph.object type the field belongs to.",
    });
  }
  const config = snapshotSpec(collector, spec, [...FIELD_SPEC_KEYS, "resolve"]);
  if (config === undefined) {
    return register({
      kind: "computed-field",
      diagnostics: collector.diagnostics,
    });
  }
  const field = entryField(collector, name, config);
  const resolve = resolverOption(
    collector,
    config.resolve,
    ["spec", "resolve"],
    `field ${JSON.stringify(field?.name ?? name)}`,
  );
  return register({
    kind: "computed-field",
    ...(objectParent !== undefined && { parent: objectParent }),
    ...(field !== undefined && { field }),
    ...(resolve !== undefined && { resolve }),
    diagnostics: collector.diagnostics,
  });
}

function resolveTypeEntry(type: unknown, resolveType: unknown): SubgraphEntry {
  const collector: Collector = new DefinitionDiagnosticCollector(
    subgraphDiagnostics,
  );
  const abstract =
    isTypeDescriptor(type) &&
    (type.kind === "interface" || type.kind === "union")
      ? type
      : undefined;
  if (abstract === undefined) {
    collector.add({
      code: "PH-SG-RESOLVE-TYPE-INVALID",
      path: ["type"],
      message: "resolveType takes an interface or a union.",
      expected: "a descriptor returned by ph.interface or ph.union",
      received: isTypeDescriptor(type)
        ? `${type.kind} ${JSON.stringify(type.name)}`
        : describeReceived(type),
      repair:
        "Pass the abstract type. An object type needs no resolveType; GraphQL knows its type.",
    });
  }
  const subject = `resolveType for ${abstract?.name ?? "this type"}`;
  const resolver = resolverOption<EntryTypeResolver>(
    collector,
    resolveType,
    ["resolveType"],
    subject,
  );
  return register({
    kind: "resolve-type",
    ...(abstract !== undefined && { type: abstract }),
    ...(resolver !== undefined && {
      resolveType: resolver,
    }),
    diagnostics: collector.diagnostics,
  });
}

function typeEntry(type: unknown): SubgraphEntry {
  const collector: Collector = new DefinitionDiagnosticCollector(
    subgraphDiagnostics,
  );
  if (!isTypeDescriptor(type)) {
    collector.add({
      code: "PH-SG-ENTRY-INVALID",
      path: ["type"],
      message: "type takes a named type.",
      expected:
        "a descriptor returned by ph.object, ph.interface, ph.union, ph.enum, or ph.input",
      received: describeReceived(type),
      repair: "Pass the type the subgraph serves, such as an object type.",
    });
  }
  return register({
    kind: "type",
    ...(isTypeDescriptor(type) && { type }),
    diagnostics: collector.diagnostics,
  });
}

const builders = Object.freeze({
  query: (name: unknown, spec: unknown) => rootEntry("query", name, spec),
  mutation: (name: unknown, spec: unknown) => rootEntry("mutation", name, spec),
  subscription: (name: unknown, spec: unknown) =>
    rootEntry("subscription", name, spec),
  field: computedFieldEntry,
  resolveType: resolveTypeEntry,
  type: typeEntry,
});

/**
 * @experimental The builders a code-first subgraph declares its entries
 * with. Each call returns a frozen entry; `compileSubgraph` reports what is
 * wrong with it instead of the builder throwing.
 */
export function createSubgraphEntryBuilders<
  TSubgraph,
  TRequest,
  TInfo,
>(): SubgraphEntryBuilders<TSubgraph, TRequest, TInfo> {
  return builders as unknown as SubgraphEntryBuilders<
    TSubgraph,
    TRequest,
    TInfo
  >;
}
