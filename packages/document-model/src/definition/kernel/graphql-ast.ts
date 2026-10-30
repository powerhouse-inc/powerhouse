import { kernelDiagnostics } from "./diagnostic-codes.js";
import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionRelatedLocation,
  DirectiveUseDefinition,
  GraphQLConstValueNode,
  GraphQLDirectiveNode,
  GraphQLEnumValueDefinitionNode,
  GraphQLFieldDefinitionNode,
  GraphQLInputValueDefinitionNode,
  GraphQLStringValueNode,
  GraphQLTypeNode,
  GraphQLTypeSystemDefinitionNode,
  GraphQLTypeSystemExtensionNode,
  JsonValue,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  SchemaFirstGraphQLDocumentCompatibility,
} from "@powerhousedao/shared/document-model";
import { rejectionReceived, snapshotRecord } from "./data-properties.js";
import { describeReceived } from "./diagnostics.js";
import { equalsPatternProblem } from "./equals-pattern.js";
import {
  canonicalJson,
  compareCodeUnits,
  EMPTY_INPUT_FIELD_NAME,
} from "./primitives.js";
import { printTypeReference } from "./printer.js";

const AST_KINDS = {
  object: "ObjectTypeDefinition",
  interface: "InterfaceTypeDefinition",
  enum: "EnumTypeDefinition",
  union: "UnionTypeDefinition",
  input: "InputObjectTypeDefinition",
} as const satisfies Record<NamedGraphQLTypeDefinition["kind"], string>;

type NamedDefinitionKind = (typeof AST_KINDS)[keyof typeof AST_KINDS];

type NamedDefinitionNode = Extract<
  GraphQLTypeSystemDefinitionNode,
  { readonly kind: NamedDefinitionKind }
>;

type NamedAstDefinition = {
  readonly kind: NamedDefinitionKind;
  readonly name: { readonly value: string };
  readonly description?: GraphQLStringValueNode;
  readonly directives?: readonly GraphQLDirectiveNode[];
  readonly interfaces?: readonly {
    readonly name: { readonly value: string };
  }[];
  readonly fields?: readonly (
    | GraphQLFieldDefinitionNode
    | GraphQLInputValueDefinitionNode
  )[];
  readonly values?: readonly GraphQLEnumValueDefinitionNode[];
  readonly types?: readonly { readonly name: { readonly value: string } }[];
};

const EXTENSION_TARGETS = {
  ObjectTypeExtension: "ObjectTypeDefinition",
  InterfaceTypeExtension: "InterfaceTypeDefinition",
  EnumTypeExtension: "EnumTypeDefinition",
  UnionTypeExtension: "UnionTypeDefinition",
  InputObjectTypeExtension: "InputObjectTypeDefinition",
} as const satisfies Record<string, NamedDefinitionKind>;

type NamedExtensionNode = Extract<
  GraphQLTypeSystemExtensionNode,
  { readonly kind: keyof typeof EXTENSION_TARGETS }
>;

const KIND_SPELLING: Record<
  NamedDefinitionKind | "ScalarTypeDefinition",
  { readonly noun: string; readonly keyword: string }
> = {
  ScalarTypeDefinition: { noun: "a scalar", keyword: "scalar" },
  ObjectTypeDefinition: { noun: "an object type", keyword: "type" },
  InterfaceTypeDefinition: { noun: "an interface", keyword: "interface" },
  EnumTypeDefinition: { noun: "an enum", keyword: "enum" },
  UnionTypeDefinition: { noun: "a union", keyword: "union" },
  InputObjectTypeDefinition: { noun: "an input", keyword: "input" },
};

const MEMBER_LISTS = ["fields", "values", "interfaces", "types"] as const;

type MemberList = (typeof MEMBER_LISTS)[number];

type Member = { readonly name: { readonly value: string } };

type EffectiveTypeDefinition = {
  readonly node: NamedAstDefinition;
  readonly index: number;
  readonly contributors: ReadonlyMap<`${MemberList}:${string}`, number>;
};

