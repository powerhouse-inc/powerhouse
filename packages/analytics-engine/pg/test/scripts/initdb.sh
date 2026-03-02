#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE DATABASE analytics;
  \c analytics

  create table "AnalyticsSeries"
  (
      id     serial       primary key,
      source varchar(255) not null,
      start  timestamp    not null,
      "end"  timestamp,
      metric varchar(255) not null,
      value  real         not null,
      unit   varchar(255),
      fn     varchar(255) not null,
      params json
  );

  create index analyticsseries_end_index
      on "AnalyticsSeries" ("end");

  create index analyticsseries_fn_index
      on "AnalyticsSeries" (fn);

  create index analyticsseries_metric_index
      on "AnalyticsSeries" (metric);

  create index analyticsseries_source_index
      on "AnalyticsSeries" (source);

  create index analyticsseries_start_index
      on "AnalyticsSeries" (start);

  create index analyticsseries_unit_index
      on "AnalyticsSeries" (unit);

  create index analyticsseries_value_index
      on "AnalyticsSeries" (value);

  create table "AnalyticsDimension"
  (
      id          serial        primary key,
      dimension   varchar(255)  not null,
      path        varchar(255)  not null,
      label       varchar(255),
      icon        varchar(1000),
      description text
  );

  create index analyticsdimension_dimension_index
      on "AnalyticsDimension" (dimension);

  create index analyticsdimension_path_index
      on "AnalyticsDimension" (path);

  create table "AnalyticsSeries_AnalyticsDimension"
  (
      "seriesId"    integer not null
          constraint analyticsseries_analyticsdimension_seriesid_foreign
              references "AnalyticsSeries"
              on delete cascade,
      "dimensionId" integer not null
          constraint analyticsseries_analyticsdimension_dimensionid_foreign
              references "AnalyticsDimension"
              on delete cascade
  );

  create index analyticsseries_analyticsdimension_dimensionid_index
    on "AnalyticsSeries_AnalyticsDimension" ("dimensionId");

  create index analyticsseries_analyticsdimension_seriesid_index
      on "AnalyticsSeries_AnalyticsDimension" ("seriesId");

EOSQL
