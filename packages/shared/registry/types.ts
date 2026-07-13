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
}

/**
 * Trimmed per-item shape returned by the paginated `GET /packages?limit=…`
 * mode. Carries only the fields the package-listing card renders; version
 * metadata (distTags/versions) and documentTypes are fetched on demand via
 * the single-package endpoint. The legacy no-param and `?documentType=` modes
 * still return full {@link PackageInfo} objects.
 */
export interface PackageListItem {
  name: string;
  path: string;
  version?: string;
  description?: string;
  category?: string;
  publisher?: { name?: string; url?: string };
}

/** Envelope returned by the paginated `GET /packages?limit=…` mode. */
export interface PackagePage {
  items: PackageListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
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
