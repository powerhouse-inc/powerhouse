import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { useMemo } from "react";
import { twMerge } from "tailwind-merge";
import { compareVersions } from "./semver-compare.js";

export type PackageManagerFilterState = {
  /** The dist-tag the user wants to restrict to, or null for "any". */
  tag: string | null;
  /** Minimum version (inclusive). Empty string means no lower bound. */
  minVersion: string;
  /** Maximum version (inclusive). Empty string means no upper bound. */
  maxVersion: string;
};

export const EMPTY_FILTERS: PackageManagerFilterState = {
  tag: null,
  minVersion: "",
  maxVersion: "",
};

/**
 * Apply the current filter state to a list of registry packages.
 *
 * - `tag`: package must declare that dist-tag.
 * - `minVersion`: the package's default/latest version must compare `>=`.
 * - `maxVersion`: the package's default/latest version must compare `<=`.
 */
export function applyPackageFilters(
  packages: RegistryPackageList,
  filters: PackageManagerFilterState,
): RegistryPackageList {
  return packages.filter((pkg) => {
    if (filters.tag !== null) {
      const tags = pkg.distTags;
      if (!tags || !(filters.tag in tags)) return false;
    }
    const pkgVersion = pkg.version;
    if (filters.minVersion && pkgVersion) {
      if (compareVersions(pkgVersion, filters.minVersion) < 0) return false;
    }
    if (filters.maxVersion && pkgVersion) {
      if (compareVersions(pkgVersion, filters.maxVersion) > 0) return false;
    }
    return true;
  });
}

export type PackageManagerFiltersProps = {
  registryPackageList: RegistryPackageList;
  value: PackageManagerFilterState;
  onChange: (next: PackageManagerFilterState) => void;
  className?: string;
};

export const PackageManagerFilters: React.FC<PackageManagerFiltersProps> = ({
  registryPackageList,
  value,
  onChange,
  className,
}) => {
  // The tag chip row is derived from the current input list — never a
  // fixed set. It's the union of `pkg.distTags` keys across every package
  // in `registryPackageList`, so if the caller only passes packages that
  // declare `latest` and `dev`, that's exactly what the row shows (no
  // `staging` chip until a package reports it).
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const pkg of registryPackageList) {
      if (!pkg.distTags) continue;
      for (const tag of Object.keys(pkg.distTags)) set.add(tag);
    }
    // `latest` conventionally comes first, remaining tags alphabetical.
    return Array.from(set).sort((a, b) => {
      if (a === "latest") return -1;
      if (b === "latest") return 1;
      return a.localeCompare(b);
    });
  }, [registryPackageList]);

  const hasActiveFilter =
    value.tag !== null ||
    value.minVersion.length > 0 ||
    value.maxVersion.length > 0;

  return (
    <div
      className={twMerge(
        "flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3",
        className,
      )}
      aria-label="Filter packages"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Tag
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...value, tag: null })}
          className={twMerge(
            "rounded-full border px-2 py-0.5 text-xs transition-colors",
            value.tag === null
              ? "border-gray-800 bg-gray-800 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:border-gray-500",
          )}
        >
          Any
        </button>
        {availableTags.map((tag) => {
          const selected = value.tag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onChange({ ...value, tag: selected ? null : tag })}
              className={twMerge(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                selected
                  ? "border-gray-800 bg-gray-800 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-500",
              )}
              aria-pressed={selected}
            >
              {tag}
            </button>
          );
        })}
        {availableTags.length === 0 && (
          <span className="text-xs italic text-gray-400">
            No dist-tags reported by registry
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Version
        </span>
        <input
          type="text"
          value={value.minVersion}
          onChange={(e) => onChange({ ...value, minVersion: e.target.value })}
          placeholder="≥ (e.g. 1.0.0)"
          className="w-28 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          aria-label="Minimum version"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="text"
          value={value.maxVersion}
          onChange={(e) => onChange({ ...value, maxVersion: e.target.value })}
          placeholder="≤ (e.g. 2.0.0)"
          className="w-28 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          aria-label="Maximum version"
        />
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ml-auto rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:border-gray-500"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};
