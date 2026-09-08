import type {
  DirectiveUseDefinitionV1,
  DocumentModelDefinitionV1,
  DocumentModelModule,
  DocumentModelSpecificationDefinitionV1,
  DocumentSpecification,
  GraphQLConstValueNodeV1,
  GraphQLDirectiveNodeV1,
  GraphQLEnumTypeDefinitionNodeV1,
  GraphQLFieldDefinitionNodeV1,
  GraphQLInputObjectTypeDefinitionNodeV1,
  GraphQLInputValueDefinitionNodeV1,
  GraphQLInterfaceTypeDefinitionNodeV1,
  GraphQLObjectTypeDefinitionNodeV1,
  GraphQLTypeNodeV1,
  GraphQLTypeSystemDefinitionNodeV1,
  FieldDefinitionV1,
  InputFieldDefinitionV1,
  InputTypeDefinitionV1,
  JsonValue,
  LocationFreeGraphQLDocumentNodeV1,
  NamedGraphQLTypeDefinitionV1,
  PHBaseState,
  ScalarNameV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { failDefinition } from "../diagnostics.js";
import {
  deriveDocumentModelNames,
  deriveDocumentModelOperationNames,
} from "../naming.js";
import { canonicalJson, sha256 } from "../primitives.js";
import {
  DOCUMENT_SCALAR_REFERENCE_ORDER,
  isCustomScalarName,
  scalarNamesInReference,
} from "../scalar-references.js";

export interface LegacyGraphQLDocumentParserInterface {
  parse(source: string): unknown;
}

export type NormalizedLegacyDocumentModelSource<
  TState extends PHBaseState = PHBaseState,
> = {
  readonly kind: "legacy-document-model-source";
  readonly module: DocumentModelModule<TState>;
  readonly definition: DocumentModelDefinitionV1;
  readonly digest: `sha256:${string}`;
  readonly documentType: string;
  readonly version: number;
};

function locationFree(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return failDefinition({
        code: "PH-DM-LEGACY-SDL-INVALID",
        message: "A GraphQL AST contains a non-finite number.",
        repair: "Parse the stored SDL with a GraphQL-compatible parser.",
      });
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(locationFree);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, child]) => key !== "loc" && child !== undefined)
        .map(([key, child]) => [key, locationFree(child)]),
    );
  }
  return failDefinition({
    code: "PH-DM-LEGACY-SDL-INVALID",
    message: `A GraphQL AST contains unsupported ${typeof value} data.`,
    repair: "Return a JSON-safe GraphQL DocumentNode from the parser Adapter.",
  });
}

