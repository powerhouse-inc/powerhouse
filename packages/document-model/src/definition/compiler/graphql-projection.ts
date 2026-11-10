import type {
  DocumentModelDefinition,
  DocumentModelSpecificationDefinition,
  GraphQLTypeSystemDefinitionNode,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  PackageScalarReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { compareCodeUnits } from "../kernel/primitives.js";
import { definitionNode, type Inventory, nameNode } from "./graphql-nodes.js";
import { assignStoredSegments } from "./segments.js";

type GraphQLSegment = {
  readonly root: string;
  readonly document: LocationFreeGraphQLDocumentNode;
};

export type DocumentModelGraphQLProjection = {
  readonly graphQLName: string;
  readonly global: GraphQLSegment;
  readonly local: GraphQLSegment | null;
  readonly modules: readonly {
    readonly key: string;
    readonly name: string;
    readonly operations: readonly {
      readonly key: string;
      readonly name: string;
      readonly actionType: string;
      readonly creatorKey: string;
      readonly scope: "global" | "local";
      readonly input: LocationFreeGraphQLDocumentNode | null;
    }[];
  }[];
  readonly packageScalars: readonly PackageScalarReferenceDefinition[];
};

function isPackageScalar(
  scalar: DocumentModelSpecificationDefinition["scalars"][number],
): scalar is PackageScalarReferenceDefinition {
  return scalar.implementation.startsWith("package#");
}

/**
 * Projects a specification into the GraphQL documents its stored SDL
 * segments parse to: `print(segment.document)` equals
 * `print(parse(storedSegment))` for the state schemas and each operation's
 * `schema` that `materialize` stores.
 */
export function projectDocumentModelGraphQL(
  definition: DocumentModelDefinition,
  specification: DocumentModelSpecificationDefinition,
): DocumentModelGraphQLProjection {
  const { types } = specification;
  const inventory: Inventory = new Map(types.map((type) => [type.name, type]));
  const document = (
    definitions: readonly NamedGraphQLTypeDefinition[],
  ): LocationFreeGraphQLDocumentNode => ({
    kind: "Document",
    definitions: definitions.map((type) => definitionNode(type, inventory)),
  });

  const globalRoot = specification.state.global.root.name;
  const localRoot = specification.state.local.root?.name ?? null;
  const operationKey = (moduleKey: string, key: string) =>
    `${moduleKey}/${key}`;
  const segments = assignStoredSegments({
    types,
    globalRoot,
    localRoot,
    operations: specification.modules.flatMap((module) =>
      module.operations.map((operation) => ({
        key: operationKey(module.key, operation.key),
        input: operation.input,
      })),
    ),
  });

  const packageScalars = specification.scalars.filter(isPackageScalar);
  const global = document(segments.global);
  return {
    graphQLName: definition.model.graphQLName,
    global: {
      root: globalRoot,
      document: {
        kind: "Document",
        definitions: [
          ...packageScalars
            .map(({ name }) => name)
            .sort(compareCodeUnits)
            .map((name): GraphQLTypeSystemDefinitionNode => ({
              kind: "ScalarTypeDefinition",
              name: nameNode(name),
              directives: [],
            })),
          ...global.definitions,
        ],
      },
    },
    local:
      localRoot === null
        ? null
        : { root: localRoot, document: document(segments.local) },
    modules: specification.modules.map((module) => ({
      key: module.key,
      name: module.name,
      operations: module.operations.map((operation) => ({
        key: operation.key,
        name: operation.name ?? operation.actionType,
        actionType: operation.actionType,
        creatorKey: operation.creatorKey,
        scope: operation.scope,
        input:
          operation.input === null
            ? null
            : document(
                segments.operations.get(
                  operationKey(module.key, operation.key),
                ) ?? [operation.input],
              ),
      })),
    })),
    packageScalars,
  };
}
