import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IRelationalDbLegacy,
  ProcessorRecordLegacy,
} from "document-drive";
import type {
  Action,
  Author,
  DocumentModelPHState,
  DocumentModelUtils,
  DocumentSpecification,
  ImportScriptModule,
  PHDocumentHeader,
  Reducer,
  SubgraphModule,
  UpgradeManifest,
} from "document-model";
import type { ProcessorFactoryBuilder } from "../../../reactor/src/processors/index.js";

export type Processors = (module: {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDbLegacy;
}) => (driveHeader: PHDocumentHeader) => ProcessorRecordLegacy[];

export type VetraMeta = {
  id: string;
  name: string;
};

export type VetraModule = Record<string, unknown> & VetraMeta;

export type VetraPackageMeta = {
  id: string;
  name: string;
  description: string;
  category: string;
  author: Author;
};

type BaseVetraPackage<TModules extends { [K in keyof TModules]: VetraMeta[] }> =
  VetraPackageMeta & {
    modules: {
      [K in keyof TModules]: TModules[K];
    };
  };

export type VetraDocumentModelModule = VetraMeta & {
  documentType: string;
  extension: string;
  specifications: DocumentSpecification[];
  reducer: Reducer<any>;
  actions: Record<string, (input: any) => Action>;
  utils: DocumentModelUtils<any>;
  documentModel: DocumentModelPHState;
  version?: number;
};
export type VetraEditorModule = VetraMeta & {
  documentTypes: string[];
  Component: React.ComponentType<any>;
};

export type VetraProcessorModule = VetraMeta & {
  processors: Processors;
};

export type VetraModules = {
  documentModelModules?: VetraDocumentModelModule[];
  editorModules?: VetraEditorModule[];
  subgraphModules?: SubgraphModule[];
  importScriptModules?: ImportScriptModule[];
};

export type VetraPackage = BaseVetraPackage<VetraModules> & {
  upgradeManifests: UpgradeManifest<readonly number[]>[];
  processorFactory?: ProcessorFactoryBuilder;
};

export type VetraPackageManifest = VetraPackageMeta & {
  modules: {
    [K in keyof VetraModules]: VetraMeta[];
  };
};

export type IPackagesListener = (data: { packages: VetraPackage[] }) => void;
export type IPackageListerUnsubscribe = () => void;

export interface IPackageManager {
  packages: VetraPackage[];
  addPackage(name: string, registryUrl: string): Promise<void>;
  addLocalPackage(name: string, localPackage: VetraPackage): Promise<void>;
  removePackage(name: string): Promise<void>;
  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe;
}

export interface IPackage {
  name: string;
  url: string;
}

export type IPackagesMap = Record<"packages", IPackage[]>;
