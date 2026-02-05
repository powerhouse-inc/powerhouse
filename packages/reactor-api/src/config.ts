import { AnalyticsSubgraph } from "./graphql/analytics-subgraph.js";

export const config = {
  basePath: process.env.BASE_PATH || "/",
};

export const DefaultCoreSubgraphs = [AnalyticsSubgraph] as const;
