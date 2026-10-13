import {
  buildSubgraphSchema,
  type GraphQLResolverMap,
  type GraphQLSchemaModule,
} from "@apollo/subgraph";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/document-engineering/graphql";
import type { Context } from "@powerhousedao/reactor-api";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { camelCase, pascalCase } from "change-case";
import { childLogger } from "document-model";
import {
  type ASTNode,
  type DefinitionNode,
  type DocumentNode,
  Kind,
  Lexer,
  type NameNode,
  parse,
  print,
  Source,
  TokenKind,
  visit,
} from "graphql";
import { gql } from "graphql-tag";
import { GraphQLJSON, GraphQLJSONObject } from "graphql-type-json";
import { createHash } from "node:crypto";

const logger = childLogger(["reactor-api", "create-schema"]);

/**
 * Revision type - matches the definition in reactor/schema.graphql.
 * Used by PHDocument and document mutation results.
 */
const RevisionType = `
  type Revision {
    scope: String!
    revision: Int!
  }
`;

/**
 * A subgraph defines a type whose name the generated document-model schema
 * owns, so one of the two definitions would be lost.
 */
export class SubgraphTypeCollisionError extends Error {
  readonly typeNames: string[];

  constructor(typeNames: string[]) {
    super(
      `Subgraph defines types reserved by the document-model schema: ${typeNames.join(", ")}`,
    );
    this.name = "SubgraphTypeCollisionError";
    this.typeNames = typeNames;
  }
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
const dedupeTypeDefinitions = (
  definitions: readonly DefinitionNode[],
  seen = new Set<string>(),
): DefinitionNode[] =>
  definitions.filter((def) => {
    const name = typeDefinitionName(def);
    if (name === undefined) return true;
    if (seen.has(name)) {
      // A duplicate here would otherwise crash supergraph composition; log it so
      // production has a breadcrumb of which model shipped a duplicate name.
      logger.debug(`Dropping duplicate type definition: ${name}`);
      return false;
    }
    seen.add(name);
    return true;
  });

function typeDefinitionName(def: DefinitionNode): string | undefined {
  if (!TYPE_DEFINITION_KINDS.has(def.kind)) return undefined;
  return (def as { name?: { value: string } }).name?.value;
}

const EMPTY_DOCUMENT: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

const OUTPUT_TYPE_KINDS = [
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.OBJECT_TYPE_EXTENSION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.ENUM_TYPE_EXTENSION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.UNION_TYPE_EXTENSION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_EXTENSION,
];

// Kinds whose names get prefixed: state schemas (inputs stripped) and operation schemas.
const STATE_PREFIX_KINDS = new Set<Kind>(OUTPUT_TYPE_KINDS);
const ALL_PREFIX_KINDS = new Set<Kind>([
  ...OUTPUT_TYPE_KINDS,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
]);

// Nodes whose `name` is a type name: definitions, extensions and references.
const TYPE_NAME_KINDS = new Set<Kind>([
  ...ALL_PREFIX_KINDS,
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_EXTENSION,
  Kind.NAMED_TYPE,
]);

// Stub local state types dropped from legacy models.
const LOCAL_STATE_STUBS = new Set([
  "AccountSnapshotLocalState",
  "BudgetStatementLocalState",
  "ScopeFrameworkLocalState",
]);

/** Parse SDL; blank or comment-only input yields an empty document. */
function parseSdl(sdl: string): DocumentNode {
  const source = new Source(sdl);
  if (new Lexer(source).advance().kind === TokenKind.EOF) return EMPTY_DOCUMENT;
  try {
    return parse(source, { noLocation: true });
  } catch (error) {
    // Retry without stray semicolons, which GraphQL rejects.
    const withoutSemicolons = sdl.replaceAll(";", "");
    if (withoutSemicolons === sdl) throw error;
    return parse(withoutSemicolons, { noLocation: true });
  }
}

function definedTypeNames(
  doc: DocumentNode,
  kinds: ReadonlySet<Kind>,
): string[] {
  return doc.definitions
    .filter((def) => kinds.has(def.kind))
    .map((def) => (def as DefinitionNode & { name: NameNode }).name.value);
}

/** Prefix type definition names and type references found in `names`. */
function prefixTypeNames(
  doc: DocumentNode,
  prefix: string,
  names: ReadonlySet<string>,
): DocumentNode {
  return visit(doc, {
    enter(node: ASTNode) {
      if (!TYPE_NAME_KINDS.has(node.kind)) return undefined;
      const { name } = node as ASTNode & { name: NameNode };
      if (!names.has(name.value)) return undefined;
      return { ...node, name: { ...name, value: `${prefix}_${name.value}` } };
    },
  });
}

/** State schema definitions without inputs, `DateTime` or the given object types. */
function stateTypeDefinitions(
  sdl: string,
  droppedObjectTypes: ReadonlySet<string> = new Set(),
): DefinitionNode[] {
  return parseSdl(sdl).definitions.filter(
    (def) =>
      def.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.INPUT_OBJECT_TYPE_EXTENSION &&
      !(
        def.kind === Kind.SCALAR_TYPE_DEFINITION &&
        def.name.value === "DateTime"
      ) &&
      !(
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        droppedObjectTypes.has(def.name.value)
      ),
  );
}

/**
 * Prefixed operation schemas per module. The first definition of each module
 * carries a "Module: <Name>" description unless it has its own.
 */
function buildModuleSchemas(
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  documentName: string,
  allTypeNames: string[],
  hasValidSchema: (schema: string | null | undefined) => boolean,
): string {
  const names = new Set(allTypeNames);
  return (
    specification?.modules
      .map((module) => {
        const definitions = module.operations
          .filter((op) => hasValidSchema(op.schema))
          .flatMap((op) => {
            const doc = parseSdl(op.schema ?? "");
            const opNames = new Set([
              ...names,
              ...definedTypeNames(doc, ALL_PREFIX_KINDS),
            ]);
            return prefixTypeNames(doc, documentName, opNames).definitions;
          });
        if (definitions.length === 0) return "";
        const [first, ...rest] = definitions;
        const header =
          "description" in first && !first.description
            ? {
                ...first,
                description: {
                  kind: Kind.STRING,
                  value: `Module: ${pascalCase(module.name)}`,
                  block: true,
                },
              }
            : first;
        return print({
          kind: Kind.DOCUMENT,
          definitions: [header as DefinitionNode, ...rest],
        });
      })
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

export type SubgraphSchemaOptions = {
  /**
   * Types the subgraph's own schema generator emits, as a document model's
   * subgraph has. These may repeat a generated definition, which is kept.
   */
  ownTypeNames?: ReadonlySet<string>;
  /** Generated types already built for `documentModels`. */
  generated?: GeneratedDocumentModelTypes;
};

export const buildSubgraphSchemaModule = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
  options: SubgraphSchemaOptions = {},
): GraphQLSchemaModule => {
  const newResolvers = {
    ...resolvers,
    JSONObject: GraphQLJSONObject,
    Unknown: GraphQLJSON,
  };

  return {
    typeDefs: assembleSubgraphTypeDefs(
      options.generated ?? getGeneratedDocumentModelTypes(documentModels),
      typeDefs,
      options.ownTypeNames,
    ),
    resolvers: newResolvers,
  };
};
export const createSchema = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
  options: SubgraphSchemaOptions = {},
) => {
  // Array form: @apollo/subgraph 2.15 dropped the bare-module overload.
  return buildSubgraphSchema([
    buildSubgraphSchemaModule(documentModels, resolvers, typeDefs, options),
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

export function getDocumentModelSchemaName(
  documentModel: DocumentModelGlobalState,
) {
  return pascalCase(documentModel.name.replaceAll("/", " "));
}

/**
 * The generated document-model types followed by the subgraph's own. Throws
 * {@link SubgraphTypeCollisionError} when the subgraph defines a generated
 * name not in `ownTypeNames`.
 */
export const getDocumentModelTypeDefs = (
  documentModels: DocumentModelModule[],
  typeDefs: DocumentNode,
  ownTypeNames?: ReadonlySet<string>,
): DocumentNode =>
  assembleSubgraphTypeDefs(
    getGeneratedDocumentModelTypes(documentModels),
    typeDefs,
    ownTypeNames,
  );

/** Names of the type definitions in `doc`. */
export function typeDefinitionNames(doc: DocumentNode): Set<string> {
  return new Set(
    doc.definitions
      .map(typeDefinitionName)
      .filter((name) => name !== undefined),
  );
}

/** The generated document-model schema every subgraph is assembled onto. */
export type GeneratedDocumentModelTypes = {
  definitions: readonly DefinitionNode[];
  names: ReadonlySet<string>;
};

/** The definitions `documentModel` adds to the generated schema. */
function documentModelDefinitions(
  documentModel: DocumentModelGlobalState,
): DefinitionNode[] {
  const dmSchemaName = getDocumentModelSchemaName(documentModel);
  // Use only the latest specification to avoid duplicate type definitions
  // when a document model has multiple versions (e.g. v1, v2).
  const latestSpec = documentModel.specifications.at(-1);
  const globalSchema = latestSpec?.state.global.schema ?? "";
  const localSchema = latestSpec?.state.local.schema ?? "";
  const definitions = [
    ...stateTypeDefinitions(globalSchema),
    ...stateTypeDefinitions(localSchema, LOCAL_STATE_STUBS),
  ];
  const stateDoc: DocumentNode = { kind: Kind.DOCUMENT, definitions };
  const prefixed = prefixTypeNames(
    stateDoc,
    dmSchemaName,
    new Set(definedTypeNames(stateDoc, STATE_PREFIX_KINDS)),
  );
  const documentType = parseSdl(`
    type ${dmSchemaName} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              createdAtUtcIso: DateTime!
              lastModifiedAtUtcIso: DateTime!
              ${dmSchemaName !== "DocumentModel" ? `initialState: ${dmSchemaName}_${dmSchemaName}State!` : ""}
              ${dmSchemaName !== "DocumentModel" ? `state: ${dmSchemaName}_${dmSchemaName}State!` : ""}
              stateJSON: JSONObject
          }`);
  return [...prefixed.definitions, ...documentType.definitions];
}

/** Type name → whether every definition of that name is a scalar. */
export type ReservedTypeNames = ReadonlyMap<string, boolean>;

function addScalarFlags(
  definitions: readonly DefinitionNode[],
  into: Map<string, boolean>,
): Map<string, boolean> {
  for (const def of definitions) {
    const name = typeDefinitionName(def);
    if (name === undefined) continue;
    const scalar = def.kind === Kind.SCALAR_TYPE_DEFINITION;
    into.set(name, scalar && (into.get(name) ?? true));
  }
  return into;
}

let fixedGeneratedTypes: ReservedTypeNames | undefined;

/**
 * Type names no document model may generate: the root types, the generated
 * types every schema carries, and the types of `coreTypeDefs`.
 */
export function reservedTypeNames(
  coreTypeDefs: Iterable<DocumentNode>,
): ReservedTypeNames {
  fixedGeneratedTypes ??= addScalarFlags(
    getGeneratedDocumentModelTypes([]).definitions,
    new Map(),
  );
  const reserved = new Map([
    ["Query", false],
    ["Mutation", false],
    ["Subscription", false],
    ...fixedGeneratedTypes,
  ]);
  for (const typeDefs of coreTypeDefs) {
    addScalarFlags(typeDefs.definitions, reserved);
  }
  return reserved;
}

/**
 * The reserved names `documentModel`'s generated types take. A scalar may
 * repeat a reserved scalar: the duplicate is dropped on assembly.
 */
export function reservedTypeNamesTaken(
  documentModel: DocumentModelModule,
  reserved: ReservedTypeNames,
  definitions: readonly DefinitionNode[] = documentModelDefinitions(
    documentModel.documentModel.global,
  ),
): string[] {
  const generated = addScalarFlags(definitions, new Map());
  return Array.from(generated)
    .filter(
      ([name, scalar]) => reserved.has(name) && !(scalar && reserved.get(name)),
    )
    .map(([name]) => name);
}

// The generated schema around the document models' definitions.
const GENERATED_HEAD = gql`
  scalar JSONObject
  scalar AttachmentRef
  # Codegen scalars not in the document-engineering set.
  scalar Unknown
  scalar Address
  ${scalarsTypeDefs.join("\n").replaceAll(";", "")}

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
`.definitions;

const GENERATED_TAIL = gql`
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
`.definitions;

/**
 * The generated schema for `documentModels`. `schemas` supplies models'
 * definitions already built; the others are built here.
 */
export function getGeneratedDocumentModelTypes(
  documentModels: DocumentModelModule[],
  schemas?: ReadonlyMap<DocumentModelModule, DocumentModelSchema>,
): GeneratedDocumentModelTypes {
  const modelDefinitions: DefinitionNode[] = [];
  const addedDocumentModels = new Set<string>();
  documentModels.forEach((model) => {
    const global = model.documentModel.global;
    const dmSchemaName = getDocumentModelSchemaName(global);
    if (addedDocumentModels.has(dmSchemaName)) {
      logger.debug(
        `Skipping document model with duplicate name: ${dmSchemaName}`,
      );
      return;
    }
    addedDocumentModels.add(dmSchemaName);
    modelDefinitions.push(
      ...(schemas?.get(model)?.generated ?? documentModelDefinitions(global)),
    );
  });

  const definitions = dedupeTypeDefinitions([
    ...GENERATED_HEAD,
    ...modelDefinitions,
    ...GENERATED_TAIL,
  ]);
  const names = new Set(
    definitions.map(typeDefinitionName).filter((name) => name !== undefined),
  );
  return { definitions, names };
}

/** What a document model contributes to the GraphQL schema. */
export type DocumentModelSchema = {
  /** Its definitions in the generated schema every subgraph carries. */
  generated: readonly DefinitionNode[];
  /** Its own subgraph's types, when it has operations to serve. */
  subgraph?: { typeDefs: DocumentNode; typeNames: ReadonlySet<string> };
  /** Why its own subgraph cannot be served; its generated types still can. */
  subgraphError?: Error;
};

const hasValidSchema = (schema: string | null | undefined): boolean =>
  !!(schema && /\b(input|type|enum|union|interface)\s+\w+/.test(schema));

/** Whether any operation of the latest specification has a schema. */
export function hasOperationSchemas(documentModel: DocumentModelModule) {
  const specification =
    documentModel.documentModel.global.specifications.at(-1);
  if (!specification) return false;
  return specification.modules.some((module) =>
    module.operations.some((op) => hasValidSchema(op.schema)),
  );
}

/** The types of a document model's own subgraph. */
export function documentModelSubgraphTypes(
  documentModel: DocumentModelGlobalState,
): { typeDefs: DocumentNode; typeNames: ReadonlySet<string> } {
  const typeDefs = generateDocumentModelSchema(documentModel, {
    useNewApi: true,
  });
  return { typeDefs, typeNames: typeDefinitionNames(typeDefs) };
}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/** Build `subgraph` over the generated types of `documentModel` alone. */
function checkBuilds(
  documentModel: DocumentModelModule,
  generated: readonly DefinitionNode[],
  subgraph?: DocumentModelSchema["subgraph"],
): void {
  buildSubgraphSchema([
    {
      typeDefs: assembleSubgraphTypeDefs(
        getGeneratedDocumentModelTypes(
          [documentModel],
          new Map([[documentModel, { generated }]]),
        ),
        subgraph?.typeDefs ?? EMPTY_DOCUMENT,
        subgraph?.typeNames,
      ),
    },
  ]);
}

/** Throws when the generated types every subgraph carries do not build. */
export function buildDocumentModelSchema(
  documentModel: DocumentModelModule,
  options: { subgraph?: boolean } = {},
): DocumentModelSchema {
  const generated = documentModelDefinitions(
    documentModel.documentModel.global,
  );
  if (options.subgraph === false || !hasOperationSchemas(documentModel)) {
    checkBuilds(documentModel, generated);
    return { generated };
  }
  try {
    const subgraph = documentModelSubgraphTypes(
      documentModel.documentModel.global,
    );
    checkBuilds(documentModel, generated, subgraph);
    return { generated, subgraph };
  } catch (error) {
    checkBuilds(documentModel, generated);
    return { generated, subgraphError: toError(error) };
  }
}

/** A document model's schema, or why it is unusable, under its source key. */
export type ResolvedDocumentModelSchema = {
  model: DocumentModelModule;
  key: string;
} & (
  | { schema: DocumentModelSchema; error?: undefined }
  | { schema?: undefined; error: Error }
);

/** Hash of everything {@link buildDocumentModelSchema} reads. */
function schemaSourceKey(documentModel: DocumentModelModule): string {
  const { name, specifications } = documentModel.documentModel.global;
  return createHash("sha256")
    .update(JSON.stringify([name, specifications.at(-1)]))
    .digest("base64");
}

/** Schemas and failures by source hash, for the last resolve's models only. */
export class DocumentModelSchemaCache {
  #entries = new Map<string, DocumentModelSchema | Error>();
  readonly #build: (documentModel: DocumentModelModule) => DocumentModelSchema;

  constructor(build = buildDocumentModelSchema) {
    this.#build = build;
  }

  resolve(
    documentModels: readonly DocumentModelModule[],
  ): ResolvedDocumentModelSchema[] {
    const entries = new Map<string, DocumentModelSchema | Error>();
    const resolved = documentModels.map(
      (model): ResolvedDocumentModelSchema => {
        const key = schemaSourceKey(model);
        let entry = entries.get(key) ?? this.#entries.get(key);
        if (entry === undefined) {
          try {
            entry = this.#build(model);
          } catch (error) {
            entry = toError(error);
          }
        }
        entries.set(key, entry);
        return entry instanceof Error
          ? { model, key, error: entry }
          : { model, key, schema: entry };
      },
    );
    this.#entries = entries;
    return resolved;
  }
}

/**
 * Names of the generated types `typeDefs` redefines, other than those a
 * model's own subgraph may repeat. Scalars are dropped on assembly, so they
 * never collide.
 */
export function findSubgraphTypeCollisions(
  generated: GeneratedDocumentModelTypes,
  typeDefs: DocumentNode,
  ownTypeNames?: ReadonlySet<string>,
): string[] {
  const collisions: string[] = [];
  for (const def of typeDefs.definitions) {
    if (def.kind === Kind.SCALAR_TYPE_DEFINITION) continue;
    const name = typeDefinitionName(def);
    if (name === undefined || !generated.names.has(name)) continue;
    if (ownTypeNames?.has(name)) continue;
    collisions.push(name);
  }
  return collisions;
}

/** Throws {@link SubgraphTypeCollisionError}; see {@link getDocumentModelTypeDefs}. */
export function assembleSubgraphTypeDefs(
  generated: GeneratedDocumentModelTypes,
  typeDefs: DocumentNode,
  ownTypeNames?: ReadonlySet<string>,
): DocumentNode {
  const collisions = findSubgraphTypeCollisions(
    generated,
    typeDefs,
    ownTypeNames,
  );
  if (collisions.length > 0) {
    throw new SubgraphTypeCollisionError(collisions);
  }
  const subgraphDefinitions = typeDefs.definitions.filter(
    (def) => def.kind !== Kind.SCALAR_TYPE_DEFINITION,
  );

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      ...generated.definitions,
      ...dedupeTypeDefinitions(subgraphDefinitions, new Set(generated.names)),
    ],
  };
}

/**
 * Extract the names of types defined in a GraphQL schema.
 * Unparseable schemas yield no names.
 */
function extractTypeNames(schema: string): string[] {
  try {
    return definedTypeNames(parseSdl(schema), ALL_PREFIX_KINDS);
  } catch (error) {
    logger.debug(`Skipping unparseable schema: ${String(error)}`);
    return [];
  }
}

/**
 * Print the input type definitions of a GraphQL schema.
 * @param excludeTypeNames - Input type names to leave out
 */
function extractInputTypeDefinitions(
  schema: string,
  excludeTypeNames: Set<string> = new Set(),
): string {
  const definitions = parseSdl(schema).definitions.filter(
    (def) =>
      def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      !excludeTypeNames.has(def.name.value),
  );
  if (definitions.length === 0) return "";
  return print({ kind: Kind.DOCUMENT, definitions });
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

  const doc = parseSdl(schema);
  const names = new Set([
    ...definedTypeNames(doc, ALL_PREFIX_KINDS),
    ...externalTypeNames,
  ]);
  if (names.size === 0) return schema;
  return print(prefixTypeNames(doc, prefix, names));
}

/**
 * Options for generating document model GraphQL schemas.
 */
export interface DocumentModelSchemaOptions {
  /**
   * When true, generates new API patterns:
   * - Mutations return full document objects (MutationResult type)
   * - Adds createEmptyDocument mutation
   * - Makes docId and input parameters required
   * @default false
   */
  useNewApi?: boolean;
}

/**
 * Generate a GraphQL schema for a document model.
 *
 * @param documentModel - The document model global state
 * @param options - Schema generation options
 * @returns GraphQL DocumentNode
 */
export function generateDocumentModelSchema(
  documentModel: DocumentModelGlobalState,
  options: DocumentModelSchemaOptions = {},
): DocumentNode {
  const { useNewApi = false } = options;

  const specification = documentModel.specifications.at(-1);
  const documentName = getDocumentModelSchemaName(documentModel);
  const globalStateSchema = specification?.state.global.schema;
  const localStateSchema = specification?.state.local.schema;
  const globalStateTypeNames = extractTypeNames(globalStateSchema ?? "");
  const localStateTypeNames = extractTypeNames(localStateSchema ?? "");
  const stateTypeNames = [...globalStateTypeNames, ...localStateTypeNames];

  // Collect ALL type names from all operations' schemas
  const allOperationTypeNames =
    specification?.modules.flatMap((module) =>
      module.operations.flatMap((op) => extractTypeNames(op.schema ?? "")),
    ) ?? [];

  // Combine state types and all operation types for prefixing
  const allTypeNames = [
    ...new Set([...stateTypeNames, ...allOperationTypeNames]),
  ];

  // Extract input type definitions from state schema, excluding operation-specific inputs
  // (those are already defined in op.schema)
  const operationInputTypeNames = new Set(allOperationTypeNames);
  const stateInputTypes = extractInputTypeDefinitions(
    globalStateSchema ?? "",
    operationInputTypeNames,
  );
  const prefixedStateInputTypes = applyGraphQLTypePrefixes(
    stateInputTypes,
    documentName,
    allTypeNames,
  );

  if (useNewApi) {
    // New API: flat queries, typed state, async mutations
    return generateNewApiSchema(
      documentName,
      specification,
      prefixedStateInputTypes,
      allTypeNames,
      hasValidSchema,
    );
  }

  // Legacy API
  return generateLegacyApiSchema(
    documentName,
    specification,
    prefixedStateInputTypes,
    allTypeNames,
    hasValidSchema,
  );
}

/**
 * Generate legacy API schema with nested queries
 */
function generateLegacyApiSchema(
  documentName: string,
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  prefixedStateInputTypes: string,
  allTypeNames: string[],
  hasValidSchema: (schema: string | null | undefined) => boolean,
): DocumentNode {
  const createDocumentMutation = `${documentName}_createDocument(name:String!, driveId:String): String`;

  const operationMutations =
    specification?.modules
      .flatMap((module) =>
        module.operations
          .filter((op) => op.name && hasValidSchema(op.schema))
          .map(
            (op) =>
              `${documentName}_${camelCase(op.name!)}(
            driveId: String, docId: PHID, input: ${documentName}_${pascalCase(op.name!)}Input): Int`,
          ),
      )
      .join("\n        ") ?? "";

  const moduleSchemas = buildModuleSchemas(
    specification,
    documentName,
    allTypeNames,
    hasValidSchema,
  );

  return gql`
    """
    Queries: ${documentName} Document
    """

    type ${documentName}Queries {
        getDocument(docId: PHID!, driveId: PHID): ${documentName}
        getDocuments(driveId: String!): [${documentName}!]
    }

    type Query {
        ${documentName}: ${documentName}Queries
    }

    """
    Mutations: ${documentName}
    """
    type Mutation {
        ${createDocumentMutation}

        ${operationMutations}
    }

    ${
      prefixedStateInputTypes
        ? `"""
    Input Types from State Schema
    """
    ${prefixedStateInputTypes}`
        : ""
    }

    ${moduleSchemas}`;
}

/**
 * Generate new API schema with flat queries, typed state, and async mutations.
 * Note: State schema types are NOT included here because they are already defined
 * in getDocumentModelTypeDefs() which is used during schema composition.
 * Including them here would cause duplicate type definitions.
 */
function generateNewApiSchema(
  documentName: string,
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  prefixedStateInputTypes: string,
  allTypeNames: string[],
  hasValidSchema: (schema: string | null | undefined) => boolean,
): DocumentNode {
  // Use full state type for all document models
  const stateType = `${documentName}_FullState!`;

  // Shared base types for document state structure (same for all document types)
  const sharedBaseTypes = `
    """Hash configuration for document state"""
    type ${documentName}_PHHashConfig {
      algorithm: String!
      encoding: String!
    }

    """Document scope state (same for all document types)"""
    type ${documentName}_PHDocumentScopeState {
      version: Int!
      hash: ${documentName}_PHHashConfig!
      isDeleted: Boolean
      deletedAtUtcIso: String
      deletedBy: String
      deletionReason: String
    }
  `;

  // Full state type with all scopes (auth, document, global, local)
  // Note: DocumentModel uses different naming convention (GlobalState suffix instead of State)
  // For local state, check if the specification defines a local state type
  const localSchema = specification?.state.local.schema ?? "";
  const hasLocalStateType = localSchema.includes(
    `type ${documentName}LocalState`,
  );

  const globalStateType =
    documentName === "DocumentModel"
      ? `${documentName}_${documentName}GlobalState!`
      : `${documentName}_${documentName}State!`;
  const localStateType = !hasLocalStateType
    ? "JSONObject!"
    : `${documentName}_${documentName}LocalState!`;

  const fullStateType = `
    """Full state with all scopes for ${documentName}"""
    type ${documentName}_FullState {
      auth: JSONObject!
      document: ${documentName}_PHDocumentScopeState!
      global: ${globalStateType}
      local: ${localStateType}
    }
  `;

  // Common input types - use extend to avoid conflicts with other subgraphs
  const commonInputTypes = `
    input ${documentName}_ViewFilterInput {
      branch: String
      scopes: [String!]
    }

    input ${documentName}_PagingInput {
      limit: Int
      offset: Int
      cursor: String
    }

    input ${documentName}_SearchFilterInput {
      parentId: String
      identifiers: [String!] @deprecated(reason: "Ignored. Filter by parentId.")
    }
  `;

  // Revision type - imported from shared-schema.ts for consistency with ReactorSubgraph
  // Must be defined in each subgraph for Apollo Federation
  const revisionType = RevisionType;

  // Result types with typed state (or JSONObject for DocumentModel)
  // The state type (${documentName}_${documentName}State) is defined in getDocumentModelTypeDefs()
  // Uses revisionsList with shared Revision type to match ReactorSubgraph pattern
  const resultTypes = `
    """
    Mutation result type for ${documentName} operations with typed state.
    Matches ReactorSubgraph PHDocument pattern with revisionsList.
    """
    type ${documentName}MutationResult {
      id: String!
      slug: String
      preferredEditor: String
      name: String!
      documentType: String!
      state: ${stateType}
      revisionsList: [Revision!]!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
    }

    """
    Document with children for ${documentName}
    """
    type ${documentName}_DocumentWithChildren {
      document: ${documentName}MutationResult!
      childIds: [String!]!
    }

    """
    Paginated result type for ${documentName} documents
    """
    type ${documentName}_DocumentResultPage {
      items: [${documentName}MutationResult!]!
      hasNextPage: Boolean!
      hasPreviousPage: Boolean!
      cursor: String
    }
  `;

  // Queries nested under ${documentName} namespace
  const queries = `
    type ${documentName}Queries {
      """Get a specific ${documentName} document by identifier"""
      document(idOrSlug: String, identifier: String @deprecated(reason: "Use idOrSlug."), view: ${documentName}_ViewFilterInput): ${documentName}_DocumentWithChildren

      """Get all ${documentName} documents (paged)"""
      documents(paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Find ${documentName} documents by search criteria"""
      findDocuments(search: ${documentName}_SearchFilterInput, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get outgoing relationships of a ${documentName} document"""
      documentOutgoingRelationships(sourceIdOrSlug: String, sourceIdentifier: String @deprecated(reason: "Use sourceIdOrSlug."), relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get incoming relationships to a ${documentName} document"""
      documentIncomingRelationships(targetIdOrSlug: String, targetIdentifier: String @deprecated(reason: "Use targetIdOrSlug."), relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
    }
  `;

  // Generate initial state input types for each scope
  let initialStateInputSchema = "";
  if (specification) {
    const scopeFields: string[] = [];
    const generatedInputTypeParts: string[] = [];

    for (const [scopeName, scopeState] of Object.entries(specification.state)) {
      const schema = (scopeState as { schema?: string }).schema ?? "";
      if (hasValidSchema(schema)) {
        const rootTypeName = extractRootTypeName(
          schema,
          documentName,
          scopeName,
        );
        if (!rootTypeName) {
          scopeFields.push(`  ${scopeName}: JSONObject`);
          continue;
        }
        const scopeInputTypes = generateStateInputTypes(
          schema,
          new Set(allTypeNames),
        );
        if (!scopeInputTypes) {
          scopeFields.push(`  ${scopeName}: JSONObject`);
          continue;
        }
        const prefixedScopeInputTypes = applyGraphQLTypePrefixes(
          scopeInputTypes,
          documentName,
          allTypeNames,
        );
        scopeFields.push(
          `  ${scopeName}: ${documentName}_${rootTypeName}Input`,
        );
        generatedInputTypeParts.push(prefixedScopeInputTypes);
      } else {
        scopeFields.push(`  ${scopeName}: JSONObject`);
      }
    }

    if (scopeFields.length > 0) {
      const inputTypeDefs = generatedInputTypeParts.join("\n\n");
      const wrapper = `input ${documentName}_InitialStateInput {\n${scopeFields.join("\n")}\n}`;
      initialStateInputSchema = inputTypeDefs
        ? `${inputTypeDefs}\n\n${wrapper}`
        : wrapper;
    }
  }

  // Mutations nested under ${documentName} namespace
  const createDocumentMutation = initialStateInputSchema
    ? `createDocument(name: String!, parentIdOrSlug: String, parentIdentifier: String @deprecated(reason: "Use parentIdOrSlug."), slug: String, preferredEditor: String, initialState: ${documentName}_InitialStateInput): ${documentName}MutationResult!`
    : `createDocument(name: String!, parentIdOrSlug: String, parentIdentifier: String @deprecated(reason: "Use parentIdOrSlug."), preferredEditor: String): ${documentName}MutationResult!`;
  const createEmptyDocumentMutation = `createEmptyDocument(parentIdOrSlug: String, parentIdentifier: String @deprecated(reason: "Use parentIdOrSlug.")): ${documentName}MutationResult!`;

  const operationMutations =
    specification?.modules
      .flatMap((module) =>
        module.operations
          .filter((op) => op.name && hasValidSchema(op.schema))
          .flatMap((op) => [
            // Sync mutation
            `${camelCase(op.name!)}(documentIdOrSlug: String, docId: PHID @deprecated(reason: "Use documentIdOrSlug."), input: ${documentName}_${pascalCase(op.name!)}Input!): ${documentName}MutationResult!`,
            // Async mutation
            `${camelCase(op.name!)}Async(documentIdOrSlug: String, docId: PHID @deprecated(reason: "Use documentIdOrSlug."), input: ${documentName}_${pascalCase(op.name!)}Input!): String!`,
          ]),
      )
      .join("\n        ") ?? "";

  const moduleSchemas = buildModuleSchemas(
    specification,
    documentName,
    allTypeNames,
    hasValidSchema,
  );

  return gql`
    scalar DateTime
    scalar JSONObject
    scalar AttachmentRef

    ${revisionType}

    ${sharedBaseTypes}

    ${fullStateType}

    ${commonInputTypes}

    ${resultTypes}

    """
    Queries: ${documentName} Document
    """
    ${queries}

    """
    Mutations: ${documentName}
    """
    type ${documentName}Mutations {
        ${createDocumentMutation}
        ${createEmptyDocumentMutation}

        ${operationMutations}
    }

    type Query {
      ${documentName}: ${documentName}Queries!
    }

    type Mutation {
      ${documentName}: ${documentName}Mutations!
    }

    ${
      prefixedStateInputTypes
        ? `"""
    Input Types from State Schema
    """
    ${prefixedStateInputTypes}`
        : ""
    }

    ${
      initialStateInputSchema
        ? `"""
    Input Types for Initial State
    """
    ${initialStateInputSchema}`
        : ""
    }

    ${moduleSchemas}`;
}
