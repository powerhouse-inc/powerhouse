import type { GraphQLResolverMap } from "@apollo/subgraph";
import type { DocumentNode } from "graphql";
import {
  type HostedSubgraph,
  hostSetUpSubgraph,
  hostSubgraph,
} from "../../src/graphql/hosted-subgraph.js";
import type { Context } from "../../src/graphql/types.js";

function hosted(subgraph: object): HostedSubgraph {
  return hostSubgraph(subgraph) ?? hostSetUpSubgraph(subgraph);
}

export function servedSubgraph(
  subgraph: object,
): HostedSubgraph & { readonly resolvers: GraphQLResolverMap<Context> } {
  const record = hosted(subgraph);
  return { ...record, resolvers: record.bind() };
}

const served = new WeakMap<object, GraphQLResolverMap<Context>>();

export function resolversOf(subgraph: object): Record<string, any> {
  let resolvers = served.get(subgraph);
  if (!resolvers) {
    resolvers = hosted(subgraph).bind();
    served.set(subgraph, resolvers);
  }
  return resolvers;
}

export function typeDefsOf(subgraph: object): DocumentNode {
  return hosted(subgraph).typeDefs;
}
