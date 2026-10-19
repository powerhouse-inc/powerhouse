import {
  BaseSubgraph,
  type CanonicalDocumentId,
  type Context,
  type SchemaBuilder,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
import {
  createReactorDriveResolvers,
  REACTOR_DRIVE_SUBGRAPH_NAME,
  reactorDriveResolverCoordinates,
  reactorDriveSubgraphTypeDefs,
  type IDriveReadModel,
  type ReactorDriveResolverContext,
} from "@powerhousedao/reactor-drive";

export class ReactorDriveSubgraph extends BaseSubgraph<
  Context & ReactorDriveResolverContext
> {
  static override readonly subgraphName = REACTOR_DRIVE_SUBGRAPH_NAME;

  static override getSchema(schema: SchemaBuilder<ReactorDriveSubgraph>) {
    return schema.graphql({
      typeDefs: reactorDriveSubgraphTypeDefs,
      resolverCoordinates: reactorDriveResolverCoordinates,
      resolvers: (subgraph) =>
        createReactorDriveResolvers({
          reactorClient: subgraph.reactorClient,
          readModel: subgraph.readModel,
          hostCanRead: (documentId, address) =>
            subgraph.authorizationService.canRead(
              documentId as CanonicalDocumentId,
              address,
            ),
        }),
    });
  }

  constructor(
    args: SubgraphArgs,
    readonly readModel: IDriveReadModel,
  ) {
    super(args);
  }
}
