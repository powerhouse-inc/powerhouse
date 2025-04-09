import { SubgraphClass } from "#graphql/index.js";
import { ProcessorFactory } from "document-drive/processors/types";
import { DocumentModelModule } from "document-model";

export interface IDocumentModelLoader {
  load(identifier: string): Promise<DocumentModelModule[]>;
}

export interface ISubgraphLoader {
  load(identifier: string): Promise<SubgraphClass[]>;
}

export interface IProcessorLoader {
  load(identifier: string): Promise<(module: any) => ProcessorFactory>;
}

export interface IPackagesManager {
  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void;
}

export type IPackagesManagerOptions =
  | { packages: string[] }
  | { configFile: string };

export interface PackageConfig {
  packageName: string;
}

export interface PowerhouseConfig {
  packages?: PackageConfig[];
}

export type PackageManagerResult = {
  documentModels?: DocumentModelModule[];
  subgraphs?: Map<string, SubgraphClass[]>;
  processors?: Map<string, (module: any) => ProcessorFactory>;
};
