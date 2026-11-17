/** Walks the model into descriptors and getSchema entries, and prints schema.ts. */
import {
  type FieldDefinitionNode,
  type InputValueDefinitionNode,
  Kind,
  type TypeDefinitionNode,
  type TypeNode,
} from "graphql";
import {
  deprecationOf,
  description,
  type FieldOptions,
  type Json,
  jsonValue,
  type Located,
  type Model,
  type ScalarKind,
  sdlLine,
} from "./analysis.js";
import {
  isRootName,
  refuse,
  ROOT_KINDS,
  type RootName,
  sortedUnique,
} from "./context.js";
import type { ResolverCall } from "./resolver-members.js";

/** How a backend spells field uses, types and entries. */
type Backend<F, T, E> = {
  scalar(scalar: ScalarKind, options: FieldOptions): F;
  ref(typeName: string, declared: boolean, options: FieldOptions): F;
  list(item: F, options: FieldOptions): F;
  type(
    definition: TypeDefinitionNode,
    members: {
      readonly fields: readonly (readonly [string, F])[];
      readonly values: readonly {
        readonly name: string;
        readonly description?: string;
        readonly deprecated?: string;
      }[];
      readonly related: readonly string[];
    },
    thunked: boolean,
  ): T;
  entry(entry: EntrySpec<F>): E;
};

type EntrySpec<F> =
  | {
      readonly kind: "query" | "mutation" | "subscription" | "computed-field";
      readonly typeName: string;
      readonly fieldName: string;
      readonly description?: string;
      readonly deprecated?: string;
      readonly args: readonly (readonly [string, F])[];
      readonly type: F;
      readonly hasResolve: boolean;
    }
  | { readonly kind: "resolve-type"; readonly typeName: string }
  | { readonly kind: "type"; readonly typeName: string }
  | {
      readonly kind: "root";
      readonly root: (typeof ROOT_KINDS)[RootName];
      readonly description: string;
    }
  | {
      readonly kind: "entity";
      readonly typeName: string;
      readonly key: string;
    };

