import type {
  DefinitionPath,
  FieldDefinition,
  InputFieldDefinition,
  NamedGraphQLTypeDefinition,
  PowerhouseScalarName,
  SubgraphDefinition,
  SubgraphEntryDefinition,
  SubgraphScalarReferenceDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import { documentModelScalars } from "../../scalars/catalog.js";
import { storedScalarDefinition } from "../../scalars/stored-definition.js";
import type { ScalarDefinition } from "../../scalars/types.js";
import { DescriptorWalk } from "../compiler/descriptor-walk.js";
import { registerTypeDescriptor } from "../dsl/descriptor-registry.js";
import {
  type AnyTypeDescriptor,
  type InputDescriptor,
  NAMED_TYPE_ROLE,
  type ObjectDescriptor,
} from "../dsl/types.js";
import { buildValidator } from "../dsl/zod.js";
import { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { compareCodeUnits } from "../kernel/primitives.js";
import {
  type SubgraphDiagnosticCode,
  subgraphDiagnostics,
} from "./diagnostic-codes.js";
import { type EntryField, type EntryRecord, readEntry } from "./entries.js";
import {
  FEDERATION_QUERY_FIELDS,
  federationDirectiveUses,
} from "./federation.js";
import { ROOT_TYPES, subgraphRootTypes } from "./projection.js";
import type {
  SubgraphBinding,
  SubgraphCompilation,
  SubgraphEntry,
} from "./types.js";

type Collector = DefinitionDiagnosticCollector<SubgraphDiagnosticCode>;
type AnyBinding = SubgraphBinding<unknown, unknown, unknown>;

const SUBGRAPH_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ROOT_NAMES: ReadonlySet<string> = new Set(Object.values(ROOT_TYPES));

type FieldParts = {
  readonly args: readonly InputFieldDefinition[];
  readonly type: TypeReferenceDefinition;
};

/**
 * The walk takes named types, so an entry's arguments and output type go
 * through it as hidden types it never emits: the arguments as a named
 * input, the output type as the only field of an object. The walk then
 * resolves, claims and checks them as it does any type. The `__` prefix
 * keeps their names from colliding with an authored type.
 */
function hiddenArgs(name: string, args: InputDescriptor): InputDescriptor {
  return registerTypeDescriptor(
    Object.freeze({
      ...args,
      name,
      identity: Object.freeze({
        kind: "input" as const,
        name,
        description: null,
      }),
    }),
  );
}

function hiddenOutput(name: string, field: EntryField): ObjectDescriptor {
  const descriptor = {
    kind: "object" as const,
    role: NAMED_TYPE_ROLE,
    name,
    description: null,
    fields: Object.freeze({ [field.name]: field.type }),
    implements: Object.freeze([]),
    identity: Object.freeze({
      kind: "object" as const,
      name,
      description: null,
    }),
    validator: undefined as unknown as z.ZodType,
  };
  descriptor.validator = buildValidator(descriptor as AnyTypeDescriptor);
  return registerTypeDescriptor(Object.freeze(descriptor) as ObjectDescriptor);
}

class SubgraphWalk {
  readonly walk: DescriptorWalk;
  readonly #collector: Collector;
  readonly #coordinates = new Map<string, DefinitionPath>();
  #hidden = 0;

  constructor(collector: Collector) {
    this.#collector = collector;
    // Computed entries add fields to object types after the walk, so an
    // object may declare none of its own; compileSubgraph checks the result.
    this.walk = new DescriptorWalk(collector, { deferObjectFields: true });
  }

  claim(coordinate: string, path: DefinitionPath): boolean {
    const first = this.#coordinates.get(coordinate);
    if (first === undefined) {
      this.#coordinates.set(coordinate, path);
      return true;
    }
    this.#collector.add({
      code: "PH-SG-DUPLICATE-COORDINATE",
      path,
      message: `${coordinate} is bound twice.`,
      expected: "one entry per schema coordinate",
      received: coordinate,
      repair: "Remove one of the two entries, or rename one of the fields.",
      related: [{ path: first, message: "First bound here." }],
    });
    return false;
  }

  field(field: EntryField, path: DefinitionPath): FieldParts | undefined {
    const index = this.#hidden++;
    let args: readonly InputFieldDefinition[] | undefined = [];
    if (field.args !== null) {
      const input = this.walk.visitType(
        hiddenArgs(`__SubgraphArgs${index}`, field.args),
        "input",
        [...path, "args"],
        { emit: false },
      );
      args = input?.kind === "input" ? input.fields : undefined;
    }
    const output = this.walk.visitType(
      hiddenOutput(`__SubgraphField${index}`, field),
      "output",
      path,
      { emit: false },
    );
    const type = output?.kind === "object" ? output.fields[0]?.type : undefined;
    return args === undefined || type === undefined
      ? undefined
      : { args, type };
  }

  reached(
    descriptor: AnyTypeDescriptor,
    path: DefinitionPath,
  ): NamedGraphQLTypeDefinition | undefined {
    if (!this.walk.definitions.some(({ name }) => name === descriptor.name)) {
      return undefined;
    }
    return this.walk.visitType(descriptor, "output", path, { emit: false });
  }
}

