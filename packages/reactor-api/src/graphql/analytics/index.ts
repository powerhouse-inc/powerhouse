import type { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  AnalyticsModel,
  AnalyticsResolvers,
  typedefs,
} from "@powerhousedao/analytics-engine-graphql";
import { gql } from "graphql-tag";
import { Subgraph } from "../base/index.js";
import type { Context, SubgraphArgs } from "../index.js";

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
