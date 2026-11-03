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
import { kebabCase } from "change-case";
import { childLogger } from "document-model";
import { type DefinitionNode, type DocumentNode, Kind } from "graphql";
import { gql } from "graphql-tag";
import { createHash } from "node:crypto";
import { EMPTY_DOCUMENT } from "../graphql/document-model-schema/schema-ast.js";
import {
  structuredDefinitionDigest,
  documentModelSchemaSource,
  type DocumentModelSource,
} from "../graphql/document-model-schema/source.js";
import {
  type DocumentModelSchemaOptions,
  generateModelSchema,
  getDocumentModelSchemaName,
} from "../graphql/model-schema-templates.js";
import {
  catalogResolvers,
  catalogScalarSdl,
  EMPTY_SCALAR_REGISTRY,
  registeredScalarType,
  type ScalarRegistry,
} from "./scalar-types.js";

export type { DocumentModelSource } from "../graphql/document-model-schema/source.js";
export {
  type DocumentModelSchemaOptions,
  getDocumentModelSchemaName,
} from "../graphql/model-schema-templates.js";

const logger = childLogger(["reactor-api", "create-schema"]);

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

export type SubgraphSchemaOptions = {
  /**
   * Types the subgraph's own schema generator emits, as a document model's
   * subgraph has. These may repeat a generated definition, which is kept.
   */
  ownTypeNames?: ReadonlySet<string>;
} & (
  | {
      /** Generated types already built for `documentModels`, with their scalars. */
      generated?: GeneratedDocumentModelTypes;
      scalars?: never;
    }
  | { generated?: never; scalars?: ScalarRegistry }
);