function subgraphScalars(
  catalogScalars: ReadonlySet<string>,
  packageScalars: ReadonlyMap<string, ScalarDefinition>,
): readonly SubgraphScalarReferenceDefinition[] {
  const catalog = documentModelScalars
    .map(({ name }) => name as PowerhouseScalarName)
    .filter((name) => catalogScalars.has(name))
    .map(
      (name) =>
        ({
          name,
          implementation: `powerhouse.catalog#${name}`,
          graphQLProfile: "legacy-graphql-default-v1",
        }) as SubgraphScalarReferenceDefinition,
    );
  const declared = [...packageScalars]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([name, definition]): SubgraphScalarReferenceDefinition => ({
      name,
      implementation: `package#${name}`,
      graphQLProfile: "declared-coercion-v1",
      definition: storedScalarDefinition(definition),
    }));
  return [...catalog, ...declared];
}

function readEntries(
  collector: Collector,
  entries: unknown,
): readonly (EntryRecord | undefined)[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    collector.add({
      code: "PH-SG-ENTRY-INVALID",
      path: ["entries"],
      message: "A subgraph must declare at least one entry.",
      expected: "a nonempty array of entries",
      received: Array.isArray(entries)
        ? "empty array"
        : describeReceived(entries),
      repair:
        "Return the entries the builders made, such as [schema.query(...)].",
    });
    return [];
  }
  return entries.map((entry: unknown, index) => {
    const record = readEntry(entry);
    if (record === undefined) {
      collector.add({
        code: "PH-SG-ENTRY-INVALID",
        path: ["entries", index],
        message: "This entry was not made by the subgraph entry builders.",
        received: describeReceived(entry),
        repair:
          "Make each entry with query, mutation, subscription, field, resolveType, or type.",
      });
      return undefined;
    }
    collector.merge(
      record.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ["entries", index, ...diagnostic.path],
      })),
    );
    return record;
  });
}

function checkName(collector: Collector, name: unknown): void {
  if (typeof name === "string" && SUBGRAPH_NAME.test(name)) return;
  collector.add({
    code: "PH-SG-NAME-INVALID",
    path: ["name"],
    message:
      "A subgraph name must be lowercase kebab-case. It is the route segment and is never normalized.",
    expected: "a name such as invoices or invoice-payments",
    received: typeof name === "string" ? name : describeReceived(name),
    repair:
      "Use lowercase letters and digits, separated by single hyphens, starting with a letter.",
  });
}

function checkInterfaceImplementers(
  collector: Collector,
  types: readonly NamedGraphQLTypeDefinition[],
): void {
  const implemented = new Set(
    types.flatMap((type) =>
      type.kind === "object" ? (type.implements ?? []) : [],
    ),
  );
  for (const type of types) {
    if (type.kind !== "interface" || implemented.has(type.name)) continue;
    collector.add({
      code: "PH-SG-INTERFACE-UNIMPLEMENTED",
      path: ["types", type.name],
      message: `No object type of this subgraph implements the interface ${type.name}, so a field that returns it can only return null.`,
      expected: `an object type that implements ${type.name}`,
      received: type.name,
      repair: `Add schema.type(<Implementer>) for each object type that implements ${type.name}.`,
    });
  }
}

/**
 * @experimental Compiles a code-first subgraph's entries into its stored
 * definition, plus the functions a host binds to each schema coordinate.
 * It never throws for an invalid declaration; it reports diagnostics.
 */