type FoldedTypeDefinitions = {
  readonly types: ReadonlyMap<string, EffectiveTypeDefinition>;
  readonly redefinitions: readonly {
    readonly name: string;
    readonly index: number;
  }[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

type TypeUnderFold = {
  readonly base: Omit<NamedAstDefinition, "kind">;
  readonly kind: NamedDefinitionKind;
  readonly index: number;
  readonly contributors: Map<`${MemberList}:${string}`, number>;
  readonly lists: Partial<Record<MemberList, Member[]>>;
  readonly directives: GraphQLDirectiveNode[];
};

function isNamedDefinition(node: {
  readonly kind: string;
}): node is NamedDefinitionNode {
  return Object.values(AST_KINDS).includes(node.kind as NamedDefinitionKind);
}

function isNamedExtension(node: {
  readonly kind: string;
}): node is NamedExtensionNode {
  return Object.hasOwn(EXTENSION_TARGETS, node.kind);
}

function foldTypeExtensions(
  definitions: LocationFreeGraphQLDocumentNode["definitions"],
  path: DefinitionPath,
): FoldedTypeDefinitions {
  const types = new Map<string, TypeUnderFold>();
  const redefinitions: { name: string; index: number }[] = [];
  const diagnostics: DefinitionDiagnostic[] = [];
  const memberPath = (index: number, list: MemberList, name: string) => [
    ...path,
    "definitions",
    index,
    list,
    name,
  ];
  const addMembers = (
    target: TypeUnderFold,
    node: Partial<Record<MemberList, readonly Member[]>>,
    index: number,
  ): void => {
    for (const list of MEMBER_LISTS) {
      const members = node[list];
      if (members === undefined) continue;
      for (const member of members) {
        const name = member.name.value;
        const key = `${list}:${name}` as const;
        const first = target.contributors.get(key);
        if (first !== undefined) {
          const coordinate = `${target.base.name.value}.${name}`;
          diagnostics.push(
            compatibilityDiagnostic(
              memberPath(index, list, name),
              `${coordinate} is defined more than once.`,
              {
                expected: "one definition per member",
                received: "a second definition",
                repair: `Remove the repeated ${name}; the host rejects a member defined twice.`,
                related: [
                  {
                    path: memberPath(first, list, name),
                    message: `${coordinate} is first defined here.`,
                  },
                ],
              },
            ),
          );
          continue;
        }
        target.contributors.set(key, index);
        target.lists[list]?.push(member);
      }
    }
  };
  const start = (
    node: Omit<NamedAstDefinition, "kind">,
    kind: NamedDefinitionKind,
    index: number,
  ): TypeUnderFold => {
    const folding: TypeUnderFold = {
      base: node,
      kind,
      index,
      contributors: new Map(),
      lists: Object.fromEntries(
        MEMBER_LISTS.filter((list) => node[list] !== undefined).map((list) => [
          list,
          [],
        ]),
      ),
      directives: [...(node.directives ?? [])],
    };
    addMembers(folding, node, index);
    return folding;
  };

  const scalars = new Set<string>();
  const wrongKind = (
    index: number,
    name: string,
    defined: keyof typeof KIND_SPELLING,
    extension: { readonly kind: string },
    extendedAs: keyof typeof KIND_SPELLING,
  ): void => {
    diagnostics.push(
      compatibilityDiagnostic(
        [...path, "definitions", index],
        `${name} is ${KIND_SPELLING[defined].noun}, so it cannot be extended as ${KIND_SPELLING[extendedAs].noun}.`,
        {
          expected: defined.replace("Definition", "Extension"),
          received: extension.kind,
          repair: `Extend ${name} with "extend ${KIND_SPELLING[defined].keyword}", or remove the extension; the host rejects an extension of a different kind.`,
        },
      ),
    );
  };
  const foldScalarExtensions = (
    foldedTypes: ReadonlyMap<string, TypeUnderFold>,
  ): void => {
    definitions.forEach((node, index) => {
      if (node.kind !== "ScalarTypeExtension") return;
      const target = foldedTypes.get(node.name.value);
      if (target !== undefined) {
        wrongKind(
          index,
          node.name.value,
          target.kind,
          node,
          "ScalarTypeDefinition",
        );
      }
    });
  };

  definitions.forEach((node, index) => {
    if (node.kind === "ScalarTypeDefinition") {
      scalars.add(
        (node as GraphQLTypeSystemDefinitionNode & Member).name.value,
      );
      return;
    }
    if (!isNamedDefinition(node)) return;
    const name = node.name.value;
    if (types.has(name)) {
      redefinitions.push({ name, index });
      return;
    }
    types.set(name, start(node, node.kind, index));
  });

  definitions.forEach((node, index) => {
    if (!isNamedExtension(node)) return;
    const kind = EXTENSION_TARGETS[node.kind];
    const name = node.name.value;
    const target = types.get(name);
    if (target === undefined) {
      if (scalars.has(name)) {
        wrongKind(index, name, "ScalarTypeDefinition", node, kind);
        return;
      }
      types.set(name, start(node, kind, index));
      return;
    }
    if (target.kind !== kind) {
      wrongKind(index, name, target.kind, node, kind);
      return;
    }
    target.directives.push(...node.directives);
    addMembers(target, node, index);
  });

  foldScalarExtensions(types);

  return {
    types: new Map(
      [...types].map(
        ([name, { base, kind, index, contributors, lists, directives }]) => [
          name,
          {
            node: { ...base, kind, directives, ...lists } as NamedAstDefinition,
            index,
            contributors,
          },
        ],
      ),
    ),
    redefinitions,
    diagnostics,
  };
}

function compatibilityDiagnostic(
  path: DefinitionPath,
  message: string,
  detail: {
    readonly expected?: string;
    readonly received?: string;
    readonly repair?: string;
    readonly related?: readonly DefinitionRelatedLocation[];
  } = {},
): DefinitionDiagnostic {
  return kernelDiagnostics.create({
    code: "PH-DEF-COMPATIBILITY-INVALID",
    path,
    message,
    ...(detail.expected !== undefined && { expected: detail.expected }),
    ...(detail.received !== undefined && { received: detail.received }),
    ...(detail.related !== undefined && { related: detail.related }),
    repair:
      detail.repair ??
      "Regenerate the compatibility AST from the schema this declaration replaces, or change the descriptors to agree with it.",
  });
}

const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

export function validateLocationFreeDocument(
  value: unknown,
  path: DefinitionPath,
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  const refuse = (at: DefinitionPath, message: string, received: string) =>
    diagnostics.push(
      compatibilityDiagnostic(at, message, {
        expected: "JSON data",
        received,
        repair:
          "Keep only JSON data in the AST: strings, finite numbers, booleans, null, plain arrays and plain objects with data properties.",
      }),
    );
  const ancestors = new Set<object>();
  const visitProperty = (
    owner: object,
    key: string | number,
    at: DefinitionPath,
  ): void => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor === undefined) {
      refuse(at, "A compatibility AST array must not have holes.", "hole");
    } else if (!("value" in descriptor)) {
      refuse(
        at,
        "A compatibility AST must hold data properties, not accessors.",
        "accessor",
      );
    } else {
      visit(descriptor.value, at);
    }
  };
  const visit = (node: unknown, at: DefinitionPath): void => {
    if (
      node === null ||
      typeof node === "string" ||
      typeof node === "boolean"
    ) {
      return;
    }
    if (typeof node === "number") {
      if (!Number.isFinite(node)) {
        refuse(at, "A compatibility AST number must be finite.", String(node));
      }
      return;
    }
    if (typeof node !== "object") {
      refuse(
        at,
        `A compatibility AST must contain JSON data only, received ${typeof node}.`,
        typeof node,
      );
      return;
    }
    if (ancestors.has(node)) {
      refuse(at, "A compatibility AST must not contain a cycle.", "cycle");
      return;
    }
    const prototype: unknown = Object.getPrototypeOf(node);
    const isArray = Array.isArray(node);
    if (
      isArray
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    ) {
      refuse(
        at,
        "A compatibility AST must hold plain arrays and plain objects only.",
        describeReceived(node),
      );
      return;
    }
    ancestors.add(node);
    for (const key of Reflect.ownKeys(node)) {
      if (typeof key === "symbol") {
        refuse(at, "A compatibility AST must not have symbol keys.", "symbol");
      } else if (isArray) {
        if (key !== "length" && !ARRAY_INDEX.test(key)) {
          refuse(
            [...at, key],
            "A compatibility AST array must hold only its items.",
            key,
          );
        }
      } else if (key === "loc") {
        diagnostics.push(
          compatibilityDiagnostic(
            [...at, key],
            "A compatibility AST must be location free.",
            {
              expected: "no loc property",
              received: "loc",
              repair: "Strip every loc property from the AST.",
            },
          ),
        );
      } else {
        visitProperty(node, key, [...at, key]);
      }
    }
    if (isArray) {
      for (let index = 0; index < node.length; index += 1) {
        visitProperty(node, index, [...at, index]);
      }
    }
    ancestors.delete(node);
  };
  visit(value, path);
  return diagnostics;
}