function parseDocument(
  parser: LegacyGraphQLDocumentParserInterface,
  source: string,
  path: readonly (string | number)[],
): LocationFreeGraphQLDocumentNodeV1 {
  let parsed: unknown;
  try {
    parsed = parser.parse(source);
  } catch (error) {
    return failDefinition({
      code: "PH-DM-LEGACY-SDL-INVALID",
      path,
      message: `Stored GraphQL SDL could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      repair: "Repair the legacy SDL before adapting or migrating this model.",
    });
  }
  const stripped = locationFree(parsed);
  if (
    stripped === null ||
    typeof stripped !== "object" ||
    (stripped as { readonly kind?: unknown }).kind !== "Document" ||
    !Array.isArray((stripped as { readonly definitions?: unknown }).definitions)
  ) {
    return failDefinition({
      code: "PH-DM-LEGACY-SDL-INVALID",
      path,
      message: "The parser Adapter did not return a GraphQL DocumentNode.",
      repair: "Return { kind: 'Document', definitions: [...] } from parse().",
    });
  }
  return stripped as LocationFreeGraphQLDocumentNodeV1;
}

function valueFromAst(value: GraphQLConstValueNodeV1): JsonValue {
  switch (value.kind) {
    case "IntValue":
    case "FloatValue":
      return Number(value.value);
    case "StringValue":
    case "EnumValue":
      return value.value;
    case "BooleanValue":
      return value.value;
    case "NullValue":
      return null;
    case "ListValue":
      return value.values.map(valueFromAst);
    case "ObjectValue":
      return Object.fromEntries(
        value.fields.map((field) => [
          field.name.value,
          valueFromAst(field.value),
        ]),
      );
  }
}

function directiveUse(
  directive: GraphQLDirectiveNodeV1,
): DirectiveUseDefinitionV1 {
  return {
    name: directive.name.value,
    arguments: directive.arguments.map((argument) => ({
      name: argument.name.value,
      value: valueFromAst(argument.value),
    })),
  };
}

function deprecatedReason(
  directives: readonly GraphQLDirectiveNodeV1[],
): string | null {
  const deprecated = directives.find(
    (directive) => directive.name.value === "deprecated",
  );
  if (!deprecated) return null;
  const reason = deprecated.arguments.find(
    (argument) => argument.name.value === "reason",
  )?.value;
  return reason?.kind === "StringValue" ? reason.value : "No longer supported";
}

function projectedDirectives(
  directives: readonly GraphQLDirectiveNodeV1[],
): readonly DirectiveUseDefinitionV1[] | undefined {
  const projected = directives
    .filter((directive) => directive.name.value !== "deprecated")
    .map(directiveUse);
  return projected.length ? projected : undefined;
}

function typeReference(type: GraphQLTypeNodeV1): TypeReferenceDefinitionV1 {
  if (type.kind === "NonNullType") {
    const nested = typeReference(type.type);
    return { ...nested, required: true };
  }
  if (type.kind === "ListType") {
    return { kind: "list", required: false, item: typeReference(type.type) };
  }
  const name = type.name.value;
  return isCustomScalarName(name) ||
    ["ID", "String", "Boolean", "Int", "Float"].includes(name)
    ? {
        kind: "scalar",
        name: name as ScalarNameV1,
        required: false,
      }
    : { kind: "named", name, required: false };
}

function inputField(
  field: GraphQLInputValueDefinitionNodeV1,
): InputFieldDefinitionV1 {
  return {
    key: field.name.value,
    name: field.name.value,
    description: field.description?.value ?? null,
    deprecated: deprecatedReason(field.directives),
    type: typeReference(field.type),
    ...(field.defaultValue === undefined
      ? {}
      : { defaultValue: valueFromAst(field.defaultValue) }),
    ...(projectedDirectives(field.directives)
      ? { directives: projectedDirectives(field.directives) }
      : {}),
  };
}

function outputField(field: GraphQLFieldDefinitionNodeV1): FieldDefinitionV1 {
  return {
    key: field.name.value,
    name: field.name.value,
    description: field.description?.value ?? null,
    deprecated: deprecatedReason(field.directives),
    ...(field.arguments.length
      ? { args: field.arguments.map(inputField) }
      : {}),
    type: typeReference(field.type),
    ...(projectedDirectives(field.directives)
      ? { directives: projectedDirectives(field.directives) }
      : {}),
  };
}

function projectNamedType(
  node: GraphQLTypeSystemDefinitionNodeV1,
): NamedGraphQLTypeDefinitionV1 | undefined {
  switch (node.kind) {
    case "EnumTypeDefinition": {
      const definition = node as GraphQLEnumTypeDefinitionNodeV1;
      return {
        kind: "enum",
        name: definition.name.value,
        description: definition.description?.value ?? null,
        values: definition.values.map((value) => ({
          name: value.name.value,
          description: value.description?.value ?? null,
          deprecated: deprecatedReason(value.directives),
          ...(projectedDirectives(value.directives)
            ? { directives: projectedDirectives(value.directives) }
            : {}),
        })),
      };
    }
    case "InputObjectTypeDefinition": {
      const definition = node as GraphQLInputObjectTypeDefinitionNodeV1;
      return {
        kind: "input",
        name: definition.name.value,
        description: definition.description?.value ?? null,
        unknownKeys: "preserve",
        fields: definition.fields.map(inputField),
      };
    }
    case "ObjectTypeDefinition": {
      const definition = node as GraphQLObjectTypeDefinitionNodeV1;
      return {
        kind: "object",
        name: definition.name.value,
        description: definition.description?.value ?? null,
        ...(definition.interfaces.length
          ? {
              implements: definition.interfaces.map(
                (implemented) => implemented.name.value,
              ),
            }
          : {}),
        fields: definition.fields.map(outputField),
      };
    }
    case "InterfaceTypeDefinition": {
      const definition = node as GraphQLInterfaceTypeDefinitionNodeV1;
      return {
        kind: "interface",
        name: definition.name.value,
        description: definition.description?.value ?? null,
        ...(definition.interfaces.length
          ? {
              implements: definition.interfaces.map(
                (implemented) => implemented.name.value,
              ),
            }
          : {}),
        fields: definition.fields.map(outputField),
      };
    }
    case "UnionTypeDefinition":
      return {
        kind: "union",
        name: node.name.value,
        description: node.description?.value ?? null,
        members: node.types.map((type) => type.name.value),
      };
    default:
      return undefined;
  }
}

function projectedTypes(
  document: LocationFreeGraphQLDocumentNodeV1,
): readonly NamedGraphQLTypeDefinitionV1[] {
  const definitions: NamedGraphQLTypeDefinitionV1[] = [];
  const byName = new Map<string, NamedGraphQLTypeDefinitionV1>();
  for (const node of document.definitions) {
    if (node.kind.endsWith("Extension")) continue;
    const projected = projectNamedType(
      node as GraphQLTypeSystemDefinitionNodeV1,
    );
    if (!projected) continue;
    const existing = byName.get(projected.name);
    if (!existing) {
      byName.set(projected.name, projected);
      definitions.push(projected);
      continue;
    }
    if (
      canonicalJson(existing as unknown as JsonValue) !==
      canonicalJson(projected as unknown as JsonValue)
    ) {
      failDefinition({
        code: "PH-DM-LEGACY-SDL-MISMATCH",
        path: ["types", projected.name],
        message: `Legacy SDL defines ${projected.name} more than once with different shapes.`,
        repair:
          "Retain the exact AST compatibility path and provide one descriptor-compatible shape.",
      });
    }
  }
  return definitions;
}

function scalarReferences(
  definitions: readonly NamedGraphQLTypeDefinitionV1[],
) {
  const names = new Set<string>();
  for (const definition of definitions) {
    if (definition.kind === "enum" || definition.kind === "union") continue;
    for (const field of definition.fields) {
      if ("args" in field) {
        field.args?.forEach((argument) =>
          scalarNamesInReference(argument.type, names),
        );
      }
      scalarNamesInReference(field.type, names);
    }
  }
  return DOCUMENT_SCALAR_REFERENCE_ORDER.filter((name) => names.has(name)).map(
    (name) => ({
      name,
      implementation: `powerhouse.catalog#${name}` as const,
      coercionProfile: "document-engineering-1.40" as const,
    }),
  );
}

