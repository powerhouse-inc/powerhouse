import type { Manifest } from "types";
export interface PackageInfo {
  name: string;
  path: string;
  manifest: Manifest | null;
  documentTypes: string[];
}

export type RegistryPackageStatus =
  | "available"
  | "local-install"
  | "registry-install"
  | "dismissed";

export type RegistryPackageSource =
  | "available"
  | "local-install"
  | "registry-install"
  | "common"
  | "project";

export type RegistryPackage = PackageInfo & {
  status: RegistryPackageStatus;
};
export type RegistryPackageMap = Record<string, RegistryPackage | undefined>;
export type RegistryPackageList = RegistryPackage[];
