import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import {
  type IRelationalDb,
  type ProcessorRecord,
} from "document-drive/processors/types";
import {
  type Action,
  type Author,
  type DocumentModelState,
  type ImportScriptModule,
  type Reducer,
  type SubgraphModule,
} from "document-model";
import { type ReactNode } from "react";

export type Processors = (module: {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
}) => (driveId: string) => ProcessorRecord[];

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

type DocumentModel = DocumentModelState;

export type VetraDocumentModelModule = VetraMeta & {
  reducer: Reducer<any>;
  actions: Record<string, (input: any) => Action>;
  utils: any;
  documentModel: DocumentModel;
};
export type VetraEditorModule = VetraMeta & {
  documentTypes: string[];
  Component: (props: any) => any;
  config: {
    disableExternalControls?: boolean;
    documentToolbarEnabled?: boolean;
    showSwitchboardLink?: boolean;
    timelineEnabled?: boolean;
  };
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

export type VetraPackage = BaseVetraPackage<VetraModules>;

export type VetraPackageManifest = VetraPackageMeta & {
  modules: {
    [K in keyof VetraModules]: VetraMeta[];
  };
};
