import {
  buildSubgraphSchema,
  type GraphQLResolverMap,
  type GraphQLSchemaModule,
} from "@apollo/subgraph";
import type { Context } from "@powerhousedao/reactor-api";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { camelCase, pascalCase } from "change-case";
import {
  canonicalDigest,
  childLogger,
  formatDefinitionDiagnostic,
  packageScalarsOf,
  printSchemaSegment,
  type ScalarBinding,
} from "document-model";
import { orderedScalarNames, scalarCatalog } from "document-model/scalars";
import {
  type DocumentNode,
  type GraphQLScalarType,
  Kind,
  parse,
  print,
} from "graphql";
import { gql } from "graphql-tag";
import {
  type DocumentModelSchemaOptions,
  generateModelSchema,
  getDocumentModelSchemaName,
  type ModelProjection,
} from "../graphql/model-schema-templates.js";
import {
  HOST_SCALAR_RESOLVERS,
  packageScalarResolvers,
  unreportedScalarBindings,
} from "../graphql/scalar-bindings.js";
import { structuredModelProjection } from "../graphql/structured-model-schema.js";
import {
  namespaceTypes,
  printCompatibilityDocument,
  structuredModelOf,
  type StructuredModel,
} from "../graphql/structured-projection.js";

export {
  type DocumentModelSchemaOptions,
  getDocumentModelSchemaName,
} from "../graphql/model-schema-templates.js";

const logger = childLogger(["reactor-api", "create-schema"]);

/**
 * Strip the scalar definitions the host declares itself from a DocumentNode,
 * so combining it with the host's prelude does not declare one twice. A
 * scalar only the subgraph declares, such as a package scalar, stays.
 */
const stripScalarDefinitions = (
  doc: DocumentNode,
  declared: ReadonlySet<string>,
): string => {
  const filteredDefinitions = doc.definitions.filter(
    (def) =>
      def.kind !== Kind.SCALAR_TYPE_DEFINITION || !declared.has(def.name.value),
  );
  return print({ kind: Kind.DOCUMENT, definitions: filteredDefinitions });
};

/** A model's package scalar, under the name the host serves it by. */
type HostPackageScalar = {
  readonly name: string;
  readonly description: string;
  /**
   * Absent when the module's compiler recorded no binding. The host then
   * serves the scalar with GraphQL's default pass-through.
   */
  readonly binding: ScalarBinding | undefined;
};

/**
 * Collects the package scalars this host's code-first models declare, each
 * named with its model's prefix. Every subgraph carries every model's state
 * types, so each subgraph declares all of them. As in
 * `getDocumentModelTypeDefs`, only the first module with a given schema name
 * is projected. A binding is matched to its scalar by definition digest.
 */
function modelPackageScalars(
  documentModels: readonly DocumentModelModule[],
): readonly HostPackageScalar[] {
  const scalars: HostPackageScalar[] = [];
  const projected = new Set<string>();
  for (const module of documentModels) {
    const schemaName = getDocumentModelSchemaName(module.documentModel.global);
    if (projected.has(schemaName)) continue;
    projected.add(schemaName);
    const structured = structuredModelOf(module);
    if (structured === null) continue;
    const bindings = new Map(
      packageScalarsOf(module).map((binding) => [
        canonicalDigest(binding.definition),
        binding,
      ]),
    );
    for (const scalar of structured.specification.scalars) {
      if (!("definition" in scalar)) continue;
      scalars.push({
        name: `${schemaName}_${scalar.name}`,
        description: scalar.definition.description,
        binding: bindings.get(canonicalDigest(scalar.definition)),
      });
    }
  }
  return scalars;
}

/**
 * Returns the names an authored resolver map binds to a scalar type of the
 * same name, as a code-first subgraph does for its package scalars. The check
 * reads the object's shape because a scalar built by another graphql copy
 * fails `instanceof`.
 */
