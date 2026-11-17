/** Reading a stored schema-first model: its specifications, their SDL, and what a code-first model cannot keep. */
import { camelCase, constantCase, pascalCase } from "change-case";
import { ph } from "document-model";
import {
  type ConstValueNode,
  type EnumTypeDefinitionNode,
  type FieldDefinitionNode,
  type InputObjectTypeDefinitionNode,
  type InputValueDefinitionNode,
  type InterfaceTypeDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  parse,
  print,
  type StringValueNode,
  visit,
  type TypeNode,
  type UnionTypeDefinitionNode,
} from "graphql";
import { z } from "zod";
import { type Input, refuse } from "./context.js";

export type StoredError = {
  readonly name: string;
  readonly code?: string | null;
  readonly description?: string | null;
  readonly template?: string | null;
};

export type StoredExample = { readonly id: string; readonly value: string };

export type StoredOperation = {
  readonly name: string;
  readonly description?: string | null;
  readonly schema?: string | null;
  readonly scope?: string | null;
  readonly errors?: readonly StoredError[];
  readonly examples?: readonly StoredExample[];
};

export type StoredModule = {
  readonly name: string;
  readonly description?: string | null;
  readonly operations: readonly StoredOperation[];
};

export type StoredScope = {
  readonly schema: string;
  readonly initialValue: string;
  readonly examples?: readonly StoredExample[];
};

export type StoredSpecification = {
  readonly version: number;
  readonly changeLog?: readonly string[];
  readonly state: { readonly global: StoredScope; readonly local: StoredScope };
  readonly modules: readonly StoredModule[];
};

export type StoredModel = {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly extension: string;
  readonly author?: {
    readonly name?: string | null;
    readonly website?: string | null;
  };
  readonly specifications: readonly StoredSpecification[];
};

export const BUILT_IN_SCALARS = new Set([
  "String",
  "Int",
  "Float",
  "Boolean",
  "ID",
]);

/** The `ph` factory of each built-in and catalog scalar, keyed by scalar name. */
export const scalarBuilders: ReadonlyMap<string, string> = new Map(
  Object.keys(ph).flatMap((key) => {
    const factory = (ph as Readonly<Record<string, unknown>>)[key];
    if (!/^[A-Z]/.test(key) || typeof factory !== "function") return [];
    const field = (factory as () => { identity?: { name?: string } })();
    const name = field.identity?.name;
    return typeof name === "string" ? [[name, key] as const] : [];
  }),
);

export type TypeDefinition =
  | ObjectTypeDefinitionNode
  | InputObjectTypeDefinitionNode
  | EnumTypeDefinitionNode
  | UnionTypeDefinitionNode
  | InterfaceTypeDefinitionNode;

export type DeclaredType = {
  readonly node: TypeDefinition;
  /** The stored specification the type was read from. */
  readonly file: string;
  /** The stored specification file and the SDL segment the type came from. */
  readonly where: string;
};

export const description = (node: { readonly description?: StringValueNode }) =>
  node.description?.value;

export function deprecation(node: {
  readonly directives?: readonly {
    readonly name: { readonly value: string };
    readonly arguments?: readonly {
      readonly name: { readonly value: string };
      readonly value: ConstValueNode;
    }[];
  }[];
}): string | undefined {
  const directive = node.directives?.find(
    (entry) => entry.name.value === "deprecated",
  );
  if (directive === undefined) return undefined;
  const reason = directive.arguments?.find(
    (argument) => argument.name.value === "reason",
  )?.value;
  return reason?.kind === Kind.STRING ? reason.value : "No longer supported";
}

export function constValue(node: ConstValueNode): unknown {
  switch (node.kind) {
    case Kind.INT:
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
      return node.values.map(constValue);
    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map((field) => [field.name.value, constValue(field.value)]),
      );
  }
}

export const namedTypeOf = (type: TypeNode): string =>
  type.kind === Kind.NAMED_TYPE ? type.name.value : namedTypeOf(type.type);

/**
 * Reads every named type the specification's SDL segments declare: the state
 * scopes and each operation's input. Refuses SDL a code-first declaration
 * cannot spell.
 */
