import type {
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";

export interface IPackageLoader {
  name: string;
  loadDocumentModels(
    identifier: string,
    immediate?: boolean,
  ): Promise<DocumentModelModule[]>;
  loadUpgradeManifests?(
    identifier: string,
    immediate?: boolean,
  ): Promise<UpgradeManifest<readonly number[]>[]>;
  loadSubgraphs(
    identifier: string,
    immediate?: boolean,
  ): Promise<SubgraphClass[]>;
  loadProcessors(
    identifier: string,
    immediate?: boolean,
  ): Promise<ProcessorFactoryBuilder | null>;
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
    handler: (processors: ProcessorFactoryBuilder | null) => void,
    options?: ISubscriptionOptions,
  ): () => void;
}

export interface IPackageManager {
  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void;
  onUpgradeManifestsChange(
    handler: (
      upgradeManifests: Record<string, UpgradeManifest<readonly number[]>[]>,
    ) => void,
  ): void;
}

export type IPackageLoaderOptions = {
  logger?: ILogger;
};

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
  upgradeManifests: UpgradeManifest<readonly number[]>[];
  subgraphs: Map<string, SubgraphClass[]>;
  processors: Map<string, ProcessorFactoryBuilder[]>;
};