function authoredScalarNames(
  resolvers: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  return new Set(
    Object.entries(resolvers).flatMap(([name, resolver]) => {
      const scalar = resolver as Partial<GraphQLScalarType> | null;
      return scalar !== null &&
        typeof scalar === "object" &&
        scalar.name === name &&
        typeof scalar.parseValue === "function" &&
        typeof scalar.serialize === "function"
        ? [name]
        : [];
    }),
  );
}

/**
 * Type-system definition kinds that GraphQL requires to be uniquely named.
 * A subgraph SDL with two definitions sharing a name fails federation
 * composition ("There can be only one type named X"), which is fatal to the
 * whole gateway. We dedupe these by name; field/operation/extension nodes are
 * left untouched.
 */
const TYPE_DEFINITION_KINDS = new Set<Kind>([
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_DEFINITION,
]);

/**
 * Drop duplicate type-system definitions by name, keeping the first occurrence.
 * Deduping is by name across ALL kinds (a `type` and an `enum` sharing a name
 * collide in GraphQL too), so the first definition of a given name wins
 * regardless of kind. State types are emitted before operation types, so
 * keep-first preserves the authoritative state definition. This heals a document
 * model that defines the same name twice (global+local, state+operation, or
 * twice in one scope) so the assembled subgraph SDL composes instead of crashing
 * the gateway (Sentry #917).
 */
const dedupeTypeDefinitions = (doc: DocumentNode): DocumentNode => {
  const seen = new Set<string>();
  const definitions = doc.definitions.filter((def) => {
    if (!TYPE_DEFINITION_KINDS.has(def.kind)) return true;
    const name = (def as { name?: { value: string } }).name?.value;
    if (!name) return true;
    if (seen.has(name)) {
      // A duplicate here would otherwise crash supergraph composition; log it so
      // production has a breadcrumb of which model shipped a duplicate name.
      logger.debug(`Dropping duplicate type definition: ${name}`);
      return false;
    }
    seen.add(name);
    return true;
  });
  return { kind: Kind.DOCUMENT, definitions };
};

export const buildSubgraphSchemaModule = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
): GraphQLSchemaModule => {
  // Later spreads win. A model's package scalars override an authored
  // resolver of the same name, and the host's two coercers override both.
  // Existing clients depend on the host coercers winning.
  const packageScalars = modelPackageScalars(documentModels).flatMap(
    ({ name, binding }) => (binding === undefined ? [] : [{ name, binding }]),
  );
  const newResolvers = {
    ...resolvers,
    ...packageScalarResolvers(packageScalars),
    ...HOST_SCALAR_RESOLVERS,
  };
  const moduleTypeDefs = getDocumentModelTypeDefs(documentModels, typeDefs);
  const boundPackageScalars = new Set([
    ...packageScalars.map(({ name }) => name),
    ...authoredScalarNames(resolvers),
  ]);

  // The scalar report only logs. A throw from it must not stop the subgraph
  // from composing, so it is caught.
  try {
    for (const diagnostic of unreportedScalarBindings(
      moduleTypeDefs,
      resolvers,
      boundPackageScalars,
    )) {
      logger.warn(formatDefinitionDiagnostic(diagnostic));
    }
  } catch (error) {
    logger.debug("scalar binding report failed: @error", error);
  }

  return {
    typeDefs: moduleTypeDefs,
    resolvers: newResolvers,
  };
};
export const createSchema = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
) => {
  // Array form: @apollo/subgraph 2.15 dropped the bare-module overload.
  return buildSubgraphSchema([
    buildSubgraphSchemaModule(documentModels, resolvers, typeDefs),
  ]);
};

/**
 * Create a merged GraphQL schema from multiple subgraph modules.
 * Uses buildSubgraphSchema's array overload to combine type definitions
 * and resolvers from multiple subgraphs into a single executable schema.
 */
export const createMergedSchema = (modules: GraphQLSchemaModule[]) => {
  return buildSubgraphSchema(modules);
};

