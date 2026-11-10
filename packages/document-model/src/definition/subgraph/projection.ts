import type {
  GraphQLTypeSystemDefinitionNode,
  LocationFreeGraphQLDocumentNode,
  ObjectTypeDefinition,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import {
  definitionNode,
  type Inventory,
  nameNode,
} from "../compiler/graphql-nodes.js";

type TypedSubgraphDefinition = SubgraphDefinition & {
  readonly schemaKind: "typed";
};

export const ROOT_TYPES = {
  query: "Query",
  mutation: "Mutation",
  subscription: "Subscription",
} as const;

export function subgraphRootTypes(
  definition: Pick<TypedSubgraphDefinition, "entries">,
): readonly ObjectTypeDefinition[] {
  return (["query", "mutation", "subscription"] as const).flatMap((kind) => {
    const fields = definition.entries.flatMap((entry) =>
      entry.kind === kind
        ? [
            {
              key: entry.key,
              name: entry.fieldName,
              description: entry.description,
              deprecated: entry.deprecated,
              args: entry.args,
              type: entry.returns,
            },
          ]
        : [],
    );
    return fields.length === 0
      ? []
      : [
          {
            kind: "object" as const,
            name: ROOT_TYPES[kind],
            description: null,
            fields,
          },
        ];
  });
}

/**
 * @experimental The GraphQL document a subgraph definition serves, without
 * locations, in the definition's print order. A typed definition declares
 * the catalog and project scalars it uses as `scalar` definitions.
 */
export function projectSubgraphGraphQL(
  definition: SubgraphDefinition,
): LocationFreeGraphQLDocumentNode {
  if (definition.schemaKind === "graphql-ast-compat") {
    return definition.document;
  }
  const roots = subgraphRootTypes(definition);
  const inventory: Inventory = new Map(
    [...definition.types, ...roots].map((type) => [type.name, type]),
  );
  const scalars = new Set(definition.scalars.map(({ name }) => name));
  return {
    kind: "Document",
    definitions: definition.definitionOrder.flatMap(
      (name): GraphQLTypeSystemDefinitionNode[] => {
        if (scalars.has(name)) {
          return [
            {
              kind: "ScalarTypeDefinition",
              name: nameNode(name),
              directives: [],
            },
          ];
        }
        const type = inventory.get(name);
        if (type === undefined) {
          throw new TypeError(
            `definitionOrder names ${name}, which the subgraph definition does not declare.`,
          );
        }
        return [definitionNode(type, inventory)];
      },
    ),
  };
}
