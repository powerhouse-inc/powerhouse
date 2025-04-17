import { type SubgraphClass } from "#graphql/index.js";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { type ProcessorFactory } from "document-drive/processors/types";
import { type DocumentModelModule } from "document-model";

export interface IProcessorHostModule {
  analyticsStore: IAnalyticsStore;
}

export interface IPackageLoader {
  loadDocumentModels(identifier: string): Promise<DocumentModelModule[]>;
  loadSubgraphs(identifier: string): Promise<SubgraphClass[]>;
  loadProcessors(
    identifier: string,
  ): Promise<(module: IProcessorHostModule) => ProcessorFactory>;
}

export interface IPackageManager {
  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void;
}

export type IPackageManagerOptions = {
  packages?: string[];
  configFile?: string;
};

export interface PackageConfig {
  packageName: string;
}

export interface PowerhouseConfig {
  packages?: PackageConfig[];
}

export type PackageManagerResult = {
  documentModels: DocumentModelModule[];
  subgraphs: Map<string, SubgraphClass[]>;
  processors: Map<
    string,
    ((module: IProcessorHostModule) => ProcessorFactory)[]
  >;
};
