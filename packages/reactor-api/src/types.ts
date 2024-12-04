import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  Listener,
  ListenerRevision,
} from "document-drive";
import { PgDatabase } from "drizzle-orm/pg-core";
import { IncomingHttpHeaders } from "http";

export interface Context {
  headers: IncomingHttpHeaders;
  driveId: string | undefined;
  driveServer: IDocumentDriveServer;
}

export type Subgraph = {
  name: string;
  resolvers: any;
  typeDefs: string;
  options?: Omit<Listener, "driveId">;
  transmit?: (
    strands: InternalTransmitterUpdate[],
  ) => Promise<ListenerRevision[]>;
};
