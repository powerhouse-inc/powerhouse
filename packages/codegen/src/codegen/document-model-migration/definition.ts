/** Writing a version's definition.ts: its types as ph declarations, in an order TypeScript can infer. */
import { camelCase, pascalCase } from "change-case";
import { Kind, type TypeNode } from "graphql";
import { literal, refuse, type VersionContext } from "./context.js";
import {
  constValue,
  type DeclaredType,
  deprecation,
  description,
  eagerReferences,
  referencedTypes,
  scalarBuilders,
} from "./stored-model.js";

/**
 * Declaration order: each type after the types it names, so field types are
 * inferred. A field can name a later type through a thunk, but a union's
 * members and implemented interfaces cannot, so those are always declared
 * first; a cycle through them alone is refused.
 */
export function declarationOrder(
  types: ReadonlyMap<string, DeclaredType>,
): string[] {
  const eager = (name: string) => {
    const declared = types.get(name);
    return declared === undefined
      ? []
      : eagerReferences(declared.node).filter((used) => types.has(used));
  };
  const fields = (name: string) => {
    const declared = types.get(name);
    return declared === undefined
      ? []
      : referencedTypes(declared.node, types).filter(
          (used) => !eager(name).includes(used),
        );
  };
  /** Every type `name` needs declared before it, through eager lists alone. */
  const eagerClosure = (name: string): Set<string> => {
    const seen = new Set<string>();
    const walk = (current: string) => {
      for (const used of eager(current)) {
        if (seen.has(used)) continue;
        seen.add(used);
        walk(used);
      }
    };
    walk(name);
    return seen;
  };
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string) => {
    if (state.has(name)) return;
    state.set(name, "visiting");
    for (const used of eager(name)) {
      if (state.get(used) === "visiting") {
        const { where, file } = types.get(name)!;
        refuse(
          file,
          undefined,
          `${name} in ${where} lists ${used}, which lists ${name} again through union members or implemented interfaces, so neither can be declared first.`,
          "Break the cycle in the schema: a union's members and implemented interfaces cannot refer back to the type.",
        );
      }
      visit(used);
    }
    for (const used of fields(name)) {
      // Declaring `used` now must not need a type that is still being declared.
      const needs = [used, ...eagerClosure(used)];
      if (
        state.has(used) ||
        needs.some((need) => state.get(need) === "visiting")
      ) {
        continue;
      }
      visit(used);
    }
    state.set(name, "done");
    order.push(name);
  };
  for (const name of types.keys()) visit(name);
  return order;
}

export type FieldOptions = {
  readonly required: boolean;
  readonly description?: string;
  readonly deprecated?: string;
  readonly defaultValue?: unknown;
  readonly hasDefault?: boolean;
};

export function optionsText(options: FieldOptions): string {
  const parts = [
    options.required && "required: true",
    options.description !== undefined &&
      `description: ${literal(options.description)}`,
    options.deprecated !== undefined &&
      `deprecated: ${literal(options.deprecated)}`,
    options.hasDefault === true &&
      `defaultValue: ${literal(options.defaultValue ?? null)}`,
  ].filter(Boolean);
  return parts.length === 0 ? "" : `{ ${parts.join(", ")} }`;
}

export const withHead = (head: string, options: FieldOptions) => {
  const text = optionsText(options);
  return head === "" ? text : text === "" ? head : `${head}, ${text}`;
};

/**
 * Spells the declared types as `ph` declarations, in declaration order. With
 * `only`, it declares those types and names the others through `reference`.
 */