function printAstType(node: GraphQLTypeNode): string {
  switch (node.kind) {
    case "NamedType":
      return node.name.value;
    case "ListType":
      return `[${printAstType(node.type)}]`;
    case "NonNullType":
      return `${printAstType(node.type)}!`;
  }
}

function astValue(node: GraphQLConstValueNode): JsonValue {
  switch (node.kind) {
    case "IntValue":
    case "FloatValue":
      return Number(node.value);
    case "StringValue":
    case "EnumValue":
      return node.value;
    case "BooleanValue":
      return node.value;
    case "NullValue":
      return null;
    case "ListValue":
      return node.values.map(astValue);
    case "ObjectValue":
      return Object.fromEntries(
        node.fields.map((field) => [field.name.value, astValue(field.value)]),
      );
  }
}

const DEFAULT_DEPRECATION_REASON = "No longer supported";

function astDeprecation(
  directives: readonly GraphQLDirectiveNode[] | undefined,
): string | null {
  const directive = (directives ?? []).find(
    (candidate) => candidate.name.value === "deprecated",
  );
  if (directive === undefined) return null;
  const reason = directive.arguments.find(
    (argument) => argument.name.value === "reason",
  );
  if (reason === undefined) return DEFAULT_DEPRECATION_REASON;
  return reason.value.kind === "StringValue" ? reason.value.value : null;
}

