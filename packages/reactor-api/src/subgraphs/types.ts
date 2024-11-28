import type { IncomingHttpHeaders } from "http";
import { GraphQLTypeResolver } from "graphql";

import { IDocumentDriveServer } from "document-drive";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap";

export type Context = {
  driveServer: IDocumentDriveServer;
  driveId?: string;
  headers: IncomingHttpHeaders;
  db: unknown;
};

export type ResolverMap = GraphQLResolverMap<Context>;

interface Subgraph {
  resolvers: Record<string, GraphQLTypeResolver<never, Context>>;
}
