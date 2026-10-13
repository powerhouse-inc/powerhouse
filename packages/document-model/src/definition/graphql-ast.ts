import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionRelatedLocation,
  DirectiveUseDefinition,
  DocumentModelSpecificationDefinition,
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
import { createDiagnostic } from "./diagnostics.js";
import { equalsPatternProblem } from "./field-options.js";
import { canonicalJson, compareCodeUnits } from "./primitives.js";
import {
  namedTypeInventory,
  printSchemaSegment,
  printTypeReference,
} from "./printer.js";

/**
 * The GraphQL AST compatibility path for SDL outside the V1 descriptor
 * grammar. A declaration carries plain location-free AST data, so this module
 * — reached from every runtime import of a finalized model — imports no
 * `graphql` module. Parsing lives in `document-model/tooling`.
 *
 * When `graphQLCompatibility` is present its AST is the authoritative GraphQL
 * projection: every definition and extension passes through in the recorded
 * order. The compiler still checks that everything the descriptors represent
 * agrees with that AST.
 */

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

/** One named type as its definition and every extension of it compose it. */
export type EffectiveTypeDefinition = {
  readonly node: NamedAstDefinition;
  /**
   * The index in `document.definitions` of the defining node: the base
   * definition, or the first extension when the document has no base.
   */
  readonly index: number;
  /** The index of the node that contributed each member, by list and name. */
  readonly contributors: ReadonlyMap<`${MemberList}:${string}`, number>;
};

