/**
 * Deterministic per-folder name collision rule. Given a desired name and the
 * set of names already taken by siblings, returns the next available name as
 * `requested`, `requested (2)`, `requested (3)`, etc.
 *
 * The rule matches the legacy document-drive module so that migration from
 * the legacy state produces stable suffixes.
 */
export function resolveCollision(
  requested: string,
  takenNames: Iterable<string>,
): string {
  const taken = new Set<string>();
  for (const name of takenNames) {
    taken.add(name);
  }

  if (!taken.has(requested)) {
    return requested;
  }

  let suffix = 2;
  while (taken.has(`${requested} (${suffix})`)) {
    suffix += 1;
  }
  return `${requested} (${suffix})`;
}
