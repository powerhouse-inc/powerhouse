import { IDocumentDriveServer, IReceiver, Listener } from "document-drive";
import { BaseDocument, OperationScope } from "document-model";
import { Express } from "express";
import { IAnalyticsStore } from "./processors/analytics-processor";
import { ProcessorClass } from "./processors/processor";
import { SubgraphManager } from "./subgraphs/manager";
import { Db } from "./utils/db";

export type { Db } from "./utils/db";

export type IProcessorManager = {
  registerProcessor(module: IProcessor | ProcessorClass): Promise<IProcessor>;
};

export type API = {
  app: Express;
  subgraphManager: SubgraphManager;
  processorManager: IProcessorManager;
};

export type ProcessorType = "analytics" | "operational";

export type ProcessorSetupArgs = {
  reactor: IDocumentDriveServer;
  operationalStore: Db;
  analyticsStore: IAnalyticsStore;
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
