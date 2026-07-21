import type { RegistryPackageList } from "@powerhousedao/shared/registry";
import { parsePackageSpec } from "./parse-package-spec.js";

/**
 * Client-side package filter used by both Package Manager tabs. Matches the
 * query's name part (any `@tag` suffix is ignored for matching — it drives
 * version preselection instead) against the package name only.
 *
 * This is the seam a future registry search endpoint replaces: when the
 * Available tab searches server-side, its panel skips this function and
 * renders the API results as-is.
 */
export function filterPackages(
  packages: RegistryPackageList,
  query: string,
): RegistryPackageList {
  const { name } = parsePackageSpec(query);
  const needle = name.toLowerCase();
  if (!needle) return packages;
  return packages.filter((pkg) => pkg.name.toLowerCase().includes(needle));
}
