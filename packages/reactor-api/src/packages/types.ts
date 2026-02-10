import type { IProcessorHostModule } from "@powerhousedao/reactor";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { ProcessorFactory } from "document-drive";
import type { DocumentModelModule } from "document-model";

export interface IPackageLoader {
  loadDocumentModels(
    identifier: string,
    immediate?: boolean,
  ): Promise<DocumentModelModule[]>;
  loadSubgraphs(
    identifier: string,
    immediate?: boolean,
  ): Promise<SubgraphClass[]>;
  loadProcessors(
    identifier: string,
    immediate?: boolean,
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

export type IPackageLoaderOptions = {
  legacyReactor?: boolean;
};

export type IPackageManagerOptions = {
  packages?: string[];
  configFile?: string;
  legacyReactor?: boolean;
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