/** Walks the model once in declaration order, spelling it with `backend`. */
export function walk<F, T, E>(model: Model, backend: Backend<F, T, E>) {
  const refuseAt = (node: Located, reason: string, repair: string): never =>
    refuse(model.source.file, sdlLine(model.source, node), reason, repair);
  const declared = new Set<string>();
  let thunked = false;
  const use = (
    type: TypeNode,
    options: Omit<FieldOptions, "required">,
    outer = true,
  ): F => {
    const required = type.kind === Kind.NON_NULL_TYPE;
    const inner = required ? type.type : type;
    const full: FieldOptions = outer ? { required, ...options } : { required };
    if (inner.kind === Kind.LIST_TYPE) {
      return backend.list(use(inner.type, {}, false), full);
    }
    const name = inner.name.value;
    const scalar = model.scalars.get(name);
    if (scalar !== undefined) return backend.scalar(scalar, full);
    const isDeclared = declared.has(name);
    if (!isDeclared) thunked = true;
    return backend.ref(name, isDeclared, full);
  };
  const inputValue = (
    value: InputValueDefinitionNode,
  ): readonly [string, F] => [
    value.name.value,
    use(value.type, {
      ...(description(value) !== undefined && {
        description: description(value),
      }),
      ...(deprecationOf(value) !== undefined && {
        deprecated: deprecationOf(value),
      }),
      ...(value.defaultValue !== undefined && {
        defaultValue: jsonValue(value.defaultValue, refuseAt),
      }),
    }),
  ];
  const outputField = (field: FieldDefinitionNode): readonly [string, F] => [
    field.name.value,
    use(field.type, {
      ...(description(field) !== undefined && {
        description: description(field),
      }),
      ...(deprecationOf(field) !== undefined && {
        deprecated: deprecationOf(field),
      }),
    }),
  ];
  const types = model.types.map((definition) => {
    thunked = false;
    const name = definition.name.value;
    const fields =
      definition.kind === Kind.OBJECT_TYPE_DEFINITION
        ? (model.descriptorFields.get(name) ?? []).map(outputField)
        : definition.kind === Kind.INTERFACE_TYPE_DEFINITION
          ? (definition.fields ?? []).map(outputField)
          : definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
            ? (definition.fields ?? []).map(inputValue)
            : [];
    const values =
      definition.kind === Kind.ENUM_TYPE_DEFINITION
        ? (definition.values ?? []).map((value) => ({
            name: value.name.value,
            ...(description(value) !== undefined && {
              description: description(value),
            }),
            ...(deprecationOf(value) !== undefined && {
              deprecated: deprecationOf(value),
            }),
          }))
        : [];
    const related =
      definition.kind === Kind.UNION_TYPE_DEFINITION
        ? (definition.types ?? []).map((member) => member.name.value)
        : definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
            definition.kind === Kind.INTERFACE_TYPE_DEFINITION
          ? (definition.interfaces ?? []).map((entry) => entry.name.value)
          : [];
    const fieldsThunked = thunked;
    declared.add(name);
    return backend.type(definition, { fields, values, related }, fieldsThunked);
  });
  const fieldEntry = (
    kind: "query" | "mutation" | "subscription" | "computed-field",
    typeName: string,
    field: FieldDefinitionNode,
  ) =>
    backend.entry({
      kind,
      typeName,
      fieldName: field.name.value,
      ...(description(field) !== undefined && {
        description: description(field),
      }),
      ...(deprecationOf(field) !== undefined && {
        deprecated: deprecationOf(field),
      }),
      args: (field.arguments ?? []).map(inputValue),
      type: use(field.type, {}),
      hasResolve:
        kind !== "subscription" ||
        model.subscriptionsWithResolve.has(field.name.value),
    });
  const entries = [
    ...(Object.keys(ROOT_KINDS) as RootName[]).flatMap((root) => {
      const text = model.rootDescriptions[root];
      return text === undefined
        ? []
        : [
            backend.entry({
              kind: "root",
              root: ROOT_KINDS[root],
              description: text,
            }),
          ];
    }),
    ...(Object.keys(ROOT_KINDS) as RootName[]).flatMap((root) =>
      (model.roots[root] ?? []).map((field) =>
        fieldEntry(ROOT_KINDS[root], root, field),
      ),
    ),
    ...model.computed.map(({ typeName, field }) =>
      fieldEntry("computed-field", typeName, field),
    ),
    ...model.resolveTypes.map((typeName) =>
      backend.entry({ kind: "resolve-type", typeName }),
    ),
    ...model.typeEntries.map((typeName) =>
      backend.entry({ kind: "type", typeName }),
    ),
    ...model.entities.map(({ typeName, key }) =>
      backend.entry({ kind: "entity", typeName, key }),
    ),
  ];
  return { types, entries };
}

export const KIND_BUILDERS: Partial<
  Record<TypeDefinitionNode["kind"], string>
> = {
  [Kind.OBJECT_TYPE_DEFINITION]: "object",
  [Kind.INTERFACE_TYPE_DEFINITION]: "interface",
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: "input",
  [Kind.ENUM_TYPE_DEFINITION]: "enum",
  [Kind.UNION_TYPE_DEFINITION]: "union",
};

const DESCRIPTOR_TYPES: Partial<Record<TypeDefinitionNode["kind"], string>> = {
  [Kind.OBJECT_TYPE_DEFINITION]: "ObjectDescriptor",
  [Kind.INTERFACE_TYPE_DEFINITION]: "InterfaceDescriptor",
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: "InputDescriptor",
};

export type CodeText = {
  readonly text: string;
  /** Types and project scalars the text names, to import. */
  readonly types: readonly string[];
  readonly scalars: readonly string[];
  /** Whether the text calls `hostScalars`. */
  readonly host: boolean;
  readonly annotation?: string;
};

