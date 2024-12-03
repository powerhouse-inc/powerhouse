import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  Listener,
} from "document-drive";
import { PgDatabase } from "drizzle-orm/pg-core";
import { IncomingHttpHeaders } from "http";

export interface Context {
  headers: IncomingHttpHeaders;
  driveId: string | undefined;
  driveServer: IDocumentDriveServer;
  db: PgDatabase<any, any, any>;
}

export type Processor = {
  name: string;
  resolvers: any;
  typeDefs: string;
  options?: Omit<Listener, "driveId">;
  transmit?: (strands: InternalTransmitterUpdate[]) => Promise<void>;
  dbSchema?: Record<string, unknown>;
};