/**
 * The `IDocument` type each model contributes to the composed host schema.
 * Both projections use it, and only the state type it references differs.
 */
function documentWrapperType(
  schemaName: string,
  stateRootName: string,
): string {
  const typedState = schemaName !== "DocumentModel";
  return `
    type ${schemaName} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              createdAtUtcIso: DateTime!
              lastModifiedAtUtcIso: DateTime!
              ${typedState ? `initialState: ${schemaName}_${stateRootName}!` : ""}
              ${typedState ? `state: ${schemaName}_${stateRootName}!` : ""}
              stateJSON: JSONObject
          }\n`;
}

/**
 * The state types a code-first model contributes, namespaced from the
 * structured definition. Inputs declared beside the state are dropped, as the
 * stored-SDL path strips `input` blocks. `generateModelSchema` prints the
 * global ones as state input types.
 */
function structuredModelStateTypes(
  { specification, segments, packageScalars }: StructuredModel,
  schemaName: string,
): string {
  const wrapper = documentWrapperType(
    schemaName,
    specification.state.global.root.name,
  );
  if (specification.graphQLCompatibility !== null) {
    // A retained GraphQL AST is projected whole, including its type extensions.
    return (
      printCompatibilityDocument(
        specification.graphQLCompatibility.document,
        schemaName,
        packageScalars,
      ) + wrapper
    );
  }
  const stateTypes = [...segments.global, ...segments.local].filter(
    (type) => type.kind !== "input",
  );
  return (
    printSchemaSegment(namespaceTypes(stateTypes, schemaName, packageScalars)) +
    wrapper
  );
}

