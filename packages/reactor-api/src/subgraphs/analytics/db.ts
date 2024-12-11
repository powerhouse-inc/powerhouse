import { Knex } from "knex";

export async function createSchema(knex: Knex) {
  if (!(await knex.schema.hasTable("AnalyticsDimension"))) {
    await knex.schema.createTable("AnalyticsDimension", (table) => {
      table.increments("id").primary();
      table
        .string("dimension")
        .notNullable()
        .index("analyticsdimension_dimension_index");
      table.string("path").notNullable().index("analyticsdimension_path_index");
      table.string("label").nullable();
      table.string("icon").nullable();
      table.text("description").nullable();
    });
  }

  if (!(await knex.schema.hasTable("AnalyticsSeries"))) {
    await knex.schema.createTable("AnalyticsSeries", (table) => {
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
      table.float("value").notNullable().index("analyticsseries_value_index");
      table.string("unit").nullable().index("analyticsseries_unit_index");
      table.string("fn").notNullable().index("analyticsseries_fn_index");
      table.json("params").nullable();
    });
  }

  if (!(await knex.schema.hasTable("AnalyticsSeries_AnalyticsDimension"))) {
    await knex.schema.createTable(
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
