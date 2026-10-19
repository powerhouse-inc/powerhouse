import {
  BaseSubgraph,
  type SchemaBuilder,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
import {
  createPrivacyResolvers,
  PRIVACY_SUBGRAPH_NAME,
  privacyResolverCoordinates,
  privacySubgraphTypeDefs,
  refuseAnonymousAdmins,
  type PrivacyResolverDeps,
} from "@powerhousedao/reactor-privacy";

export class PrivacySubgraph extends BaseSubgraph {
  static override readonly subgraphName = PRIVACY_SUBGRAPH_NAME;

  static override getSchema(schema: SchemaBuilder<PrivacySubgraph>) {
    return schema.graphql({
      typeDefs: privacySubgraphTypeDefs,
      resolverCoordinates: privacyResolverCoordinates,
      resolvers: (subgraph) =>
        createPrivacyResolvers({
          authorizationService: subgraph.authorizationService,
          ...subgraph.services,
        }),
    });
  }

  constructor(
    args: SubgraphArgs,
    private readonly services: Pick<
      PrivacyResolverDeps,
      "erasure" | "disclosure"
    >,
  ) {
    refuseAnonymousAdmins(args.authorizationService);
    super(args);
  }
}