function astEquals(
  directives: readonly GraphQLDirectiveNode[] | undefined,
): string | null {
  const value = (directives ?? [])
    .find((directive) => directive.name.value === "equals")
    ?.arguments.find((argument) => argument.name.value === "value")?.value;
  return value !== undefined &&
    "value" in value &&
    typeof value.value === "string"
    ? value.value
    : null;
}

function definitionEquals(field: {
  readonly directives?: readonly DirectiveUseDefinition[];
}): string | null {
  const value = field.directives
    ?.find((directive) => directive.name === "equals")
    ?.arguments.find((argument) => argument.name === "value")?.value;
  return typeof value === "string" ? value : null;
}

function printEquals(equals: string | null): string {
  return equals === null
    ? "no @equals"
    : `@equals(value: ${JSON.stringify(equals)})`;
}

type FieldFingerprint = {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string | null;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly equals: string | null;
};

type TypeFingerprint = {
  readonly kind: string;
  readonly name: string;
  readonly description: string | null;
  readonly implemented: readonly string[];
  readonly fields: readonly FieldFingerprint[];
  readonly members: readonly string[];
};

function descriptorFingerprint(
  definition: NamedGraphQLTypeDefinition,
): TypeFingerprint {
  const fields =
    definition.kind === "enum"
      ? definition.values.map((value): FieldFingerprint => ({
          name: value.name,
          type: "",
          defaultValue: null,
          description: value.description,
          deprecated: value.deprecated,
          equals: null,
        }))
      : definition.kind === "union"
        ? []
        : definition.kind === "input" && definition.fields.length === 0
          ? [
              {
                name: EMPTY_INPUT_FIELD_NAME,
                type: "Boolean",
                defaultValue: null,
                description: null,
                deprecated: null,
                equals: null,
              },
            ]
          : definition.fields.map((field): FieldFingerprint => {
              const hasDefault = Object.hasOwn(field, "defaultValue");
              return {
                name: field.name,
                type: printTypeReference(field.type),
                defaultValue: hasDefault
                  ? canonicalJson(
                      (field as { readonly defaultValue: JsonValue })
                        .defaultValue,
                    )
                  : null,
                description: field.description,
                deprecated: field.deprecated,
                equals: definitionEquals(field),
              };
            });
  return {
    kind: AST_KINDS[definition.kind],
    name: definition.name,
    description: definition.description,
    implemented:
      definition.kind === "object" || definition.kind === "interface"
        ? (definition.implements ?? [])
        : [],
    fields,
    members: definition.kind === "union" ? definition.members : [],
  };
}

