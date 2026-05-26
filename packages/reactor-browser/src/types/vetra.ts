import type { IDocumentModelLoader } from "@powerhousedao/reactor";
import type {
  DocumentModelLib,
  RegistryPackageSource,
} from "@powerhousedao/shared";
export type IPackagesListener = (data: {
  packages: DocumentModelLib[];
}) => void;
export type IPackageListerUnsubscribe = () => void;

export type PackageManagerInstallResult =
  | {
      type: "success";
      package: DocumentModelLib;
    }
  | { type: "error"; error: Error };

export interface IPackageManager extends IDocumentModelLoader {
  registryUrl: string | null;
  packages: DocumentModelLib[];
  addPackage(
    packageName: string,
  ): Promise<PackageManagerInstallResult> | PackageManagerInstallResult;
  addPackages(
    packageNames: string[],
  ): Promise<PackageManagerInstallResult[]> | PackageManagerInstallResult[];
  removePackage(name: string): void;
  updateLocalPackage(pkg: DocumentModelLib, version?: string): void;
  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe;
  getPackageSource: (packageName: string) => RegistryPackageSource | null;
  getPackageVersion: (packageName: string) => string | undefined;
  /**
   * Registry-installed packages keyed by their storage name (the registry
   * spec, e.g. "@powerhousedao/clint-common"). Used by callers that need to
   * diff against an external source of truth such as the publish-reload
   * channel's `/__packages` SSE feed.
   */
  getRegistryPackages: () => { name: string; version: string | undefined }[];
  addLocalPackage: (
    name: string,
    loadedPackage: DocumentModelLib,
    version?: string,
  ) => void;
}
