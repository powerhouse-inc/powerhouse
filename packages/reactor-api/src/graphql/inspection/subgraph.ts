import type { DocumentNode } from "graphql";
import { BaseSubgraph } from "../base-subgraph.js";
import type { Context, SubgraphArgs } from "../types.js";
import { createInspectionResolvers } from "./resolvers.js";
import { inspectionTypeDefs } from "./schema.js";
import type { IReactorInspectionSource } from "./source.js";

/**
 * Serves the reactor's typed inspection surfaces (`IInspector` and
 * `ISyncInspector`) over the existing `/graphql` plane, so a monitor can
 * inspect a REMOTE reactor through the same contracts its local hosting kinds
 * use (multi-reactor W3.2).
 *
 * A thin shell on purpose: the SDL lives in `schema.ts`, the behaviour and all
 * three access tiers in `resolvers.ts`, and the reactor wiring in `source.ts`.
 * This class only supplies the one thing a subgraph has that a resolver module
 * does not -- the request's caller, checked against the host's authorization
 * service.
 *
 * Registered only when the host hands the GraphQL manager an inspection
 * source. Without one the subgraph is absent entirely rather than present and
 * refusing: there is no reactor module to inspect, and an endpoint that exists
 * but can never answer is worse than no endpoint.
 */
export class InspectionSubgraph extends BaseSubgraph {
  name = "inspection";
  hasSubscriptions = false;
  typeDefs: DocumentNode = inspectionTypeDefs;
  resolvers: Record<string, any>;

  /** The reactor this subgraph serves, and the tiers it may serve. */
  readonly source: IReactorInspectionSource;

  constructor(args: SubgraphArgs) {
    super(args);
    if (!args.inspection) {
      throw new Error(
        "InspectionSubgraph requires an inspection source; the host did not provide one",
      );
    }
    this.source = args.inspection;
    this.resolvers = createInspectionResolvers(this.source, {
      // Tier 1 and the floor under tiers 2 and 3. Deliberately the host's own
      // policy-wide reader check, the same one `syncHolds` and the package
      // management ops gate on, rather than a second notion of "admin" that
      // could disagree with the deployment's policy: everyone under OPEN,
      // which is what an unauthenticated dev Switchboard already is, and the
      // ADMINS list under ADMIN_ONLY and DOCUMENT_PERMISSIONS.
      isAdminCaller: (ctx: Context) =>
        this.authorizationService.isSupremeAdmin(ctx.user?.address),
    });
  }
}