export function typeDeclarations(
  types: ReadonlyMap<string, DeclaredType>,
  scope?: {
    readonly only: ReadonlySet<string>;
    readonly reference: (name: string) => string;
  },
): {
  readonly text: string;
  readonly annotations: ReadonlySet<string>;
  /**
   * Types that name a later type, as a recursive type does: TypeScript cannot
   * infer them, so they are annotated with a descriptor type and lose their
   * field types.
   */
  readonly loose: ReadonlySet<string>;
} {
  const own =
    scope === undefined
      ? types
      : new Map([...types].filter(([name]) => scope.only.has(name)));
  /** A type another file declares, which this one names through `scope.reference`. */
  const external = (name: string) => types.has(name) && !own.has(name);
  const reference = (name: string) =>
    scope !== undefined && external(name) ? scope.reference(name) : name;
  const declared = new Set<string>();
  const annotations = new Set<string>();
  const loose = new Set<string>();
  // Types whose fields name a type declared after them, through a thunk.
  const thunked = new Set<string>();
  let current = "";
  const fieldText = (
    type: TypeNode,
    extra: Omit<FieldOptions, "required">,
    outer = true,
  ): string => {
    const required = type.kind === Kind.NON_NULL_TYPE;
    const inner = required ? type.type : type;
    const options: FieldOptions = outer ? { required, ...extra } : { required };
    if (inner.kind === Kind.LIST_TYPE) {
      return `ph.list(${withHead(fieldText(inner.type, {}, false), options)})`;
    }
    const name = inner.name.value;
    const builder = scalarBuilders.get(name);
    if (builder !== undefined && !types.has(name)) {
      return `ph.${builder}(${optionsText(options)})`;
    }
    if (declared.has(name) || external(name)) {
      return `ph.ref(${withHead(reference(name), options)})`;
    }
    thunked.add(current);
    return `ph.ref(${withHead(`() => ${name}`, options)})`;
  };
  const statements = declarationOrder(own).map((name) => {
    const { node } = types.get(name)!;
    current = name;
    const parts: string[] = [];
    const text = description(node);
    if (text !== undefined) parts.push(`description: ${literal(text)}`);
    let builder: string;
    let annotation: string | undefined;
    switch (node.kind) {
      case Kind.ENUM_TYPE_DEFINITION: {
        builder = "enum";
        const values = (node.values ?? []).map((value) => {
          const valueDescription = description(value);
          const deprecated = deprecation(value);
          if (valueDescription === undefined && deprecated === undefined) {
            return literal(value.name.value);
          }
          return `{ ${[
            `name: ${literal(value.name.value)}`,
            valueDescription !== undefined &&
              `description: ${literal(valueDescription)}`,
            deprecated !== undefined && `deprecated: ${literal(deprecated)}`,
          ]
            .filter(Boolean)
            .join(", ")} }`;
        });
        parts.push(`values: [${values.join(", ")}]`);
        break;
      }
      case Kind.UNION_TYPE_DEFINITION:
        builder = "union";
        parts.push(
          `members: [${(node.types ?? []).map((member) => reference(member.name.value)).join(", ")}]`,
        );
        break;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION: {
        builder = "input";
        const fields = (node.fields ?? []).map(
          (field) =>
            `${literal(field.name.value)}: ${fieldText(field.type, {
              ...(description(field) !== undefined && {
                description: description(field),
              }),
              ...(deprecation(field) !== undefined && {
                deprecated: deprecation(field),
              }),
              ...(field.defaultValue !== undefined && {
                hasDefault: true,
                defaultValue: constValue(field.defaultValue),
              }),
            })}`,
        );
        parts.push(`fields: { ${fields.join(", ")} }`);
        annotation = "InputDescriptor";
        break;
      }
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_DEFINITION: {
        builder =
          node.kind === Kind.OBJECT_TYPE_DEFINITION ? "object" : "interface";
        const implemented = (node.interfaces ?? []).map((entry) =>
          reference(entry.name.value),
        );
        if (implemented.length > 0) {
          parts.push(`implements: [${implemented.join(", ")}]`);
        }
        const fields = (node.fields ?? []).map(
          (field) =>
            `${literal(field.name.value)}: ${fieldText(field.type, {
              ...(description(field) !== undefined && {
                description: description(field),
              }),
              ...(deprecation(field) !== undefined && {
                deprecated: deprecation(field),
              }),
            })}`,
        );
        parts.push(`fields: { ${fields.join(", ")} }`);
        annotation =
          node.kind === Kind.OBJECT_TYPE_DEFINITION
            ? "ObjectDescriptor"
            : "InterfaceDescriptor";
        break;
      }
    }
    declared.add(name);
    const typed = thunked.has(name) ? annotation : undefined;
    if (typed !== undefined) {
      annotations.add(typed);
      loose.add(name);
    }
    return `export const ${name}${typed === undefined ? "" : `: ${typed}`} = ph.${builder}(${literal(name)}, { ${parts.join(", ")} });`;
  });
  return { text: statements.join("\n\n"), annotations, loose };
}