function astFingerprint(node: NamedAstDefinition): TypeFingerprint {
  const fields =
    node.kind === AST_KINDS.enum
      ? (node.values ?? []).map((value): FieldFingerprint => ({
          name: value.name.value,
          type: "",
          defaultValue: null,
          description: value.description?.value ?? null,
          deprecated: astDeprecation(value.directives),
          equals: null,
        }))
      : (node.fields ?? []).map((field): FieldFingerprint => {
          const defaultValue = (field as GraphQLInputValueDefinitionNode)
            .defaultValue;
          return {
            name: field.name.value,
            type: printAstType(field.type),
            defaultValue:
              defaultValue === undefined
                ? null
                : canonicalJson(astValue(defaultValue)),
            description: field.description?.value ?? null,
            deprecated: astDeprecation(field.directives),
            equals: astEquals(field.directives),
          };
        });
  return {
    kind: node.kind,
    name: node.name.value,
    description: node.description?.value ?? null,
    implemented: (node.interfaces ?? []).map(
      (implemented) => implemented.name.value,
    ),
    fields,
    members: (node.types ?? []).map((member) => member.name.value),
  };
}

type ExtensionSource = {
  readonly documentPath: DefinitionPath;
  readonly effective: EffectiveTypeDefinition;
};

function missingMemberRepair(
  kind: NamedDefinitionKind,
  typeName: string,
  member: string,
): string {
  switch (kind) {
    case "EnumTypeDefinition":
      return `Add the value "${member}" to the definition of enum ${typeName}.`;
    case "UnionTypeDefinition":
      return `Add the member ${member} to the definition of union ${typeName}.`;
    default:
      return `Add a "${member}" field to the definition of ${typeName}.`;
  }
}

function compareFields(
  descriptor: TypeFingerprint,
  ast: TypeFingerprint,
  path: DefinitionPath,
  memberNoun: "field" | "enum value",
  source: ExtensionSource,
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  const astFields = new Map(ast.fields.map((field) => [field.name, field]));
  const list: MemberList = memberNoun === "enum value" ? "values" : "fields";
  for (const field of descriptor.fields) {
    const match = astFields.get(field.name);
    if (match === undefined) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...path, field.name],
          `${descriptor.name}.${field.name} is declared by the descriptors and absent from the compatibility AST.`,
          {
            expected: `${memberNoun} ${field.name}`,
            received: "absent",
          },
        ),
      );
      continue;
    }
    astFields.delete(field.name);
    const contributor = source.effective.contributors.get(
      `${list}:${field.name}`,
    );
    const coordinate =
      contributor === undefined || contributor === source.effective.index
        ? [...path, field.name]
        : [
            ...source.documentPath,
            "definitions",
            contributor,
            list,
            field.name,
          ];
    if (field.type !== match.type) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "type"],
          `${descriptor.name}.${field.name} has a different type in the compatibility AST.`,
          { expected: field.type, received: match.type },
        ),
      );
    }
    if (field.defaultValue !== match.defaultValue) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "defaultValue"],
          `${descriptor.name}.${field.name} has a different default value in the compatibility AST.`,
          {
            expected: field.defaultValue ?? "no default",
            received: match.defaultValue ?? "no default",
            repair: `Remove the default from the compatibility AST, or declare a defaultValue the field's type accepts on the descriptor field ${descriptor.name}.${field.name}.`,
          },
        ),
      );
    }
    if (field.description !== match.description) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "description"],
          `${descriptor.name}.${field.name} has a different description in the compatibility AST.`,
          {
            expected: field.description ?? "no description",
            received: match.description ?? "no description",
          },
        ),
      );
    }
    if (field.deprecated !== match.deprecated) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "deprecated"],
          `${descriptor.name}.${field.name} has a different deprecation in the compatibility AST.`,
          {
            expected: field.deprecated ?? "not deprecated",
            received: match.deprecated ?? "not deprecated",
          },
        ),
      );
    }
    const astProblem =
      match.equals === null ? undefined : equalsPatternProblem(match.equals);
    if (match.equals !== null && astProblem !== undefined) {
      diagnostics.push(
        kernelDiagnostics.create({
          code: "PH-DEF-OPTION-INVALID",
          path: [...coordinate, "equals"],
          received: match.equals,
          ...astProblem,
        }),
      );
    } else if (field.equals !== match.equals) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "equals"],
          `${descriptor.name}.${field.name} has a different @equals in the compatibility AST.`,
          {
            expected: printEquals(field.equals),
            received: printEquals(match.equals),
            repair:
              match.equals === null
                ? `Remove @equals from the definition of ${descriptor.name}.${field.name}, or add ${printEquals(field.equals)} to the field in the AST.`
                : `Give the definition of ${descriptor.name}.${field.name} ${printEquals(match.equals)}.`,
          },
        ),
      );
    }
  }
  for (const extra of astFields.keys()) {
    const received = `${memberNoun} ${extra}`;
    diagnostics.push(
      extensionMemberDiagnostic(
        descriptor.name,
        list,
        extra,
        received,
        source,
      ) ??
        compatibilityDiagnostic(
          [...path, extra],
          `${descriptor.name}.${extra} is in the compatibility AST and not in the descriptors.`,
          { expected: "absent", received },
        ),
    );
  }
  return diagnostics;
}

