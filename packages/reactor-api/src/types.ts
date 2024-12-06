import {
  IBaseDocumentDriveServer,
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  IReceiver,
  Listener,
  ListenerRevision,
} from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { IncomingHttpHeaders } from "http";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { Processor } from "./processors";

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

export type ProcessorSetupArgs = {
  reactor: IBaseDocumentDriveServer;
};

export type AnalyticsProcessorSetupArgs = {
  reactor: IBaseDocumentDriveServer;
  analyticsStore: IAnalyticsStore;
};

export type IProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> = IReceiver<D, S> & {
  getOptions: () => ProcessorOptions;
  onSetup: (args: ProcessorSetupArgs) => void;
};

// export interface ProcessorType<T> extends Function {
//   new (...args: any[]): T;
//   TYPE: string;
//   OPTIONS: ProcessorOptions;
// }

export type ProcessorOptions = Omit<Listener, "driveId"> & { label: string };
