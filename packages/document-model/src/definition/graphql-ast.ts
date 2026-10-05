import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DocumentModelSpecificationDefinition,
  GraphQLConstValueNode,
  GraphQLDirectiveNode,
  GraphQLEnumValueDefinitionNode,
  GraphQLFieldDefinitionNode,
  GraphQLInputValueDefinitionNode,
  GraphQLStringValueNode,
  GraphQLTypeNode,
  JsonValue,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  SchemaFirstGraphQLDocumentCompatibility,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "./diagnostics.js";
import { canonicalJson } from "./primitives.js";
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

type NamedAstDefinition = {
  readonly kind: string;
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
  } = {},
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-DM-COMPATIBILITY-INVALID",
    path,
    message,
    ...(detail.expected !== undefined && { expected: detail.expected }),
    ...(detail.received !== undefined && { received: detail.received }),
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

type FieldFingerprint = {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string | null;
  readonly description: string | null;
  readonly deprecated: string | null;
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
      ? definition.values.map(
          (value): FieldFingerprint => ({
            name: value.name,
            type: "",
            defaultValue: null,
            description: value.description,
            deprecated: value.deprecated,
          }),
        )
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
      ? (node.values ?? []).map(
          (value): FieldFingerprint => ({
            name: value.name.value,
            type: "",
            defaultValue: null,
            description: value.description?.value ?? null,
            deprecated: astDeprecation(value.directives),
          }),
        )
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

function compareFields(
  descriptor: TypeFingerprint,
  ast: TypeFingerprint,
  path: DefinitionPath,
  memberNoun: "field" | "enum value",
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  const astFields = new Map(ast.fields.map((field) => [field.name, field]));
  for (const field of descriptor.fields) {
    const coordinate = [...path, field.name];
    const match = astFields.get(field.name);
    if (match === undefined) {
      diagnostics.push(
        compatibilityDiagnostic(
          coordinate,
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
  }
  for (const extra of astFields.keys()) {
    // The AST is the complete projection, so an extra member on a
    // descriptor-represented type is a divergence rather than a lossless
    // addition.
    diagnostics.push(
      compatibilityDiagnostic(
        [...path, extra],
        `${descriptor.name}.${extra} is in the compatibility AST and not in the descriptors.`,
        { expected: "absent", received: `${memberNoun} ${extra}` },
      ),
    );
  }
  return diagnostics;
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

  const diagnostics: DefinitionDiagnostic[] = [];
  const astNodes = new Map<string, NamedAstDefinition>();
  const namedKinds = new Set<string>(Object.values(AST_KINDS));
  for (const node of compatibility.document.definitions) {
    if (!namedKinds.has(node.kind)) continue;
    const named = node as unknown as NamedAstDefinition;
    if (astNodes.has(named.name.value)) {
      diagnostics.push(
        compatibilityDiagnostic(
          [...path, "document", named.name.value],
          `The compatibility AST defines ${named.name.value} twice.`,
          { expected: "one definition per type name", received: "two" },
        ),
      );
      continue;
    }
    astNodes.set(named.name.value, named);
  }

  const compared = new Set<string>();
  for (const definition of definitions) {
    if (compared.has(definition.name)) continue;
    compared.add(definition.name);
    const coordinate = [...path, "document", definition.name];
    const node = astNodes.get(definition.name);
    if (node === undefined) {
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
    const ast = astFingerprint(node);
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
    if (
      canonicalJson([...descriptor.implemented]) !==
      canonicalJson([...ast.implemented])
    ) {
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
    if (
      canonicalJson([...descriptor.members]) !== canonicalJson([...ast.members])
    ) {
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
      ),
    );
  }

  // A named type is descriptor-representable, so an AST that declares one the
  // descriptors do not would make the structured definition and the GraphQL
  // projection disagree about which types the model has. Extra nodes are legal
  // only where V1 has no lossless representation: a schema definition, a
  // directive definition, a directive use, a type extension, and the root
  // operation types a schema definition names — a descriptor cannot express a
  // root, and the host owns those coordinates.
  const rootTypes = new Set<string>(["Query", "Mutation", "Subscription"]);
  for (const node of compatibility.document.definitions) {
    if (node.kind !== "SchemaDefinition" && node.kind !== "SchemaExtension") {
      continue;
    }
    for (const operationType of node.operationTypes) {
      rootTypes.add(operationType.type.name.value);
    }
  }
  for (const [name, node] of astNodes) {
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
