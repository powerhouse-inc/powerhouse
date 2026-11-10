import type { SubgraphEntry, SubgraphEntryBuilders } from "document-model";
import type { GraphQLResolveInfo } from "graphql";
import type { Context } from "../types.js";

/**
 * @experimental The builders `Subgraph.getSchema` receives. `TSubgraph` is
 * the class whose instance a resolver's `subgraph` parameter is.
 */
export type SchemaBuilder<TSubgraph> = SubgraphEntryBuilders<
  TSubgraph,
  Context,
  GraphQLResolveInfo
>;

/**
 * @experimental An entry `getSchema` returns. An entry built for a subclass
 * is assignable to the base's `SubgraphSchemaEntry<never>`.
 */
export type SubgraphSchemaEntry<TSubgraph> = SubgraphEntry<
  TSubgraph,
  Context,
  GraphQLResolveInfo
>;
