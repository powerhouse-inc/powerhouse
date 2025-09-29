import type { IProcessorHostModule, ProcessorFactory } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type { SubgraphClass } from "@powerhousedao/reactor-api";

export interface IPackageLoader {
  loadDocumentModels(identifier: string): Promise<DocumentModelModule[]>;
  loadSubgraphs(identifier: string): Promise<SubgraphClass[]>;
  loadProcessors(
    identifier: string,
  ): Promise<((module: IProcessorHostModule) => ProcessorFactory) | null>;
}

export interface ISubscriptionOptions {
  debounce?: number; // defaults to 100ms
}

export interface ISubscribablePackageLoader extends IPackageLoader {
  onDocumentModelsChange?(
    identifier: string,
    handler: (documentModels: DocumentModelModule[]) => void,
    options?: ISubscriptionOptions,
  ): () => void;
  onSubgraphsChange?(
    identifier: string,
    handler: (subgraphs: SubgraphClass[]) => void,
    options?: ISubscriptionOptions,
  ): () => void;
  onProcessorsChange?(
    identifier: string,
    handler: (
      processors: ((module: IProcessorHostModule) => ProcessorFactory) | null,
    ) => void,
    options?: ISubscriptionOptions,
  ): () => void;
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