function extensionMemberDiagnostic(
  typeName: string,
  list: MemberList,
  member: string,
  received: string,
  { documentPath, effective }: ExtensionSource,
): DefinitionDiagnostic | undefined {
  const index = effective.contributors.get(`${list}:${member}`);
  if (index === undefined || index === effective.index) return undefined;
  const keyword = KIND_SPELLING[effective.node.kind].keyword;
  return compatibilityDiagnostic(
    [...documentPath, "definitions", index, list, member],
    `${typeName}.${member} is added by "extend ${keyword} ${typeName}" and missing from the descriptors.`,
    {
      expected: "absent",
      received,
      repair: missingMemberRepair(effective.node.kind, typeName, member),
    },
  );
}

function refusedV1Member(record: {
  readonly [key: string]: unknown;
}): { readonly member: string; readonly received: string } | undefined {
  if (record.kind !== "graphql-ast-v1") {
    return { member: "kind", received: spelledMember(record.kind) };
  }
  if (record.preserveDefinitionOrder !== true) {
    return {
      member: "preserveDefinitionOrder",
      received: spelledMember(record.preserveDefinitionOrder),
    };
  }
  return undefined;
}

function spelledMember(value: unknown): string {
  return typeof value === "string" || typeof value === "boolean"
    ? String(value)
    : describeReceived(value);
}

function sameMembers(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    canonicalJson([...left].sort(compareCodeUnits)) ===
    canonicalJson([...right].sort(compareCodeUnits))
  );
}

