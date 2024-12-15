import {
  IDocumentDriveServer,
  InternalTransmitterUpdate,
  IReceiver,
  Listener,
  ListenerRevision,
} from "document-drive";
import { Document, OperationScope } from "document-model/document";
import { Express } from "express";
import { IncomingHttpHeaders } from "http";
import { Knex } from "knex";
import { ProcessorClass } from "./processors/processor";
import { SubgraphManager } from "./subgraphs/manager";

export type IProcessorManager = {
  registerProcessor(module: IProcessor | ProcessorClass): Promise<IProcessor>;
};

export type API = {
  app: Express;
  subgraphManager: SubgraphManager;
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
  operationalStore: Knex;
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
