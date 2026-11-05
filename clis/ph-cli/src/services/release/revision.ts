import { createHash } from "node:crypto";

export type Sha256 = `sha256:${string}`;

/** One file, by its POSIX path relative to the package root, and the hex sha256 of its bytes. */
export type FileDigest = { readonly path: string; readonly sha256: string };

/**
 * The package revision: one digest over its files, sorted by path, bound to
 * the given values (the ph-cli version), so the same files under another
 * ph-cli are another revision.
 */
export function packageRevision(
  files: readonly FileDigest[],
  bindings: Readonly<Record<string, string>>,
): Sha256 {
  const hash = createHash("sha256");
  for (const { path, sha256 } of [...files].sort(byPath)) {
    hash.update(`${path}\0${sha256}\n`);
  }
  for (const key of Object.keys(bindings).sort()) {
    hash.update(`binding:${key}\0${bindings[key]}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function byPath(left: FileDigest, right: FileDigest): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

/** Paths added, removed or with other bytes in `after`, sorted. */
export function changedPaths(
  before: readonly FileDigest[],
  after: readonly FileDigest[],
): string[] {
  const was = new Map(before.map(({ path, sha256 }) => [path, sha256]));
  const now = new Map(after.map(({ path, sha256 }) => [path, sha256]));
  return [...new Set([...was.keys(), ...now.keys()])]
    .filter((path) => was.get(path) !== now.get(path))
    .sort();
}
