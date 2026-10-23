import { AnalyticsSubgraph } from "./graphql/analytics-subgraph.js";
import { AuthSubgraph } from "./graphql/auth/subgraph.js";
import { InspectionAdminSubgraph } from "./graphql/inspection/admin-subgraph.js";
import { InspectionSubgraph } from "./graphql/inspection/subgraph.js";
import { ReactorSubgraph } from "./graphql/reactor/subgraph.js";
import { SystemSubgraph } from "./graphql/system/subgraph.js";
import type { SubgraphClass } from "./graphql/types.js";

export const config = {
  basePath: process.env.BASE_PATH || "/",
};

export const DefaultCoreSubgraphs = [
  AnalyticsSubgraph,
  SystemSubgraph,
] as const;

/** The core subgraphs a server registers, given its optional services. */
export function coreSubgraphClasses(options: {
  inspection: boolean;
  inspectionAdmin: boolean;
  documentPermissions: boolean;
}): SubgraphClass[] {
  return [
    ...DefaultCoreSubgraphs,
    ReactorSubgraph,
    ...(options.inspection ? [InspectionSubgraph] : []),
    ...(options.inspection && options.inspectionAdmin
      ? [InspectionAdminSubgraph]
      : []),
    ...(options.documentPermissions ? [AuthSubgraph] : []),
  ];
}
