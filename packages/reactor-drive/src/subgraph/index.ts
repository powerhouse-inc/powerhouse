export { typeDefs as reactorDriveSubgraphTypeDefs } from "./schema.js";

/**
 * Name to register the reactor-drive subgraph under. Not "reactor-drive":
 * that is the name of the reactor-drive document model's own subgraph
 * (kebabCase of the model name), and subgraphs are keyed by name, so a
 * same-named registration replaced it and took the ReactorDrive document
 * mutations out of the schema.
 */
export const REACTOR_DRIVE_SUBGRAPH_NAME = "reactor-drive-nodes";
export {
  createReactorDriveResolvers,
  type ReactorDriveResolverContext,
} from "./resolvers.js";
