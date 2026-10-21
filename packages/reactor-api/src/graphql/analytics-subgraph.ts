import type { GraphQLResolverMap } from "@apollo/subgraph";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  AnalyticsModel,
  AnalyticsResolvers,
} from "@powerhousedao/analytics-engine-graphql";
import type { Context, SubgraphArgs } from "@powerhousedao/reactor-api";
import { analyticsSchema } from "./analytics-schema.js";
import { BaseSubgraph } from "./base-subgraph.js";
import { AuthenticationRequiredError, ForbiddenError } from "./errors.js";
import type { SchemaBuilder } from "./subgraph-schema.js";

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

  static override readonly subgraphName = analyticsSchema.subgraphName;

  static override getSchema(schema: SchemaBuilder<AnalyticsSubgraph>) {
    return schema.graphql({
      typeDefs: analyticsSchema.typeDefs,
      resolverCoordinates: analyticsSchema.resolverCoordinates,
      resolvers: (subgraph) => subgraph.#resolvers(),
    });
  }

  /**
   * Every analytics field hangs off `Query.analytics`, so gating it gates them
   * all. Series are aggregates a processor built from many documents and carry
   * no document to decide on, so only a caller with policy-wide read (anyone
   * under OPEN, an admin otherwise) may read them.
   */
  #resolvers(): GraphQLResolverMap<Context> {
    return {
      ...analyticsResolvers,
      Query: {
        ...analyticsResolvers.Query,
        analytics: (parent: unknown, args: unknown, ctx: Context) => {
          this.#assertCanReadAnalytics(ctx);
          return analyticsResolvers.Query.analytics(parent, args, ctx);
        },
      },
    } as GraphQLResolverMap<Context>;
  }

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
