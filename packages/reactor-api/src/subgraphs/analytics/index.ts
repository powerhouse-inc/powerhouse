import {
  AnalyticsQueryEngine,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import {
  AnalyticsModel,
  typedefs,
  AnalyticsResolvers,
} from "@powerhousedao/analytics-engine-graphql";
import {
  KnexAnalyticsStore,
  KnexQueryExecutor,
} from "@powerhousedao/analytics-engine-knex";
import gql from "graphql-tag";
import { Subgraph } from "../base/index.js";
import { Context, SubgraphArgs } from "../index.js";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";

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
    this.analyticsStore = new KnexAnalyticsStore({
      executor: new KnexQueryExecutor(),
      knex: args.operationalStore,
    });

    this.analyticsModel = new AnalyticsModel(
      new AnalyticsQueryEngine(this.analyticsStore),
    );

    args.subgraphManager.setAdditionalContextFields({
      db: {
        Analytics: this.analyticsModel,
      },
    });
  }

  async onSetup() {
    await this.#createTables();
  }

  async #createTables() {
    if (!(await this.operationalStore.schema.hasTable("AnalyticsDimension"))) {
      await this.operationalStore.schema.createTable(
        "AnalyticsDimension",
        (table) => {
          table.increments("id").primary();
          table
            .string("dimension")
            .notNullable()
            .index("analyticsdimension_dimension_index");
          table
            .string("path")
            .notNullable()
            .index("analyticsdimension_path_index");
          table.string("label").nullable();
          table.string("icon").nullable();
          table.text("description").nullable();
        },
      );
    }

    if (!(await this.operationalStore.schema.hasTable("AnalyticsSeries"))) {
      await this.operationalStore.schema.createTable(
        "AnalyticsSeries",
        (table) => {
          table.increments("id").primary();
          table
            .string("source")
            .notNullable()
            .index("analyticsseries_source_index");
          table
            .timestamp("start")
            .notNullable()
            .index("analyticsseries_start_index");
          table.timestamp("end").nullable().index("analyticsseries_end_index");
          table
            .string("metric")
            .notNullable()
            .index("analyticsseries_metric_index");
          table
            .float("value")
            .notNullable()
            .index("analyticsseries_value_index");
          table.string("unit").nullable().index("analyticsseries_unit_index");
          table.string("fn").notNullable().index("analyticsseries_fn_index");
          table.json("params").nullable();
        },
      );
    }

    if (
      !(await this.operationalStore.schema.hasTable(
        "AnalyticsSeries_AnalyticsDimension",
      ))
    ) {
      await this.operationalStore.schema.createTable(
        "AnalyticsSeries_AnalyticsDimension",
        (table) => {
          table
            .integer("seriesId")
            .references("AnalyticsSeries.id")
            .onDelete("CASCADE")
            .index("analyticsseries_analyticsdimension_seriesid_index");
          table
            .integer("dimensionId")
            .references("AnalyticsDimension.id")
            .onDelete("CASCADE")
            .index("analyticsseries_analyticsdimension_dimensionid_index");
        },
      );
    }
  }
}
