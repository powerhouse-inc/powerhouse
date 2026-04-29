import { AnalyticsSubgraph } from "./graphql/analytics-subgraph.js";
import { SystemSubgraph } from "./graphql/system/subgraph.js";

export const config = {
  basePath: process.env.BASE_PATH || "/",
};

export const DefaultCoreSubgraphs = [
  AnalyticsSubgraph,
  SystemSubgraph,
] as const;