export function declaredTypes(
  specification: StoredSpecification,
  file: string,
  rename: { readonly enabled: boolean; readonly prefix: string },
): {
  readonly types: Map<string, DeclaredType>;
  /** Old name to new name, for each type renamed off a scalar's name. */
  readonly renamed: ReadonlyMap<string, string>;
} {
  const segments: { readonly where: string; readonly text: string }[] = [
    { where: "state.global.schema", text: specification.state.global.schema },
    { where: "state.local.schema", text: specification.state.local.schema },
    ...specification.modules.flatMap((module) =>
      module.operations.map((operation) => ({
        where: `${module.name}.${operation.name}.schema`,
        text: operation.schema ?? "",
      })),
    ),
  ];
  const parsed = segments.flatMap(({ where, text }) => {
    if (text.trim() === "") return [];
    try {
      return [{ where, document: parse(text, { noLocation: true }) }];
    } catch (error) {
      refuse(
        file,
        undefined,
        `The SDL of ${where} in version ${specification.version} does not parse: ${error instanceof Error ? error.message : String(error)}`,
        "Fix the schema in the document model editor, then run the migration again.",
      );
    }
  });
  const declaredNames = new Set(
    parsed.flatMap(({ document }) =>
      document.definitions.flatMap((definition) =>
        "name" in definition && definition.name !== undefined
          ? [definition.name.value]
          : [],
      ),
    ),
  );
  const isScalarName = (name: string) =>
    BUILT_IN_SCALARS.has(name) || scalarBuilders.has(name);
  const renamed = new Map<string, string>();
  for (const name of declaredNames) {
    if (!isScalarName(name)) continue;
    if (!rename.enabled) {
      refuse(
        file,
        undefined,
        `Version ${specification.version} declares a type named ${name}, which is also a ${BUILT_IN_SCALARS.has(name) ? "built-in GraphQL" : "Powerhouse catalog"} scalar. A code-first model cannot reuse a scalar's name, because every host declares that scalar.`,
        `Run ph migrate with --rename-conflicting-types to rename it to ${rename.prefix}${name}, or rename it yourself in the document model editor and regenerate. Either rename changes its GraphQL name.`,
      );
    }
    let next = `${rename.prefix}${name}`;
    for (
      let suffix = 2;
      declaredNames.has(next) || isScalarName(next);
      suffix++
    ) {
      next = `${rename.prefix}${name}${suffix}`;
    }
    renamed.set(name, next);
  }
  const renameNode = <T extends { readonly name: { readonly value: string } }>(
    node: T,
  ): T | undefined => {
    const next = renamed.get(node.name.value);
    return next === undefined
      ? undefined
      : { ...node, name: { ...node.name, value: next } };
  };
  const documents =
    renamed.size === 0
      ? parsed
      : parsed.map(({ where, document }) => ({
          where,
          document: visit(document, {
            NamedType: renameNode,
            ObjectTypeDefinition: renameNode,
            InputObjectTypeDefinition: renameNode,
            EnumTypeDefinition: renameNode,
            UnionTypeDefinition: renameNode,
            InterfaceTypeDefinition: renameNode,
          }),
        }));
  const types = new Map<string, DeclaredType>();
  for (const { where, document } of documents) {
    for (const definition of document.definitions) {
      switch (definition.kind) {
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        case Kind.ENUM_TYPE_DEFINITION:
        case Kind.UNION_TYPE_DEFINITION:
        case Kind.INTERFACE_TYPE_DEFINITION: {
          const name = definition.name.value;
          const first = types.get(name);
          // The same declaration twice, as an operation's schema repeating a
          // state type, is one type.
          if (first !== undefined && print(first.node) === print(definition)) {
            continue;
          }
          if (first !== undefined) {
            refuse(
              file,
              undefined,
              `Version ${specification.version} declares the type ${name} twice, in ${first.where} and in ${where}.`,
              `Keep one declaration of ${name}.`,
            );
          }
          types.set(name, { node: definition, where, file });
          break;
        }
        default:
          refuse(
            file,
            undefined,
            `${where} in version ${specification.version} has a ${definition.kind}, which a code-first document model cannot declare.`,
            "Remove it from the schema; declare only object, input, enum, union and interface types.",
          );
      }
    }
  }
  for (const { node, where } of types.values()) {
    const check = (directives: readonly { name: { value: string } }[] = []) => {
      const other = directives.find(({ name }) => name.value !== "deprecated");
      if (other !== undefined) {
        refuse(
          file,
          undefined,
          `${where} uses the directive @${other.name.value}, which a code-first document model cannot declare.`,
          `Remove @${other.name.value}.`,
        );
      }
    };
    check(node.directives);
    const members: readonly (FieldDefinitionNode | InputValueDefinitionNode)[] =
      node.kind === Kind.ENUM_TYPE_DEFINITION ||
      node.kind === Kind.UNION_TYPE_DEFINITION
        ? []
        : (node.fields ?? []);
    for (const member of members) {
      check(member.directives);
      if ("arguments" in member && (member.arguments?.length ?? 0) > 0) {
        refuse(
          file,
          undefined,
          `${node.name.value}.${member.name.value} in ${where} takes arguments, which a document model state field cannot.`,
          `Remove the arguments of ${node.name.value}.${member.name.value}.`,
        );
      }
      const used = namedTypeOf(member.type);
      if (
        !types.has(used) &&
        !BUILT_IN_SCALARS.has(used) &&
        !scalarBuilders.has(used)
      ) {
        refuse(
          file,
          undefined,
          `${node.name.value}.${member.name.value} in ${where} has the type ${used}, which version ${specification.version} does not declare and is not a Powerhouse scalar.`,
          `Declare ${used}, or use a scalar of the catalog.`,
        );
      }
    }
  }
  return { types, renamed };
}