function storedJson(
  value: string,
  path: readonly (string | number)[],
): JsonValue {
  if (value === "") return {};
  try {
    return JSON.parse(value) as JsonValue;
  } catch (error) {
    return failDefinition({
      code: "PH-DM-LEGACY-SERIALIZATION-INVALID",
      path,
      message: `Stored initial JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      repair: "Repair the stored initialValue before adapting this model.",
    });
  }
}

function legacyExamples(
  examples: readonly { readonly id: string; readonly value: string }[],
  path: readonly (string | number)[],
) {
  const ids = new Set<string>();
  return examples.map((example, index) => {
    if (ids.has(example.id)) {
      return failDefinition({
        code: "PH-DM-IDENTITY-INVALID",
        path: [...path, index, "id"],
        message: `Legacy example ID ${JSON.stringify(example.id)} is duplicated.`,
        repair:
          "Provide distinct semantic compatibility keys before migration.",
      });
    }
    ids.add(example.id);
    return {
      id: example.id,
      key: `legacy-id:${example.id}`,
      value: example.value,
    };
  });
}

function schemaSegments(
  specification: DocumentSpecification,
): readonly string[] {
  return [
    specification.state.global.schema,
    specification.state.local.schema,
    ...specification.modules.flatMap((module) =>
      module.operations.flatMap((operation) =>
        operation.schema === null ? [] : [operation.schema],
      ),
    ),
  ].filter((segment) => segment.length > 0);
}

function legacyScope(
  scope: string,
  path: readonly (string | number)[],
): "global" | "local" {
  if (scope !== "global" && scope !== "local") {
    return failDefinition({
      code: "PH-DM-SCOPE-UNSUPPORTED",
      path,
      message: `Legacy operation scope ${JSON.stringify(scope)} is outside the V1 definition grammar.`,
      repair:
        "Keep the legacy module active until its scope has a compatible global or local mapping.",
    });
  }
  return scope;
}

export class LegacyDocumentModelModuleAdapter {
  constructor(private readonly parser: LegacyGraphQLDocumentParserInterface) {}

  adapt<TState extends PHBaseState>(
    module: DocumentModelModule<TState>,
  ): NormalizedLegacyDocumentModelSource<TState> {
    const stored = module.documentModel.global;
    const modelNames = deriveDocumentModelNames(stored.name);
    const specifications: DocumentModelSpecificationDefinitionV1[] =
      stored.specifications.map((specification, specificationIndex) => {
        const combined = parseDocument(
          this.parser,
          schemaSegments(specification).join("\n"),
          ["specifications", specificationIndex, "schema"],
        );
        const allTypes = projectedTypes(combined);
        const operationInputNames = new Set<string>();
        const actionTypes = new Map<string, readonly (string | number)[]>();

        const modules = specification.modules.map(
          (storedModule, moduleIndex) => ({
            id: storedModule.id,
            key: storedModule.name,
            name: storedModule.name,
            description: storedModule.description,
            operations: storedModule.operations.map(
              (operation, operationIndex) => {
                if (!operation.name) {
                  return failDefinition({
                    code: "PH-DM-LEGACY-NAME-INVALID",
                    path: [
                      "specifications",
                      specificationIndex,
                      "modules",
                      moduleIndex,
                      "operations",
                      operationIndex,
                      "name",
                    ],
                    message:
                      "A legacy operation without a name has no current runtime symbol.",
                    repair:
                      "Keep the legacy family active until the operation has an explicit compatibility name.",
                  });
                }
                const names = deriveDocumentModelOperationNames(
                  operation.name,
                  { hasInput: operation.schema !== null },
                );
                const operationPath = [
                  "specifications",
                  specificationIndex,
                  "modules",
                  moduleIndex,
                  "operations",
                  operationIndex,
                ] as const;
                const previousActionPath = actionTypes.get(names.actionType);
                if (previousActionPath) {
                  return failDefinition({
                    code: "PH-DM-DUPLICATE-ACTION",
                    path: [...operationPath, "actionType"],
                    message: `More than one legacy operation derives action type ${names.actionType}.`,
                    expected: `unique; first used at ${previousActionPath.join("/")}`,
                    received: names.actionType,
                    repair:
                      "Rename one operation so every persisted action type is unique within the complete model version.",
                  });
                }
                actionTypes.set(names.actionType, operationPath);
                const scope = legacyScope(operation.scope, [
                  "specifications",
                  specificationIndex,
                  "modules",
                  moduleIndex,
                  "operations",
                  operationIndex,
                  "scope",
                ]);
                let input: GraphQLInputObjectTypeDefinitionNodeV1 | undefined;
                if (operation.schema !== null) {
                  const operationDocument = parseDocument(
                    this.parser,
                    operation.schema,
                    [
                      "specifications",
                      specificationIndex,
                      "modules",
                      moduleIndex,
                      "operations",
                      operationIndex,
                      "schema",
                    ],
                  );
                  const expectedName = names.actionInputTypeName as string;
                  input = operationDocument.definitions.find(
                    (
                      definition,
                    ): definition is GraphQLInputObjectTypeDefinitionNodeV1 =>
                      definition.kind === "InputObjectTypeDefinition" &&
                      definition.name.value === expectedName,
                  );
                  if (!input) {
                    return failDefinition({
                      code: "PH-DM-LEGACY-SDL-MISMATCH",
                      path: [
                        "specifications",
                        specificationIndex,
                        "modules",
                        moduleIndex,
                        "operations",
                        operationIndex,
                        "schema",
                      ],
                      message: `Legacy operation SDL does not define ${expectedName}.`,
                      repair:
                        "Repair the stored operation schema or supply an explicit migration compatibility mapping.",
                    });
                  }
                  operationInputNames.add(expectedName);
                }
                return {
                  id: operation.id,
                  key: operation.name,
                  name: operation.name,
                  description: operation.description,
                  actionType: names.actionType,
                  creatorKey: names.actionCreatorKey,
                  scope,
                  input:
                    input === undefined
                      ? null
                      : (projectNamedType(input) as InputTypeDefinitionV1),
                  errors: operation.errors.map((error, errorIndex) => {
                    if (!error.name) {
                      return failDefinition({
                        code: "PH-DM-LEGACY-NAME-INVALID",
                        path: [
                          "specifications",
                          specificationIndex,
                          "modules",
                          moduleIndex,
                          "operations",
                          operationIndex,
                          "errors",
                          errorIndex,
                          "name",
                        ],
                        message:
                          "A legacy error without a name has no generated runtime class key.",
                        repair:
                          "Keep the legacy family active until the error has an explicit compatibility key.",
                      });
                    }
                    return {
                      id: error.id,
                      key: deriveDocumentModelOperationNames(error.name)
                        .storedName,
                      code: error.code,
                      name: error.name,
                      description: error.description,
                      template: error.template,
                    };
                  }),
                  examples: legacyExamples(operation.examples, [
                    "specifications",
                    specificationIndex,
                    "modules",
                    moduleIndex,
                    "operations",
                    operationIndex,
                    "examples",
                  ]),
                  template: operation.template,
                  reducer: operation.reducer,
                };
              },
            ),
          }),
        );

        const types = allTypes.filter(
          (definition) => !operationInputNames.has(definition.name),
        );
        const globalDocument = parseDocument(
          this.parser,
          specification.state.global.schema,
          ["specifications", specificationIndex, "state", "global", "schema"],
        );
        if (
          !globalDocument.definitions.some(
            (definition) =>
              definition.kind === "ObjectTypeDefinition" &&
              definition.name.value === modelNames.globalStateName,
          )
        ) {
          return failDefinition({
            code: "PH-DM-STATE-ROOT-INVALID",
            path: [
              "specifications",
              specificationIndex,
              "state",
              "global",
              "schema",
            ],
            message: `Legacy global SDL does not define ${modelNames.globalStateName}.`,
            repair: "Repair the stored root name before adapting this model.",
          });
        }
        const localEmpty = specification.state.local.schema === "";
        if (!localEmpty) {
          const localDocument = parseDocument(
            this.parser,
            specification.state.local.schema,
            ["specifications", specificationIndex, "state", "local", "schema"],
          );
          if (
            !localDocument.definitions.some(
              (definition) =>
                definition.kind === "ObjectTypeDefinition" &&
                definition.name.value === modelNames.localStateName,
            )
          ) {
            return failDefinition({
              code: "PH-DM-STATE-ROOT-INVALID",
              path: [
                "specifications",
                specificationIndex,
                "state",
                "local",
                "schema",
              ],
              message: `Legacy local SDL does not define ${modelNames.localStateName}.`,
              repair: "Repair the stored root name before adapting this model.",
            });
          }
        }

        const globalExamples = legacyExamples(
          specification.state.global.examples,
          ["specifications", specificationIndex, "state", "global", "examples"],
        );
        const localExamples = legacyExamples(
          specification.state.local.examples,
          ["specifications", specificationIndex, "state", "local", "examples"],
        );
        return {
          version: specification.version,
          scalars: scalarReferences(allTypes),
          graphQLCompatibility: {
            kind: "graphql-ast-v1",
            document: combined,
            preserveDefinitionOrder: true,
          },
          types,
          state: {
            global: {
              root: {
                kind: "named",
                name: modelNames.globalStateName,
                required: true,
              },
              initialValue: storedJson(
                specification.state.global.initialValue,
                [
                  "specifications",
                  specificationIndex,
                  "state",
                  "global",
                  "initialValue",
                ],
              ),
              examples: globalExamples,
              unknownKeys: "preserve",
              materialized: {
                schema: specification.state.global.schema,
                initialValue: specification.state.global.initialValue,
                examples: specification.state.global.examples.map(
                  ({ id, value }) => ({ id, value }),
                ),
              },
            },
            local: localEmpty
              ? {
                  root: null,
                  initialValue: {},
                  examples: localExamples,
                  unknownKeys: "preserve",
                  materialized: {
                    schema: "",
                    initialValue: specification.state.local.initialValue,
                    examples: specification.state.local.examples.map(
                      ({ id, value }) => ({ id, value }),
                    ),
                  },
                }
              : {
                  root: {
                    kind: "named",
                    name: modelNames.localStateName,
                    required: true,
                  },
                  initialValue: storedJson(
                    specification.state.local.initialValue,
                    [
                      "specifications",
                      specificationIndex,
                      "state",
                      "local",
                      "initialValue",
                    ],
                  ),
                  examples: localExamples,
                  unknownKeys: "preserve",
                  materialized: {
                    schema: specification.state.local.schema,
                    initialValue: specification.state.local.initialValue,
                    examples: specification.state.local.examples.map(
                      ({ id, value }) => ({ id, value }),
                    ),
                  },
                },
          },
          modules,
          changeLog: [...specification.changeLog],
        };
      });

    const definition: DocumentModelDefinitionV1 = {
      kind: "powerhouse.document-model",
      formatVersion: 1,
      compatibility: {
        identity: "explicit-legacy",
        scalarCoercion: "document-engineering-1.40",
        serialization: "explicit-legacy",
      },
      model: {
        documentType: stored.id,
        graphQLName: modelNames.graphQLName,
        name: stored.name,
        description: stored.description,
        extension: stored.extension,
        author: { ...stored.author },
      },
      specifications,
    };
    const version = module.version ?? 1;
    return {
      kind: "legacy-document-model-source",
      module,
      definition,
      digest: sha256(canonicalJson(definition as unknown as JsonValue)),
      documentType: stored.id,
      version,
    };
  }
}
