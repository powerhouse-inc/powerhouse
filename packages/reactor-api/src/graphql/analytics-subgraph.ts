import type { GraphQLResolverMap } from "@apollo/subgraph";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  AnalyticsModel,
  AnalyticsResolvers,
  typedefs,
} from "@powerhousedao/analytics-engine-graphql";
import type { Context, SubgraphArgs } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
import { BaseSubgraph } from "./base-subgraph.js";
import { AuthenticationRequiredError, ForbiddenError } from "./errors.js";

type AnalyticsResolver = (
  parent: unknown,
  args: unknown,
  ctx: Context,
) => unknown;

const analyticsResolvers = AnalyticsResolvers as {
  Query: { analytics: AnalyticsResolver };
} & Record<string, Record<string, AnalyticsResolver>>;

export class AnalyticsSubgraph extends BaseSubgraph {
  analyticsStore: IAnalyticsStore;
  analyticsModel: AnalyticsModel;

  name = "analytics";
  typeDefs = gql`
    ${typedefs}
  `;

  /**
   * Every analytics field hangs off `Query.analytics`, so gating it gates them
   * all. Series are aggregates a processor built from many documents and carry
   * no document to decide on, so only a caller with policy-wide read (anyone
   * under OPEN, an admin otherwise) may read them.
   */
  resolvers = {
    ...analyticsResolvers,
    Query: {
      ...analyticsResolvers.Query,
      analytics: (parent: unknown, args: unknown, ctx: Context) => {
        this.#assertCanReadAnalytics(ctx);
        return analyticsResolvers.Query.analytics(parent, args, ctx);
      },
    },
  } as GraphQLResolverMap<Context>;

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

  #assertCanReadAnalytics(ctx: Context): void {
    if (this.authorizationService.isSupremeAdmin(ctx.user?.address)) return;
    if (ctx.user?.address) {
      throw new ForbiddenError("to read analytics");
    }
    throw new AuthenticationRequiredError("to read analytics");
  }
}