export type FoldedTypeDefinitions = {
  /** Base definitions in document order, then extension-only types. */
  readonly types: ReadonlyMap<string, EffectiveTypeDefinition>;
  /**
   * Later definitions of a name already defined. The first one wins; the
   * caller decides whether a repeat is an error.
   */
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

/**
 * Composes every named type from its definition and its extensions. An
 * extension may precede its base; extensions apply in document order; an
 * extension of an undefined type defines it. An extension of a different kind
 * and a member defined twice are reported as diagnostics.
 */
export function foldTypeExtensions(
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

export type GraphQLProjection =
  | {
      readonly kind: "graphql-ast-v1";
      readonly document: LocationFreeGraphQLDocumentNode;
    }
  | { readonly kind: "descriptor-sdl"; readonly segments: readonly string[] };

/**
 * The author-facing GraphQL projection of one specification, before the host's
 * namespacing and augmentation in `reactor-api`. A compatibility AST is
 * returned as is; otherwise the descriptor printer produces the named types
 * and the operation inputs that are not already named types.
 */
export function documentModelGraphQLProjection(
  specification: DocumentModelSpecificationDefinition,
): GraphQLProjection {
  if (specification.graphQLCompatibility !== null) {
    return {
      kind: "graphql-ast-v1",
      document: specification.graphQLCompatibility.document,
    };
  }
  const inventory = namedTypeInventory(specification.types);
  const declared = new Set(specification.types.map((type) => type.name));
  const inputs = specification.modules.flatMap((module) =>
    module.operations.flatMap((operation) =>
      operation.input === null || declared.has(operation.input.name)
        ? []
        : [printSchemaSegment([operation.input], inventory)],
    ),
  );
  return {
    kind: "descriptor-sdl",
    segments: [printSchemaSegment(specification.types), ...inputs].filter(
      (segment) => segment.length > 0,
    ),
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
  return createDiagnostic({
    code: "PH-DM-COMPATIBILITY-INVALID",
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

/**
 * Rejects anything the canonical encoder cannot encode, and any retained
 * `loc` property, before the AST reaches a definition digest.
 */
export function validateLocationFreeDocument(
  value: unknown,
  path: DefinitionPath,
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  const visit = (node: unknown, at: DefinitionPath): void => {
    if (node === null) return;
    switch (typeof node) {
      case "string":
      case "number":
      case "boolean":
        return;
      case "object": {
        if (Array.isArray(node)) {
          node.forEach((member, index) => visit(member, [...at, index]));
          return;
        }
        for (const [key, member] of Object.entries(node)) {
          if (key === "loc") {
            diagnostics.push(
              compatibilityDiagnostic(
                [...at, key],
                "A compatibility AST must be location free.",
                {
                  expected: "no loc property",
                  received: "loc",
                  repair:
                    "Strip every loc property, as schemaFirstGraphQLDocument does.",
                },
              ),
            );
            continue;
          }
          visit(member, [...at, key]);
        }
        return;
      }
      default:
        diagnostics.push(
          compatibilityDiagnostic(
            at,
            `A compatibility AST must contain JSON data only, received ${typeof node}.`,
            {
              expected: "JSON data",
              received: typeof node,
              repair:
                "Paste the plain AST data returned by schemaFirstGraphQLDocument.",
            },
          ),
        );
    }
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
    // An enum token and a string literal carry the same JSON value; the
    // field's type reference is compared separately.
    // falls through
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

export const DEFAULT_DEPRECATION_REASON = "No longer supported";

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
      return `Add "${member}" to the values of ph.enum("${typeName}").`;
    case "UnionTypeDefinition":
      return `Add ${member} to the members of ph.union("${typeName}").`;
    default:
      return `Add a "${member}" field to the descriptor of ${typeName}.`;
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
      // A descriptor cannot carry this pattern, so the repair a mismatch
      // would name could not be followed.
      diagnostics.push(
        createDiagnostic({
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
                ? `Remove equals from the descriptor of ${descriptor.name}.${field.name}, or add ${printEquals(field.equals)} to the field in the AST.`
                : `Pass equals: ${JSON.stringify(match.equals)} in the options of ${descriptor.name}.${field.name}.`,
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

/**
 * An untyped author can pass anything here, so the discriminator and the
 * order flag are checked at runtime rather than trusted from the type.
 */
function isGraphQLAstV1(
  value: unknown,
): value is SchemaFirstGraphQLDocumentCompatibility {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<SchemaFirstGraphQLDocumentCompatibility>;
  return (
    candidate.kind === "graphql-ast-v1" &&
    candidate.preserveDefinitionOrder === true
  );
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

// A descriptor cannot express a root operation type and the host owns those names, so the AST may declare them without a descriptor.
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
  const { compatibility, definitions, path } = options;
  if (!isGraphQLAstV1(compatibility)) {
    return [
      compatibilityDiagnostic(
        path,
        "A GraphQL compatibility declaration must be a V1 location-free document with preserveDefinitionOrder.",
        {
          expected: 'kind "graphql-ast-v1" with preserveDefinitionOrder: true',
          received: String((compatibility as { readonly kind?: unknown }).kind),
          repair:
            "Use the value returned by schemaFirstGraphQLDocument from document-model/tooling.",
        },
      ),
    ];
  }
  const document: unknown = compatibility.document;
  if (
    document === null ||
    typeof document !== "object" ||
    (document as { kind?: unknown }).kind !== "Document" ||
    !Array.isArray((document as { definitions?: unknown }).definitions)
  ) {
    return [
      compatibilityDiagnostic(
        [...path, "document"],
        "A GraphQL compatibility document must be a location-free Document node.",
        {
          expected: 'a { kind: "Document", definitions: [...] } node',
          received: typeof document,
        },
      ),
    ];
  }
  const shape = validateLocationFreeDocument(document, [...path, "document"]);
  if (shape.length > 0) return shape;

  const documentPath = [...path, "document"];
  const folded = foldTypeExtensions(
    compatibility.document.definitions,
    documentPath,
  );
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

  const rootTypes = rootOperationTypeNames(compatibility.document);
  for (const [name, { node }] of folded.types) {
    if (compared.has(name) || rootTypes.has(name)) continue;
    diagnostics.push(
      compatibilityDiagnostic(
        [...path, "document", name],
        `The compatibility AST declares ${name}, which no descriptor represents.`,
        {
          expected: "a descriptor for every named type in the AST",
          received: node.kind,
          repair: `Declare ${name} with a ph builder and reach it from a state root, an operation input, or specifications.auxiliaryTypes, or remove it from the AST.`,
        },
      ),
    );
  }
  return diagnostics;
}
