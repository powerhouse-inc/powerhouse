import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  Listener,
  ListenerRevision,
} from "document-drive";
import { ListenerFilter } from "document-model-libs/document-drive";
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

export type IProcessor = {
  getOptions: () => any;
  // new: (listener: Listener, reactor: IDocumentDriveServer) => void;
  transmit: (strands: InternalTransmitterUpdate[]) => Promise<ListenerRevision[]>;
  disconnect: () => Promise<void>;
}

export interface ProcessorType<T> extends Function { new(...args: any[]): T; TYPE: string; OPTIONS: ProcessorOptions; }

export type ProcessorOptions = {
  listenerId: string;
  filter: ListenerFilter;
  block: boolean;
  label: string;
  system: boolean;
};