import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IRelationalDb, ProcessorRecord } from "document-drive";
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

export type Processors = (module: {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
}) => (driveHeader: PHDocumentHeader) => ProcessorRecord[];

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
  processorModules?: VetraProcessorModule[];
};

export type VetraPackage = BaseVetraPackage<VetraModules> & {
  upgradeManifests?: UpgradeManifest<readonly number[]>[];
};

export type VetraPackageManifest = VetraPackageMeta & {
  modules: {
    [K in keyof VetraModules]: VetraMeta[];
  };
};
