import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  IReceiver,
  Listener,
  ListenerRevision,
} from "document-drive";
import { Document, OperationScope } from "document-model/document";
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

export type ProcessorType = "analytics" | "operational";

export type IProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> = IReceiver<D, S> & {
  getOptions: () => ProcessorOptions;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
// export interface ProcessorType<T> extends Function {
//   new (...args: any[]): T;
//   TYPE: string;
//   OPTIONS: ProcessorOptions;
// }

export type ProcessorOptions = Omit<Listener, "driveId"> & { label: string };