function storedModelStateTypes(
  documentModel: DocumentModelGlobalState,
  dmSchemaName: string,
): string {
  // Use only the latest specification to avoid duplicate type definitions
  // when a document model has multiple versions (e.g. v1, v2).
  const latestSpec = documentModel.specifications.at(-1);
  const globalSchema = latestSpec?.state.global.schema ?? "";
  const localSchema = latestSpec?.state.local.schema ?? "";
  let tmpDmSchema = `
          ${globalSchema
            .replaceAll("scalar DateTime", "")
            .replaceAll(/input (.*?) {[\s\S]*?}/g, "")};

          ${localSchema
            .replaceAll("scalar DateTime", "")
            .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
            .replaceAll("type AccountSnapshotLocalState", "")
            .replaceAll("type BudgetStatementLocalState", "")
            .replaceAll("type ScopeFrameworkLocalState", "")};

    \n`;

  const found = tmpDmSchema.match(/(type|enum|union|interface)\s+(\w+)[\s{]/g);
  const trimmedFound = found?.map((f) =>
    f
      .replaceAll("type ", "")
      .replaceAll("enum ", "")
      .replaceAll("union ", "")
      .replaceAll("interface ", "")
      .replaceAll("{", "")
      .trim(),
  );
  trimmedFound?.forEach((f) => {
    // Create a regex that matches the type name with proper boundaries
    const typeRegex = new RegExp(
      // Match type references in various GraphQL contexts
      `(?<![_A-Za-z0-9])(${f})(?![_A-Za-z0-9])|` + // Basic type references
        `\\[(${f})\\]|` + // Array types without nullability
        `\\[(${f})!\\]|` + // Array of non-null types
        `\\[(${f})\\]!|` + // Non-null array of types
        `\\[(${f})!\\]!`, // Non-null array of non-null types
      "g",
    );

    tmpDmSchema = tmpDmSchema.replace(
      typeRegex,
      (
        match: string,
        p1: string,
        p2: string,
        p3: string,
        p4: string,
        p5: string,
      ) => {
        // If it's an array type, preserve the brackets and ! while replacing the type name
        if (match.startsWith("[")) {
          return match.replace(
            p2 || p3 || p4 || p5,
            `${dmSchemaName}_${p2 || p3 || p4 || p5}`,
          );
        }
        // Basic type reference
        return `${dmSchemaName}_${p1}`;
      },
    );
  });
  return (
    tmpDmSchema + documentWrapperType(dmSchemaName, `${dmSchemaName}State`)
  );
}

/**
 * The scalars every document-model subgraph declares, in the order the host
 * has always printed them. A scalar added to the catalog later is appended.
 */
const SUBGRAPH_SCALAR_TYPE_DEFS = orderedScalarNames(scalarCatalog.names, [
  "JSONObject",
  "AttachmentRef",
  "Unknown",
  "Address",
  "Amount_Tokens",
  "EthereumAddress",
  "Amount_Percentage",
  "EmailAddress",
  "Date",
  "DateTime",
  "URL",
  "Amount_Money",
  "OLabel",
  "Currency",
  "PHID",
  "OID",
  "Amount_Fiat",
  "Amount_Currency",
  "Amount_Crypto",
  "Amount",
  "Upload",
])
  .map((name) => `scalar ${name}`)
  .join("\n");

export const getDocumentModelTypeDefs = (
  documentModels: DocumentModelModule[],
  typeDefs: DocumentNode,
) => {
  let dmSchema = "";
  const packageScalars = modelPackageScalars(documentModels);
  const hostScalars = new Set<string>([
    ...scalarCatalog.names,
    ...packageScalars.map(({ name }) => name),
  ]);

  const addedDocumentModels = new Set<string>();
  documentModels.forEach((module) => {
    const { documentModel } = module;
    const dmSchemaName = getDocumentModelSchemaName(documentModel.global);
    if (addedDocumentModels.has(dmSchemaName)) {
      logger.debug(
        `Skipping document model with duplicate name: ${dmSchemaName}`,
      );
      return;
    }
    addedDocumentModels.add(dmSchemaName);
    const structured = structuredModelOf(module);
    dmSchema +=
      structured === null
        ? storedModelStateTypes(documentModel.global, dmSchemaName)
        : structuredModelStateTypes(structured, dmSchemaName);
  });

  // add the mutation and query types
  const schema = gql`
    ${SUBGRAPH_SCALAR_TYPE_DEFS}
    ${packageScalars
      .map(
        ({ name, description }) =>
          `${JSON.stringify(description)}\nscalar ${name}`,
      )
      .join("\n")}

    type PHOperationContext {
      signer: Signer
    }

    type Signer {
      user: SignerUser
      app: SignerApp
      signatures: [String!]!
    }

    type SignerUser {
      address: String!
      networkId: String!
      chainId: Int!
    }

    type SignerApp {
      name: String!
      key: String!
    }

    type Operation {
      id: String!
      type: String!
      index: Int!
      timestampUtcMs: DateTime!
      hash: String!
      skip: Int
      inputText: String
      error: String
      context: PHOperationContext
    }

    interface IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }
    ${dmSchema.replaceAll(";", "")}

    type GqlDocument implements IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }

    type DriveDocument implements IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }

    ${stripScalarDefinitions(typeDefs, hostScalars)}
  `;

  return dedupeTypeDefinitions(schema);
};

/**
 * Extract type names from a GraphQL schema.
 * @param {string} schema - GraphQL schema string
 * @returns {string[]} Array of type names
 */
function extractTypeNames(schema: string) {
  const found = schema.match(/(type|enum|union|interface|input)\s+(\w+)[\s{]/g);
  if (!found) return [];
  return found.map((f) =>
    f
      .replaceAll("type ", "")
      .replaceAll("enum ", "")
      .replaceAll("union ", "")
      .replaceAll("interface ", "")
      .replaceAll("input ", "")
      .replaceAll("{", "")
      .trim(),
  );
}

/**
 * Extract input type definitions from a GraphQL schema.
 * @param {string} schema - GraphQL schema string
 * @param {Set<string>} excludeTypeNames - Type names to exclude from extraction
 * @returns {string} All input type definitions as a string
 */
function extractInputTypeDefinitions(
  schema: string,
  excludeTypeNames: Set<string> = new Set(),
): string {
  // Match input type blocks: input TypeName { ... }
  const inputTypeRegex = /input\s+(\w+)\s*\{[^}]*\}/g;
  const matches: string[] = [];
  let match;
  while ((match = inputTypeRegex.exec(schema)) !== null) {
    const typeName = match[1];
    // Skip if this type name is in the exclusion set
    if (!excludeTypeNames.has(typeName)) {
      matches.push(match[0]);
    }
  }
  if (matches.length === 0) return "";
  return matches.join("\n\n");
}

/**
 * AST type node shape for recursive type conversion.
 */
type GraphQLTypeNode = {
  kind: Kind;
  name?: { value: string };
  type?: GraphQLTypeNode;
};

/**
 * Extract the root state type name from a scope's GraphQL schema.
 * Uses the naming convention: {DocumentName}State for global,
 * {DocumentName}{PascalScope}State for other scopes (e.g., DocumentDriveLocalState).
 * Falls back to the last ObjectTypeDefinition (root types are conventionally last).
 */
function extractRootTypeName(
  schema: string,
  documentName: string,
  scopeName: string,
): string | null {
  try {
    const ast = parse(schema);

    // Try conventions:
    // 1. {DocumentName}State for global, {DocumentName}{Scope}State otherwise
    // 2. {DocumentName}GlobalState (DocumentModel uses this variant)
    const scopeSuffix = scopeName === "global" ? "" : pascalCase(scopeName);
    const candidates = [
      `${documentName}${scopeSuffix}State`,
      `${documentName}${pascalCase(scopeName)}State`,
    ];

    let lastObjectType: string | null = null;
    for (const def of ast.definitions) {
      if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
        if (candidates.includes(def.name.value)) {
          return def.name.value;
        }
        lastObjectType = def.name.value;
      }
    }

    // Fallback: last object type (root state types are defined last by convention)
    return lastObjectType;
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Convert a GraphQL output type AST node to an optional input type string.
 * Strips non-null markers and converts object type references to Input suffix.
 */
function convertTypeNodeToInput(
  typeNode: GraphQLTypeNode,
  objectNames: Set<string>,
  unionNames: Set<string>,
  interfaceNames: Set<string>,
): string {
  if (typeNode.kind === Kind.NON_NULL_TYPE && typeNode.type) {
    return convertTypeNodeToInput(
      typeNode.type,
      objectNames,
      unionNames,
      interfaceNames,
    );
  }
  if (typeNode.kind === Kind.LIST_TYPE && typeNode.type) {
    const inner = convertTypeNodeToInput(
      typeNode.type,
      objectNames,
      unionNames,
      interfaceNames,
    );
    return `[${inner}]`;
  }
  if (typeNode.kind === Kind.NAMED_TYPE && typeNode.name) {
    const name = typeNode.name.value;
    if (objectNames.has(name)) return `${name}Input`;
    if (unionNames.has(name) || interfaceNames.has(name)) return "JSONObject";
    return name;
  }
  return "JSONObject";
}

/**
 * Generate GraphQL input type definitions from a state schema string.
 * Converts output type definitions to input types with all fields optional.
 * - Object type references get Input suffix
 * - Union/interface references become JSONObject
 * - Enums and scalars remain unchanged
 */
function generateStateInputTypes(
  stateSchema: string,
  excludeTypeNames?: Set<string>,
): string {
  if (!stateSchema || !stateSchema.trim()) return "";

  let ast;
  try {
    ast = parse(stateSchema);
  } catch {
    return "";
  }

  const enumNames = new Set<string>();
  const unionNames = new Set<string>();
  const interfaceNames = new Set<string>();
  const objectNames = new Set<string>();
  const existingInputNames = new Set<string>();

  for (const def of ast.definitions) {
    switch (def.kind) {
      case Kind.ENUM_TYPE_DEFINITION:
        enumNames.add(def.name.value);
        break;
      case Kind.UNION_TYPE_DEFINITION:
        unionNames.add(def.name.value);
        break;
      case Kind.INTERFACE_TYPE_DEFINITION:
        interfaceNames.add(def.name.value);
        break;
      case Kind.OBJECT_TYPE_DEFINITION:
        objectNames.add(def.name.value);
        break;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        existingInputNames.add(def.name.value);
        break;
    }
  }

  const inputTypes: string[] = [];

  for (const def of ast.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    // Skip if an input type with the same name already exists in the schema
    // or in operation schemas (to avoid duplicates with moduleSchemas)
    const inputName = `${def.name.value}Input`;
    if (existingInputNames.has(inputName)) continue;
    if (excludeTypeNames?.has(inputName)) continue;
    const fields = def.fields ?? [];
    if (fields.length === 0) continue;

    const inputFields = fields.map((field) => {
      const fieldName = field.name.value;
      const fieldType = convertTypeNodeToInput(
        field.type as GraphQLTypeNode,
        objectNames,
        unionNames,
        interfaceNames,
      );
      return `  ${fieldName}: ${fieldType}`;
    });

    inputTypes.push(
      `input ${def.name.value}Input {\n${inputFields.join("\n")}\n}`,
    );
  }

  return inputTypes.join("\n\n");
}

/**
 * Apply type prefixes to GraphQL schema to namespace types and avoid collisions.
 * Inlined from @powerhousedao/common/utils to avoid ES module import issues.
 * @param {string} schema - GraphQL schema string
 * @param {string} prefix - Prefix to apply to type names
 * @param {string[]} externalTypeNames - Type names from other schemas to also prefix
 * @returns {string} Schema with prefixed types
 */
function applyGraphQLTypePrefixes(
  schema: string,
  prefix: string,
  externalTypeNames: string[] = [],
): string {
  if (!schema || !schema.trim()) {
    return schema;
  }

  let processedSchema = schema;

  // Find types defined in this schema
  const localTypeNames = extractTypeNames(schema);

  // Combine with external type names (remove duplicates)
  const allTypeNames = [...new Set([...localTypeNames, ...externalTypeNames])];

  if (allTypeNames.length === 0) {
    return schema;
  }

  allTypeNames.forEach((typeName) => {
    const typeRegex = new RegExp(
      // Match type references in various GraphQL contexts
      `(?<![_A-Za-z0-9])(${typeName})(?![_A-Za-z0-9])|` +
        `\\[(${typeName})\\]|` +
        `\\[(${typeName})!\\]|` +
        `\\[(${typeName})\\]!|` +
        `\\[(${typeName})!\\]!`,
      "g",
    );

    processedSchema = processedSchema.replace(
      typeRegex,
      (match, p1, p2, p3, p4, p5) => {
        if (match.startsWith("[")) {
          return match.replace(
            (p2 || p3 || p4 || p5) as string,
            `${prefix}_${p2 || p3 || p4 || p5}`,
          );
        }
        // Basic type reference
        return `${prefix}_${p1}`;
      },
    );
  });

  return processedSchema;
}

/** Whether a stored schema string declares anything at all. */
const hasValidSchema = (schema: string | null | undefined): boolean =>
  !!(schema && /\b(input|type|enum|union|interface)\s+\w+/.test(schema));

/** Reads the template inputs out of a schema-first model's stored SDL by regex. */
function storedModelProjection(
  documentModel: DocumentModelGlobalState,
  documentName: string,
): ModelProjection {
  const specification = documentModel.specifications.at(-1);
  const globalStateSchema = specification?.state.global.schema;
  const localStateSchema = specification?.state.local.schema;
  const stateTypeNames = [
    ...extractTypeNames(globalStateSchema ?? ""),
    ...extractTypeNames(localStateSchema ?? ""),
  ];
  const allOperationTypeNames =
    specification?.modules.flatMap((module) =>
      module.operations.flatMap((op) => extractTypeNames(op.schema ?? "")),
    ) ?? [];
  const allTypeNames = [
    ...new Set([...stateTypeNames, ...allOperationTypeNames]),
  ];

  const prefixedStateInputTypes = applyGraphQLTypePrefixes(
    extractInputTypeDefinitions(
      globalStateSchema ?? "",
      new Set(allOperationTypeNames),
    ),
    documentName,
    allTypeNames,
  );

  const operations =
    specification?.modules.flatMap((module) =>
      module.operations
        .filter((op) => op.name && hasValidSchema(op.schema))
        .map((op) => ({
          camelName: camelCase(op.name!),
          inputTypeName: `${documentName}_${pascalCase(op.name!)}Input`,
        })),
    ) ?? [];

  const modules =
    specification?.modules
      .filter((module) =>
        module.operations.some((op) => hasValidSchema(op.schema)),
      )
      .map((module) => ({
        name: module.name,
        sdl: module.operations
          .filter((op) => hasValidSchema(op.schema))
          .map((op) =>
            applyGraphQLTypePrefixes(
              op.schema ?? "",
              documentName,
              allTypeNames,
            ),
          )
          .join("\n  "),
      })) ?? [];

  // DocumentModel names its root `DocumentModelGlobalState`.
  const globalStateTypeName =
    documentName === "DocumentModel"
      ? `${documentName}_${documentName}GlobalState`
      : `${documentName}_${documentName}State`;
  const localStateTypeName = (localStateSchema ?? "").includes(
    `type ${documentName}LocalState`,
  )
    ? `${documentName}_${documentName}LocalState`
    : null;

  return {
    documentName,
    operations,
    modules,
    stateInputTypes: prefixedStateInputTypes,
    globalStateTypeName,
    localStateTypeName,
    initialState: storedInitialState(specification, documentName, allTypeNames),
  };
}

/** The new API's initial-state argument, read out of the stored scope SDL. */
function storedInitialState(
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  documentName: string,
  allTypeNames: string[],
): ModelProjection["initialState"] {
  const scopes: { name: string; type: string }[] = [];
  const generatedInputTypeParts: string[] = [];
  if (!specification) return { inputTypes: "", scopes };

  for (const [scopeName, scopeState] of Object.entries(specification.state)) {
    const schema = (scopeState as { schema?: string }).schema ?? "";
    if (!hasValidSchema(schema)) {
      scopes.push({ name: scopeName, type: "JSONObject" });
      continue;
    }
    const rootTypeName = extractRootTypeName(schema, documentName, scopeName);
    if (!rootTypeName) {
      scopes.push({ name: scopeName, type: "JSONObject" });
      continue;
    }
    const scopeInputTypes = generateStateInputTypes(
      schema,
      new Set(allTypeNames),
    );
    if (!scopeInputTypes) {
      scopes.push({ name: scopeName, type: "JSONObject" });
      continue;
    }
    scopes.push({
      name: scopeName,
      type: `${documentName}_${rootTypeName}Input`,
    });
    generatedInputTypeParts.push(
      applyGraphQLTypePrefixes(scopeInputTypes, documentName, allTypeNames),
    );
  }

  return { inputTypes: generatedInputTypeParts.join("\n\n"), scopes };
}

/**
 * Generates a document model's subgraph schema. Pass the module so a
 * code-first model is projected from its structured definition. A
 * schema-first caller may pass the stored global state instead.
 */
export function generateDocumentModelSchema(
  source: DocumentModelModule | DocumentModelGlobalState,
  options: DocumentModelSchemaOptions = {},
): DocumentNode {
  const documentModel =
    "documentModel" in source ? source.documentModel.global : source;
  const documentName = getDocumentModelSchemaName(documentModel);
  const structured =
    "documentModel" in source ? structuredModelOf(source) : null;
  return generateModelSchema(
    structured === null
      ? storedModelProjection(documentModel, documentName)
      : structuredModelProjection(structured, documentName),
    options,
  );
}
