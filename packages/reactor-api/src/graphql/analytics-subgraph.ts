import type { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  AnalyticsModel,
  AnalyticsResolvers,
  typedefs,
} from "@powerhousedao/analytics-engine-graphql";
import type { Context, SubgraphArgs } from "@powerhousedao/reactor-api";
import { Subgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";

export class AnalyticsSubgraph extends Subgraph {
  analyticsStore: IAnalyticsStore;
  analyticsModel: AnalyticsModel;

  name = "analytics";
  typeDefs = gql`
    ${typedefs}
  `;

  resolvers = AnalyticsResolvers as GraphQLResolverMap<Context>;

  constructor(args: SubgraphArgs) {
    super(args);
    this.analyticsStore = args.analyticsStore;

    this.analyticsModel = new AnalyticsModel(
      new AnalyticsQueryEngine(this.analyticsStore),
    );

    args.graphqlManager.setAdditionalContextFields({
      dataSources: {
        db: {
          Analytics: this.analyticsModel,
        },
      },
    });
  }
}