/** The types each file of the version declares through a thunk, as typeDeclarations finds them. */
export function looseTypes(context: VersionContext): ReadonlySet<string> {
  const files = new Map<string, Set<string>>();
  for (const name of context.types.keys()) {
    const file = context.inputHomes.get(name)?.path ?? "definition";
    files.set(file, (files.get(file) ?? new Set()).add(name));
  }
  return new Set(
    [...files.values()].flatMap((only) => [
      ...typeDeclarations(context.types, { only, reference: (name) => name })
        .loose,
    ]),
  );
}

/** Input and output types the compatibility names derive from. */
export function typeKinds(types: ReadonlyMap<string, DeclaredType>) {
  return new Map(
    [...types].map(([name, { node }]) => [
      name,
      node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ? "input" : "output",
    ]),
  );
}

export function initialValueOf(
  context: VersionContext,
  scope: "global" | "local",
): string {
  const raw = context.specification.state[scope].initialValue;
  if (raw.trim() === "") return "{}";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    refuse(
      context.specFile,
      undefined,
      `The ${scope} initial value of version ${context.version} is not JSON.`,
      "Fix the initial state in the document model editor, then migrate again.",
    );
  }
}

export function definitionFileText(context: VersionContext): string {
  const { model, version, specification, globalRoot, localRoot } = context;
  // The definition never names a module's input.
  const { text, annotations } = typeDeclarations(context.types, {
    only: new Set(
      [...context.types.keys()].filter((name) => !context.inputHomes.has(name)),
    ),
    reference: (name) => name,
  });
  const reachable = new Set<string>();
  const reach = (name: string) => {
    if (reachable.has(name)) return;
    reachable.add(name);
    const declared = context.types.get(name);
    if (declared === undefined) return;
    for (const used of referencedTypes(declared.node, context.types)) {
      reach(used);
    }
  };
  reach(globalRoot);
  if (localRoot !== undefined) reach(localRoot);
  for (const module of specification.modules) {
    for (const operation of module.operations) {
      reach(`${pascalCase(camelCase(operation.name))}Input`);
    }
  }
  const auxiliary = [...context.types.keys()].filter(
    (name) => !reachable.has(name),
  );
  const imports = [
    "defineDocumentModel",
    "ph",
    ...[...annotations].sort().map((name) => `type ${name}`),
  ];
  const local =
    localRoot === undefined
      ? ""
      : `local: { schema: ${localRoot}, initialValue: ${initialValueOf(context, "local")} },\n`;
  const examples = (scope: "global" | "local") => {
    const list = specification.state[scope].examples ?? [];
    return list.length === 0
      ? ""
      : `, examples: [${list.map((example) => `{ key: ${literal(example.id)}, value: ${literal(example.value)} }`).join(", ")}]`;
  };
  const author = {
    name: model.author?.name ?? "",
    website: model.author?.website ?? null,
  };
  const changeLog = specification.changeLog ?? [];
  return `/**
 * Version ${version} of the ${model.name} document model: its metadata, state types
 * and the types its modules share. Each module declares the inputs only its own
 * operations use. Migrated from the stored schema-first specification by
 * ph migrate; with the modules, this file is now the model's source of truth.
 */
import { ${imports.join(", ")} } from "document-model";

${text}

export const ${context.modelCamel}Model = defineDocumentModel({
  id: ${literal(model.id)},
  name: ${literal(model.name)},
  description: ${literal(model.description ?? "")},
  extension: ${literal(model.extension)},
  version: ${version},
  author: { name: ${literal(author.name)}, website: ${literal(author.website)} },
  ${changeLog.length > 0 ? `changeLog: ${literal(changeLog)},` : ""}
  scopes: {
    ${auxiliary.length > 0 ? `auxiliaryTypes: [${auxiliary.join(", ")}],` : ""}
    global: { schema: ${globalRoot}, initialValue: ${initialValueOf(context, "global")}${examples("global")} },
    ${local}
  },
});
`;
}
