import { IDocumentDriveServer, IReceiver, Listener } from "document-drive";
import { Express } from "express";
import { IAnalyticsStore } from "./processors/analytics-processor.js";
import { ProcessorClass } from "./processors/processor.js";
import { SubgraphManager } from "./subgraphs/manager.js";
import { Db } from "./utils/db.js";

export type { Db } from "./utils/db.js";

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

export type IProcessor = IReceiver & {
  onSetup?: (args: ProcessorSetupArgs) => void;
  getOptions: () => ProcessorOptions;
};

// export interface ProcessorType<T> extends Function {
//   new (...args: any[]): T;
//   TYPE: string;
//   OPTIONS: ProcessorOptions;
// }

export type ProcessorOptions = Omit<Listener, "driveId" | "callInfo"> & {
  label: string;
};