export function compileSubgraph<TSubgraph, TRequest, TInfo>(input: {
  readonly name: string;
  readonly entries: readonly SubgraphEntry<TSubgraph, TRequest, TInfo>[];
}): SubgraphCompilation<TSubgraph, TRequest, TInfo> {
  const { name } = input;
  const collector: Collector = new DefinitionDiagnosticCollector(
    subgraphDiagnostics,
    typeof name === "string" ? { kind: "subgraph", key: name } : undefined,
  );
  checkName(collector, name);
  const records = readEntries(collector, input.entries);
  const subgraph = new SubgraphWalk(collector);
  const entries: SubgraphEntryDefinition[] = [];
  const bindings = new Map<string, AnyBinding>();
  const computed = new Map<string, FieldDefinition[]>();

  records.forEach((record, index) => {
    if (
      record === undefined ||
      (record.kind !== "query" &&
        record.kind !== "mutation" &&
        record.kind !== "subscription") ||
      record.field === undefined
    ) {
      return;
    }
    const path = ["entries", index];
    const typeName = ROOT_TYPES[record.kind];
    const fieldName = record.field.name;
    const coordinate = `${typeName}.${fieldName}`;
    if (record.kind === "query" && FEDERATION_QUERY_FIELDS.has(fieldName)) {
      collector.add({
        code: "PH-SG-FEDERATION-UNSUPPORTED",
        path,
        message: `${coordinate} is a field Apollo Federation adds to every subgraph.`,
        received: coordinate,
        repair: "Rename the query field.",
      });
      return;
    }
    if (!subgraph.claim(coordinate, path)) return;
    const parts = subgraph.field(record.field, path);
    if (parts === undefined) return;
    entries.push({
      kind: record.kind,
      key: fieldName,
      fieldName,
      description: record.field.description,
      deprecated: record.field.deprecated,
      args: parts.args,
      returns: parts.type,
      access: { kind: "manual" },
    });
    if (record.kind === "subscription") {
      if (record.subscribe === undefined) return;
      bindings.set(coordinate, {
        kind: "subscription",
        typeName: "Subscription",
        fieldName,
        subscribe: record.subscribe,
        ...(record.resolve !== undefined && { resolve: record.resolve }),
      });
    } else if (record.resolve !== undefined) {
      bindings.set(coordinate, {
        kind: record.kind,
        typeName,
        fieldName,
        resolve: record.resolve,
      });
    }
  });

  records.forEach((record, index) => {
    if (record?.kind !== "type" || record.type === undefined) return;
    subgraph.walk.visitType(
      record.type,
      record.type.kind === "input" ? "input" : "output",
      ["entries", index, "type"],
    );
  });

  // A computed field's own type can reach the parent of another, so fields
  // bind in rounds until no pending parent becomes reachable.
  let pending = records.flatMap((record, index) =>
    record?.kind === "computed-field" &&
    record.parent !== undefined &&
    record.field !== undefined
      ? [{ record, parent: record.parent, field: record.field, index }]
      : [],
  );
  for (let progressed = true; progressed;) {
    progressed = false;
    pending = pending.filter(({ record, parent, field, index }) => {
      const path = ["entries", index];
      const definition = subgraph.reached(parent, [...path, "parent"]);
      if (definition === undefined) return true;
      progressed = true;
      if (definition.kind !== "object") return false;
      const coordinate = `${definition.name}.${field.name}`;
      if (definition.fields.some(({ name }) => name === field.name)) {
        collector.add({
          code: "PH-SG-DUPLICATE-COORDINATE",
          path: [...path, "name"],
          message: `${definition.name} already declares the field ${field.name}.`,
          expected: "a field name the object type does not declare",
          received: coordinate,
          repair: `Rename the computed field, or remove ${field.name} from ${definition.name}'s fields.`,
        });
        return false;
      }
      if (!subgraph.claim(coordinate, path)) return false;
      const parts = subgraph.field(field, path);
      if (parts === undefined) return false;
      computed.set(definition.name, [
        ...(computed.get(definition.name) ?? []),
        {
          key: field.name,
          name: field.name,
          description: field.description,
          deprecated: field.deprecated,
          ...(parts.args.length > 0 && { args: parts.args }),
          type: parts.type,
        },
      ]);
      entries.push({
        kind: "computed-field",
        typeName: definition.name,
        fieldName: field.name,
        access: { kind: "manual" },
      });
      if (record.resolve !== undefined) {
        bindings.set(coordinate, {
          kind: "computed-field",
          typeName: definition.name,
          fieldName: field.name,
          resolve: record.resolve,
        });
      }
      return false;
    });
  }
  for (const { parent, index } of pending) {
    collector.add({
      code: "PH-SG-FIELD-PARENT-INVALID",
      path: ["entries", index, "parent"],
      message: `No entry of this subgraph reaches the object type ${parent.name ?? "(anonymous)"}, so the computed field has no parent in the schema.`,
      received: parent.name ?? "(anonymous)",
      repair: `Return ${parent.name ?? "the type"} from a query, mutation, subscription, or computed field, or remove the computed field.`,
    });
  }

  records.forEach((record, index) => {
    if (record?.kind !== "resolve-type" || record.type === undefined) return;
    const path = ["entries", index];
    const definition = subgraph.reached(record.type, [...path, "type"]);
    if (definition === undefined) {
      collector.add({
        code: "PH-SG-RESOLVE-TYPE-INVALID",
        path: [...path, "type"],
        message: `No entry of this subgraph reaches ${record.type.name ?? "(anonymous)"}.`,
        received: record.type.name ?? "(anonymous)",
        repair: `Return ${record.type.name ?? "the type"} from an entry, or remove its resolveType.`,
      });
      return;
    }
    if (!subgraph.claim(definition.name, path)) return;
    entries.push({
      kind: "resolve-type",
      typeName: definition.name,
      access: { kind: "manual" },
    });
    if (record.resolveType !== undefined) {
      bindings.set(definition.name, {
        kind: "resolve-type",
        typeName: definition.name,
        fieldName: null,
        resolveType: record.resolveType,
      });
    }
  });

  const { walk } = subgraph;
  const types = walk.definitions.map((type): NamedGraphQLTypeDefinition => {
    const fields = computed.get(type.name);
    return fields === undefined || type.kind !== "object"
      ? type
      : { ...type, fields: [...type.fields, ...fields] };
  });
  walk.checkObjectFields(types);
  walk.checkInterfaceImplementations(types);
  checkInterfaceImplementers(collector, types);
  walk.checkInputCycles();
  const named = [
    ...types.map(({ kind, name }) => ({ kind, name, group: "types" })),
    ...[...walk.packageScalars.keys()].map((name) => ({
      kind: "scalar",
      name,
      group: "scalars",
    })),
  ];
  for (const { kind, name, group } of named) {
    if (!ROOT_NAMES.has(name)) continue;
    collector.add({
      code: "PH-DM-DUPLICATE-NAME",
      path: [group, name],
      message: `GraphQL type name ${name} is a subgraph root type.`,
      expected: "a type name other than Query, Mutation, and Subscription",
      received: name,
      repair: `Rename the ${kind} type; the subgraph declares ${name} from its entries.`,
    });
  }
  const roots = subgraphRootTypes({ entries });
  for (const use of federationDirectiveUses([...roots, ...types])) {
    collector.add({
      code: "PH-SG-FEDERATION-UNSUPPORTED",
      path: use.path,
      message: `@${use.name} is an Apollo Federation directive, which a typed subgraph does not support.`,
      received: `@${use.name}`,
      repair:
        "Remove the directive. Federation entities are not supported yet.",
    });
  }

  const diagnostics = collector.diagnostics;
  if (diagnostics.some(({ severity }) => severity === "error")) {
    return { bindings: new Map(), diagnostics };
  }
  const scalars = subgraphScalars(walk.catalogScalars, walk.packageScalars);
  const definition: SubgraphDefinition & { readonly schemaKind: "typed" } = {
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "typed",
    hasSubscriptions: entries.some(({ kind }) => kind === "subscription"),
    types,
    entries,
    scalars,
    definitionOrder: [
      ...scalars.map((scalar) => scalar.name),
      ...roots.map((root) => root.name),
      ...types.map((type) => type.name),
    ],
  };
  return {
    definition,
    bindings: bindings as ReadonlyMap<
      string,
      SubgraphBinding<TSubgraph, TRequest, TInfo>
    >,
    diagnostics,
  };
}