export const buildSubgraphSchemaModule = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
  options: SubgraphSchemaOptions = {},
): GraphQLSchemaModule => {
  const generated =
    options.generated ??
    getGeneratedDocumentModelTypes(documentModels, undefined, options.scalars);
  const newResolvers = {
    ...catalogResolvers,
    ...Object.fromEntries(
      Array.from(generated.scalars, ([name, { definition }]) => [
        name,
        registeredScalarType(definition),
      ]),
    ),
    ...resolvers,
    JSONObject: catalogResolvers.JSONObject,
    Unknown: catalogResolvers.Unknown,
  };

  return {
    typeDefs: assembleSubgraphTypeDefs(
      generated,
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

/** The name the model's own subgraph registers under. */
export function getDocumentModelSubgraphName(
  documentModel: DocumentModelGlobalState,
): string {
  return kebabCase(documentModel.name);
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
  scalars: ScalarRegistry;
};

/** The definitions `documentModel` adds to the generated schema. */
function documentModelDefinitions(
  documentModel: DocumentModelSource,
): readonly DefinitionNode[] {
  return documentModelSchemaSource(documentModel).modelDefinitions();
}

function sourceOf(
  documentModel: DocumentModelSource | DocumentModelGlobalState,
): DocumentModelSource {
  return "documentModel" in documentModel
    ? documentModel
    : { documentModel: { global: documentModel } };
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
  documentModel: DocumentModelSource,
  reserved: ReservedTypeNames,
  definitions: readonly DefinitionNode[] = documentModelDefinitions(
    documentModel,
  ),
): string[] {
  const generated = addScalarFlags(definitions, new Map());
  return Array.from(generated)
    .filter(
      ([name, scalar]) => reserved.has(name) && !(scalar && reserved.get(name)),
    )
    .map(([name]) => name);
}

const CATALOG_SCALARS = gql`
  ${catalogScalarSdl}
`.definitions;

const HOST_TYPES = gql`
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

/**
 * A federation gateway composes this SDL, not the schema built from it, so the
 * description is declared here as well as on the resolver.
 */
function generatedHead(scalars: ScalarRegistry): readonly DefinitionNode[] {
  return [
    ...CATALOG_SCALARS,
    ...Array.from(scalars, ([name, { definition }]): DefinitionNode => ({
      kind: Kind.SCALAR_TYPE_DEFINITION,
      name: { kind: Kind.NAME, value: name },
      description:
        definition.description === undefined
          ? undefined
          : {
              kind: Kind.STRING,
              value: definition.description,
              block: true,
            },
    })),
    ...HOST_TYPES,
  ];
}

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
  documentModels: readonly DocumentModelSource[],
  schemas?: ReadonlyMap<DocumentModelSource, DocumentModelSchema>,
  scalars: ScalarRegistry = EMPTY_SCALAR_REGISTRY,
): GeneratedDocumentModelTypes {
  return generatedTypesFrom(
    documentModels.map((model) => ({
      model,
      generated: schemas?.get(model)?.generated,
    })),
    scalars,
  );
}

/** {@link getGeneratedDocumentModelTypes} from the models' global states. */
export function generatedTypesOf(
  documentModels: readonly DocumentModelGlobalState[],
): GeneratedDocumentModelTypes {
  return generatedTypesFrom(
    documentModels.map((global) => ({ model: sourceOf(global) })),
    EMPTY_SCALAR_REGISTRY,
  );
}

function generatedTypesFrom(
  documentModels: readonly {
    model: DocumentModelSource;
    generated?: readonly DefinitionNode[];
  }[],
  scalars: ScalarRegistry,
): GeneratedDocumentModelTypes {
  const modelDefinitions: DefinitionNode[] = [];
  const addedDocumentModels = new Set<string>();
  documentModels.forEach(({ model, generated }) => {
    const dmSchemaName = getDocumentModelSchemaName(model.documentModel.global);
    if (addedDocumentModels.has(dmSchemaName)) {
      logger.debug(
        `Skipping document model with duplicate name: ${dmSchemaName}`,
      );
      return;
    }
    addedDocumentModels.add(dmSchemaName);
    modelDefinitions.push(...(generated ?? documentModelDefinitions(model)));
  });

  const definitions = dedupeTypeDefinitions([
    ...generatedHead(scalars),
    ...modelDefinitions,
    ...GENERATED_TAIL,
  ]);
  const names = new Set(
    definitions.map(typeDefinitionName).filter((name) => name !== undefined),
  );
  return { definitions, names, scalars };
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

/** Whether any operation of the latest specification has a schema. */
export function hasOperationSchemas(
  documentModel: DocumentModelSource | DocumentModelGlobalState,
) {
  return documentModelSchemaSource(
    sourceOf(documentModel),
  ).hasOperationSchemas();
}

/** The types of a document model's own subgraph. */
export function documentModelSubgraphTypes(
  documentModel: DocumentModelSource | DocumentModelGlobalState,
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
  documentModel: DocumentModelSource,
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
  documentModel: DocumentModelSource,
  options: { subgraph?: boolean } = {},
): DocumentModelSchema {
  const generated = documentModelDefinitions(documentModel);
  if (options.subgraph === false || !hasOperationSchemas(documentModel)) {
    checkBuilds(documentModel, generated);
    return { generated };
  }
  try {
    const subgraph = documentModelSubgraphTypes(documentModel);
    checkBuilds(documentModel, generated, subgraph);
    return { generated, subgraph };
  } catch (error) {
    checkBuilds(documentModel, generated);
    return { generated, subgraphError: toError(error) };
  }
}

/** A document model's schema, or why it is unusable, under its source key. */
export type ResolvedDocumentModelSchema<
  T extends DocumentModelSource = DocumentModelModule,
> = {
  model: T;
  key: string;
} & (
  | { schema: DocumentModelSchema; error?: undefined }
  | { schema?: undefined; error: Error }
);

/** Hash of everything {@link buildDocumentModelSchema} reads. */
function schemaSourceKey(documentModel: DocumentModelSource): string {
  const { name, specifications } = documentModel.documentModel.global;
  const hash = createHash("sha256").update(
    JSON.stringify([name, specifications.at(-1)]),
  );
  const definition = structuredDefinitionDigest(documentModel);
  if (definition !== null) hash.update(definition);
  return hash.digest("base64");
}

/** Schemas and failures by source hash, for the last resolve's models only. */
export class DocumentModelSchemaCache<
  T extends DocumentModelSource = DocumentModelModule,
> {
  #entries = new Map<string, DocumentModelSchema | Error>();
  readonly #build: (documentModel: T) => DocumentModelSchema;

  constructor(
    build: (documentModel: T) => DocumentModelSchema = buildDocumentModelSchema,
  ) {
    this.#build = build;
  }

  resolve(documentModels: readonly T[]): ResolvedDocumentModelSchema<T>[] {
    const entries = new Map<string, DocumentModelSchema | Error>();
    const resolved = documentModels.map(
      (model): ResolvedDocumentModelSchema<T> => {
        let key: string;
        let entry: DocumentModelSchema | Error | undefined;
        try {
          key = schemaSourceKey(model);
          entry = entries.get(key) ?? this.#entries.get(key);
        } catch (error) {
          key = `unkeyed:${model.documentModel.global.id}`;
          entry = toError(error);
        }
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
  generated: Pick<GeneratedDocumentModelTypes, "names">,
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
 * Generate a GraphQL schema for a document model.
 *
 * @param documentModel - The document model global state
 * @param options - Schema generation options
 * @returns GraphQL DocumentNode
 */
export function generateDocumentModelSchema(
  documentModel: DocumentModelSource | DocumentModelGlobalState,
  options: DocumentModelSchemaOptions = {},
): DocumentNode {
  return generateModelSchema(
    documentModelSchemaSource(sourceOf(documentModel)).modelProjection(),
    options,
  );
}