/** The types each type's fields and members name. */
export function referencedTypes(
  node: TypeDefinition,
  types: ReadonlyMap<string, DeclaredType>,
): string[] {
  const names =
    node.kind === Kind.UNION_TYPE_DEFINITION
      ? (node.types ?? []).map((member) => member.name.value)
      : node.kind === Kind.ENUM_TYPE_DEFINITION
        ? []
        : [
            ...(node.fields ?? []).map((field) => namedTypeOf(field.type)),
            ...("interfaces" in node
              ? (node.interfaces ?? []).map((entry) => entry.name.value)
              : []),
          ];
  return names.filter((name) => types.has(name));
}

/**
 * The types a declaration names in a list it evaluates at once: a union's
 * members and the interfaces a type implements. Each must be declared first.
 */
export function eagerReferences(node: TypeDefinition): string[] {
  if (node.kind === Kind.UNION_TYPE_DEFINITION) {
    return (node.types ?? []).map((member) => member.name.value);
  }
  return "interfaces" in node
    ? (node.interfaces ?? []).map((entry) => entry.name.value)
    : [];
}

export function checkOperationNames(
  specFile: string,
  specification: StoredSpecification,
  types: ReadonlyMap<string, DeclaredType>,
) {
  const seen = new Map<string, string>();
  for (const module of specification.modules) {
    for (const operation of module.operations) {
      const key = camelCase(operation.name);
      const actionType = constantCase(operation.name);
      if (constantCase(key) !== actionType) {
        refuse(
          specFile,
          undefined,
          `The operation ${operation.name} of version ${specification.version} has the action type ${actionType}, which the code-first key ${key} does not derive.`,
          `Rename the operation so its name is in CONSTANT_CASE, such as ${constantCase(key)}.`,
        );
      }
      const first = seen.get(key);
      if (first !== undefined) {
        refuse(
          specFile,
          undefined,
          `Version ${specification.version} has two operations, ${first} and ${operation.name}, with the key ${key}.`,
          "Rename one of them.",
        );
      }
      seen.set(key, operation.name);
      const inputName = `${pascalCase(key)}Input`;
      const declared = types.get(inputName);
      if (
        declared === undefined ||
        declared.node.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION
      ) {
        refuse(
          specFile,
          undefined,
          `The operation ${operation.name} of version ${specification.version} declares no input ${inputName}.`,
          `Declare input ${inputName} in the operation's schema; an operation without fields declares it with one optional field.`,
        );
      }
    }
  }
}

export function readModel(input: Input, specFile: string): StoredModel {
  const text = input.files.get(specFile);
  if (text === undefined) {
    refuse(
      specFile,
      undefined,
      `${specFile} does not exist, so the model is not schema-first.`,
      "Name a directory that holds a stored <name>.json document model.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    refuse(
      specFile,
      undefined,
      `${specFile} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      "Restore the file from version control.",
    );
  }
  const parsed = storedModelSchema.safeParse(json);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const at = issue.path.length === 0 ? "" : ` at ${issue.path.join(".")}`;
    refuse(
      specFile,
      undefined,
      `${specFile} is not a stored document model: ${issue.message}${at}.`,
      "Restore the file from version control, or export the model again from Connect.",
    );
  }
  return parsed.data;
}

const text = z.string();
const optionalText = z.string().nullish();
const example = z.looseObject({ id: z.string(), value: z.string() });
const scope = z.looseObject({
  schema: text,
  initialValue: text,
  examples: z.array(example).optional(),
});

/** The shape of a stored `<name>.json`; unknown keys are kept. */
const storedModelSchema: z.ZodType<StoredModel> = z.looseObject({
  id: text,
  name: text,
  description: optionalText,
  extension: text,
  author: z
    .looseObject({ name: optionalText, website: optionalText })
    .optional(),
  specifications: z
    .array(
      z.looseObject({
        version: z.number().int().positive(),
        changeLog: z.array(text).optional(),
        state: z.looseObject({ global: scope, local: scope }),
        modules: z.array(
          z.looseObject({
            name: text,
            description: optionalText,
            operations: z.array(
              z.looseObject({
                name: text,
                description: optionalText,
                schema: optionalText,
                scope: optionalText,
                errors: z
                  .array(
                    z.looseObject({
                      name: text,
                      code: optionalText,
                      description: optionalText,
                      template: optionalText,
                    }),
                  )
                  .optional(),
                examples: z.array(example).optional(),
              }),
            ),
          }),
        ),
      }),
    )
    .min(1, "it has no specifications"),
});
