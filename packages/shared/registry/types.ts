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
 * Item shape of `GET /packages` pages: only what a listing card renders. Pass
 * `detail=full` for {@link PackageInfo} items.
 */
export interface PackageListItem {
  name: string;
  path: string;
  version?: string;
  description?: string;
  category?: string;
  publisher?: { name?: string; url?: string };
}

/** Envelope of `GET /packages` and `GET /pieces`. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Filter options over the `name`-restricted set, sent with `facets=true`. */
export interface PackageFacets {
  categories: string[];
  publishers: string[];
}

/** `GET /packages`; items are {@link PackageInfo} with `detail=full`. */
export interface PackagePage<T = PackageListItem> extends Page<T> {
  facets?: PackageFacets;
}

/** Manifest module lists accepted by the `moduleType` filter. */
export const PACKAGE_MODULE_TYPES = [
  "documentModels",
  "editors",
  "apps",
  "subgraphs",
  "processors",
] as const;
export type PackageModuleType = (typeof PACKAGE_MODULE_TYPES)[number];

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
  /**
   * Shared-dependency version mismatches against the Connect build's version
   * table, pre-formatted (see `formatSharedDepWarnings`). Absent when the
   * host has no shared-deps table (vendor-off / dev) or none were found.
   */
  sharedDepWarnings?: string[];
};
export type RegistryPackageMap = Record<string, RegistryPackage | undefined>;
export type RegistryPackageList = RegistryPackage[];
