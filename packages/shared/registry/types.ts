import type { Manifest } from "types";
export interface PackageInfo {
  name: string;
  path: string;
  manifest: Manifest | null;
  documentTypes: string[];
  version?: string;
  /** Mapping of dist-tag → version (e.g. {latest: "1.0.0", dev: "1.1.0-dev.3"}). */
  distTags?: Record<string, string>;
  /** All published versions of the package, sorted ascending by semver. */
  versions?: string[];
  /** Accounts that own the name (publish/unpublish rights). Present only on
   *  registries with the Postgres-backed auth; omitted when untracked. */
  owners?: string[];
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
