import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  IReceiver,
  Listener,
  ListenerRevision,
} from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { IncomingHttpHeaders } from "http";
import { Express } from "express";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { ReactorRouterManager } from "./router";
import { ProcessorClass } from "./processors/processor";

export type IProcessorManager = {
  registerProcessor(module: IProcessor | ProcessorClass): Promise<IProcessor>;
};

export type API = {
  app: Express;
  reactorRouterManager: ReactorRouterManager;
  processorManager: IProcessorManager;
};

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
  reactor: IDocumentDriveServer;
  dataSources: {
    analyticsStore: IAnalyticsStore;
  };
};

export type IProcessor<
  D extends Document = Document,
  S extends OperationScope = OperationScope,
> = IReceiver<D, S> & {
  onSetup?: (args: ProcessorSetupArgs) => void;
  getOptions: () => ProcessorOptions;
};

// export interface ProcessorType<T> extends Function {
//   new (...args: any[]): T;
//   TYPE: string;
//   OPTIONS: ProcessorOptions;
// }

export type ProcessorOptions = Omit<Listener, "driveId"> & { label: string };
