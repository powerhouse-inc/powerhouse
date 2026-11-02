import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/* Resolve graphql-codegen plugins from this package's own install rather than
 * graphql-codegen's default loader. The default resolves relative to graphql-
 * codegen's location and is sensitive to the install layout (which cli copy,
 * cwd), so it can report "Unable to find template plugin matching '<name>'"
 * even when the plugins are installed. This package depends on its plugins
 * directly, so resolving from here is deterministic. (selfReal covers
 * --preserve-symlinks, where import.meta.url is the symlink path.) graphql-
 * codegen probes candidate names; unresolved ones throw MODULE_NOT_FOUND so it
 * falls through to the next candidate. */
const selfPath = fileURLToPath(import.meta.url);
let selfReal = selfPath;
try {
  selfReal = realpathSync(selfPath);
} catch {
  // keep selfPath
}
const requirers = [createRequire(selfPath), createRequire(selfReal)];

export function resolveFromCodegen(name: string): string {
  let lastErr: unknown;
  for (const requireFrom of requirers) {
    try {
      return requireFrom.resolve(name);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
