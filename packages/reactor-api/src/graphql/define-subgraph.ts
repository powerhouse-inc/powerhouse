import type { SubgraphDefinitionV1 } from "@powerhousedao/shared/document-model";
import {
  createSubgraphDefiner,
  type SubgraphConfig as HostAgnosticSubgraphConfig,
} from "document-model/internal/subgraph";
import type {
  DocumentNode,
  GraphQLAbstractType,
  GraphQLResolveInfo,
} from "graphql";
import { BaseSubgraph } from "./base-subgraph.js";
import type { Context, SubgraphArgs } from "./types.js";

export type SubgraphConfig<TRequest extends Context = Context> =
  HostAgnosticSubgraphConfig<
    TRequest,
    BaseSubgraph,
    DocumentNode,
    GraphQLResolveInfo,
    GraphQLAbstractType
  >;

export type DefinedSubgraph = typeof BaseSubgraph & {
  readonly definition: SubgraphDefinitionV1;
};

const defineBoundSubgraph = createSubgraphDefiner<
  SubgraphArgs,
  Context,
  DocumentNode,
  GraphQLResolveInfo,
  GraphQLAbstractType,
  BaseSubgraph,
  typeof BaseSubgraph
>(BaseSubgraph);

export const defineSubgraph = defineBoundSubgraph as <
  TRequest extends Context = Context,
>(
  config: SubgraphConfig<TRequest>,
) => DefinedSubgraph;
