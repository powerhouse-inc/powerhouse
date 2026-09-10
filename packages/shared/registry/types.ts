import type { Manifest } from "types";
export interface PackageInfo {
  name: string;
  path: string;
  manifest: Manifest | null;
  documentTypes: string[];
  version?: string;
  /** Install spec the user requested (name, name@tag, or name@version); present
   *  on installed packages, used to pick the update stream. Absent for legacy
   *  entries. */
  spec?: string;
  /** Mapping of dist-tag → version (e.g. {latest: "1.0.0", dev: "1.1.0-dev.3"}). */
  distTags?: Record<string, string>;
  /** All published versions of the package, sorted ascending by semver. */
  versions?: string[];
  /**
   * The newest version the registry currently reports for this package (the
   * `version` field of list items / single-package responses). Distinct from
   * {@link version}, which holds the installed version on installed rows.
   * Every registry reports it, even ones without dist-tag support, so it is
   * the fallback target for the `latest` update stream.
   */
  latestVersion?: string;
  /** Accounts that own the name (publish/unpublish rights). Present only on
   *  registries with the Postgres-backed auth; omitted when untracked. */
  owners?: string[];
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
