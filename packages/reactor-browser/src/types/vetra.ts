import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
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
} from "@powerhousedao/shared/document-model";
import type {
  IRelationalDb,
  ProcessorFactoryBuilder,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { RegistryPackageSource } from "@powerhousedao/shared/registry";
import type { IDocumentModelLoader } from "../re-exports.js";

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
  upgradeManifests: UpgradeManifest<readonly number[]>[] | undefined;
  processorFactory?: ProcessorFactoryBuilder;
};

export type VetraPackageManifest = VetraPackageMeta & {
  modules: {
    [K in keyof VetraModules]: VetraMeta[];
  };
};

export type IPackagesListener = (data: { packages: VetraPackage[] }) => void;
export type IPackageListerUnsubscribe = () => void;

export type PackageManagerInstallResult =
  | {
      type: "success";
      package: VetraPackage;
    }
  | { type: "error"; error: Error };

export interface IPackageManager extends IDocumentModelLoader {
  registryUrl: string | null;
  packages: VetraPackage[];
  addPackage(
    packageName: string,
  ): Promise<PackageManagerInstallResult> | PackageManagerInstallResult;
  addPackages(
    packageNames: string[],
  ): Promise<PackageManagerInstallResult[]> | PackageManagerInstallResult[];
  removePackage(name: string): void;
  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe;
  getPackageSource: (packageName: string) => RegistryPackageSource | null;
}
