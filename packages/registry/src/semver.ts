/**
 * Compare two semver version strings for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Handles numeric component comparison (so "1.0.10" > "1.0.9")
 * and prerelease ordering (release > prerelease).
 */
export function compareSemver(a: string, b: string): number {
  const [coreA, preA] = a.split("-", 2);
  const [coreB, preB] = b.split("-", 2);

  const partsA = coreA.split(".").map(Number);
  const partsB = coreB.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (na !== nb) return na - nb;
  }

  // Equal core versions — release (no prerelease) sorts after prerelease
  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  if (preA && preB) return preA < preB ? -1 : preA > preB ? 1 : 0;

  return 0;
}
