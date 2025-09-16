import { AnalyticsSubgraph } from "./graphql/analytics/index.js";
import { SystemSubgraph } from "./graphql/system/index.js";

export const config = {
  basePath: process.env.BASE_PATH || "/",
};

export const DefaultCoreSubgraphs = [
  SystemSubgraph,
  AnalyticsSubgraph,
] as const;