/** Spells the model as the source of `schema.ts` and of the `getSchema` entries. */
/** `local` names a type in the module the text goes into; `schema.ts` uses each type's own name. */
export function codeBackend(
  local: (typeName: string) => string = (typeName) => typeName,
  calls: ReadonlyMap<string, ResolverCall> = new Map(),
): Backend<string, CodeText, CodeText> {
  const literal = (value: Json) => JSON.stringify(value);
  const withOptions = (head: string, field: FieldOptions) => {
    const parts = [
      field.required && "required: true",
      field.description !== undefined &&
        `description: ${literal(field.description)}`,
      field.deprecated !== undefined &&
        `deprecated: ${literal(field.deprecated)}`,
      Object.hasOwn(field, "defaultValue") &&
        `defaultValue: ${literal(field.defaultValue ?? null)}`,
    ].filter(Boolean);
    const options = parts.length === 0 ? "" : `{ ${parts.join(", ")} }`;
    return head === ""
      ? options
      : options === ""
        ? head
        : `${head}, ${options}`;
  };
  // Field uses are spelled before the type or entry that holds them, which
  // then takes what they named.
  let types = new Set<string>();
  let scalars = new Set<string>();
  let host = false;
  const take = () => {
    const named = { types: [...types], scalars: [...scalars], host };
    types = new Set();
    scalars = new Set();
    host = false;
    return named;
  };
  const members = (entries: readonly (readonly [string, string])[]) =>
    `{ ${entries.map(([key, value]) => `${key}: ${value}`).join(", ")} }`;
  /**
   * Calls an inline resolver with the arguments it reads, and a referenced resolver with the full GraphQL argument list. A
   * field without a resolver keeps graphql's default one, as it had.
   */
  const delegate = (path: readonly string[], kind: "field" | "type") => {
    const names =
      kind === "field"
        ? ["parent", "args", "request", "info"]
        : ["value", "request", "info"];
    const target = calls.get(path.join("."));
    if (target === undefined) {
      // The host sets no root value, so a root field without a resolver
      // resolves to null.
      if (isRootName(path[0])) return "() => null";
      return `({ ${names.join(", ")} }) =>\n// No resolver: graphql's default one reads parent.${path[1]}, which the type of parent does not declare.\ndefaultFieldResolver(${names.join(", ")}) as never`;
    }
    const passed = names.slice(0, target.arity ?? names.length);
    const bound = target.callee.startsWith("subgraph.") ? ["subgraph"] : [];
    const parameters = [...passed, ...bound];
    return `(${parameters.length === 0 ? "" : `{ ${parameters.join(", ")} }`}) => ${target.callee}(${passed.join(", ")})`;
  };
  return {
    scalar(scalar, field) {
      if (scalar.kind === "host") {
        host = true;
        return `hostScalars.${scalar.builder}(${withOptions("", field)})`;
      }
      if (scalar.kind !== "project") {
        return `ph.${scalar.builder}(${withOptions("", field)})`;
      }
      scalars.add(scalar.exportName);
      return `ph.scalar(${withOptions(scalar.exportName, field)})`;
    },
    ref(typeName, declared, field) {
      types.add(typeName);
      const name = local(typeName);
      return `ph.ref(${withOptions(declared ? name : `() => ${name}`, field)})`;
    },
    list(item, field) {
      return `ph.list(${withOptions(item, field)})`;
    },
    type(definition, { fields, values, related }, thunked) {
      const name = definition.name.value;
      const builder = KIND_BUILDERS[definition.kind]!;
      const text = description(definition);
      const parts = text === undefined ? [] : [`description: ${literal(text)}`];
      if (builder === "union") {
        parts.push(`members: [${related.join(", ")}]`);
      } else if (related.length > 0) {
        parts.push(`implements: [${related.join(", ")}]`);
      }
      if (builder === "enum") {
        const spelled = values.map((value) =>
          value.description === undefined && value.deprecated === undefined
            ? literal(value.name)
            : `{ ${[
                `name: ${literal(value.name)}`,
                value.description !== undefined &&
                  `description: ${literal(value.description)}`,
                value.deprecated !== undefined &&
                  `deprecated: ${literal(value.deprecated)}`,
              ]
                .filter(Boolean)
                .join(", ")} }`,
        );
        parts.push(`values: [${spelled.join(", ")}]`);
      } else if (builder !== "union") {
        parts.push(`fields: ${members(fields)}`);
      }
      const annotation = thunked
        ? DESCRIPTOR_TYPES[definition.kind]
        : undefined;
      return {
        text: `export const ${name}${annotation === undefined ? "" : `: ${annotation}`} = ph.${builder}(${literal(name)}, { ${parts.join(", ")} });`,
        ...take(),
        ...(annotation !== undefined && { annotation }),
      };
    },
    entry(entry) {
      if (entry.kind === "type") {
        take();
        return {
          text: `schema.type(${local(entry.typeName)})`,
          types: [entry.typeName],
          scalars: [],
          host: false,
        };
      }
      if (entry.kind === "resolve-type") {
        take();
        return {
          text: `schema.resolveType(${local(entry.typeName)}, ${delegate([entry.typeName, "__resolveType"], "type")})`,
          types: [entry.typeName],
          scalars: [],
          host: false,
        };
      }
      if (entry.kind === "root") {
        take();
        return {
          text: `schema.root(${literal(entry.root)}, { description: ${literal(entry.description)} })`,
          types: [],
          scalars: [],
          host: false,
        };
      }
      if (entry.kind === "entity") {
        take();
        return {
          text: `schema.entity(${local(entry.typeName)}, { key: ${literal(entry.key)} })`,
          types: [entry.typeName],
          scalars: [],
          host: false,
        };
      }
      const spec = [
        entry.description !== undefined &&
          `description: ${literal(entry.description)}`,
        entry.deprecated !== undefined &&
          `deprecated: ${literal(entry.deprecated)}`,
        entry.args.length > 0 && `args: ${members(entry.args)}`,
        `type: ${entry.type}`,
      ].filter((part): part is string => typeof part === "string");
      const coordinate = [entry.typeName, entry.fieldName];
      if (entry.kind === "subscription") {
        // With resolve, the events are whatever resolve maps; nothing infers their type.
        spec.push(
          `subscribe: ${delegate([...coordinate, "subscribe"], "field")}`,
        );
        if (entry.hasResolve) {
          spec.push(
            `resolve: ${delegate([...coordinate, "resolve"], "field")}`,
          );
        }
      } else {
        spec.push(`resolve: ${delegate(coordinate, "field")}`);
      }
      const head =
        entry.kind === "computed-field"
          ? `schema.field(${local(entry.typeName)}, ${literal(entry.fieldName)}`
          : `schema.${entry.kind}(${literal(entry.fieldName)}`;
      const named = take();
      return {
        text: `${head}, { ${spec.join(", ")} })`,
        types:
          entry.kind === "computed-field"
            ? [...named.types, entry.typeName]
            : named.types,
        scalars: named.scalars,
        host: named.host,
      };
    },
  };
}

export function schemaFileText(model: Model, subgraphName: string): string {
  const { types } = walk(model, codeBackend());
  const annotations = sortedUnique(
    types.flatMap(({ annotation }) =>
      annotation === undefined ? [] : [annotation],
    ),
  );
  const scalars = sortedUnique(types.flatMap((type) => type.scalars));
  if (types.length === 0) {
    return `/**\n * The ${subgraphName} subgraph declares no types of its own.\n */\nexport {};\n`;
  }
  const host = types.some((type) => type.host) ? ["hostScalars"] : [];
  const imports = [
    `import { ${[...annotations.map((name) => `type ${name}`), ...host, "ph"].join(", ")} } from "document-model";`,
    ...(scalars.length === 0
      ? []
      : [`import { ${scalars.join(", ")} } from "../../scalars/index.js";`]),
  ];
  return `/**\n * The types of the ${subgraphName} subgraph, as \`ph\` descriptors.\n */\n${imports.join("\n")}\n\n${types.map(({ text }) => text).join("\n\n")}\n`;
}