function dataProperty(owner: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function rootOperationTypeNames(
  document: LocationFreeGraphQLDocumentNode,
): ReadonlySet<string> {
  const names = new Set<string>(["Query", "Mutation", "Subscription"]);
  for (const node of document.definitions) {
    if (node.kind !== "SchemaDefinition" && node.kind !== "SchemaExtension") {
      continue;
    }
    for (const operationType of node.operationTypes) {
      names.add(operationType.type.name.value);
    }
  }
  return names;
}

export function checkGraphQLDocumentAgreement(options: {
  readonly compatibility: SchemaFirstGraphQLDocumentCompatibility;
  readonly definitions: readonly NamedGraphQLTypeDefinition[];
  readonly path: DefinitionPath;
}): readonly DefinitionDiagnostic[] {
  const { definitions, path } = options;
  const compatibility = snapshotRecord(options.compatibility, undefined, path);
  const refuse = (at: DefinitionPath, received: string) => [
    compatibilityDiagnostic(
      at,
      "A GraphQL compatibility declaration must be a V1 location-free document with preserveDefinitionOrder.",
      {
        expected: 'kind "graphql-ast-v1" with preserveDefinitionOrder: true',
        received,
        repair:
          'Pass a location-free GraphQL document as { kind: "graphql-ast-v1", document, preserveDefinitionOrder: true }.',
      },
    ),
  ];
  if (!compatibility.ok) {
    return refuse(compatibility.path, rejectionReceived(compatibility));
  }
  const refused = refusedV1Member(compatibility.value);
  if (refused !== undefined) {
    return refuse([...path, refused.member], refused.received);
  }
  const document: unknown = compatibility.value.document;
  if (
    document === null ||
    typeof document !== "object" ||
    dataProperty(document, "kind") !== "Document" ||
    !Array.isArray(dataProperty(document, "definitions"))
  ) {
    return [
      compatibilityDiagnostic(
        [...path, "document"],
        "A GraphQL compatibility document must be a location-free Document node.",
        {
          expected: 'a { kind: "Document", definitions: [...] } node',
          received: describeReceived(document),
        },
      ),
    ];
  }
  const shape = validateLocationFreeDocument(document, [...path, "document"]);
  if (shape.length > 0) return shape;
  const validated = document as LocationFreeGraphQLDocumentNode;

  const documentPath = [...path, "document"];
  const folded = foldTypeExtensions(validated.definitions, documentPath);
  const diagnostics: DefinitionDiagnostic[] = [
    ...folded.redefinitions.map(({ name }) =>
      compatibilityDiagnostic(
        [...documentPath, name],
        `The compatibility AST defines ${name} twice.`,
        { expected: "one definition per type name", received: "two" },
      ),
    ),
    ...folded.diagnostics,
  ];

  const compared = new Set<string>();
  for (const definition of definitions) {
    if (compared.has(definition.name)) continue;
    compared.add(definition.name);
    const coordinate = [...path, "document", definition.name];
    const effective = folded.types.get(definition.name);
    if (effective === undefined) {
      diagnostics.push(
        compatibilityDiagnostic(
          coordinate,
          `${definition.name} is declared by the descriptors and absent from the compatibility AST.`,
          { expected: definition.name, received: "absent" },
        ),
      );
      continue;
    }
    const descriptor = descriptorFingerprint(definition);
    const ast = astFingerprint(effective.node);
    if (descriptor.kind !== ast.kind) {
      diagnostics.push(
        compatibilityDiagnostic(
          coordinate,
          `${definition.name} is a different kind of type in the compatibility AST.`,
          { expected: descriptor.kind, received: ast.kind },
        ),
      );
      continue;
    }
    if (descriptor.description !== ast.description) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "description"],
          `${definition.name} has a different description in the compatibility AST.`,
          {
            expected: descriptor.description ?? "no description",
            received: ast.description ?? "no description",
          },
        ),
      );
    }
    if (!sameMembers(descriptor.implemented, ast.implemented)) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "implements"],
          `${definition.name} implements different interfaces in the compatibility AST.`,
          {
            expected: descriptor.implemented.join(" & ") || "none",
            received: ast.implemented.join(" & ") || "none",
          },
        ),
      );
    }
    if (!sameMembers(descriptor.members, ast.members)) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...coordinate, "members"],
          `${definition.name} has different union members in the compatibility AST.`,
          {
            expected: descriptor.members.join(" | ") || "none",
            received: ast.members.join(" | ") || "none",
          },
        ),
      );
    }
    diagnostics.push(
      ...compareFields(
        descriptor,
        ast,
        [...coordinate, definition.kind === "enum" ? "values" : "fields"],
        definition.kind === "enum" ? "enum value" : "field",
        { documentPath, effective },
      ),
    );
  }

  const rootTypes = rootOperationTypeNames(validated);
  for (const [name, { node }] of folded.types) {
    if (compared.has(name) || rootTypes.has(name)) continue;
    diagnostics.push(
      compatibilityDiagnostic(
        [...path, "document", name],
        `The compatibility AST declares ${name}, which no descriptor represents.`,
        {
          expected: "a descriptor for every named type in the AST",
          received: node.kind,
          repair: `Add a definition for ${name}, or remove it from the AST.`,
        },
      ),
    );
  }
  return diagnostics;
}
