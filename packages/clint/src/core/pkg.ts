/**
 * Read CLI identity from the implementation project's package.json.
 *
 * ```ts
 * import { readPackageInfo } from '@powerhousedao/clint';
 *
 * const pkg = readPackageInfo(import.meta.url);
 * export const CLI_ROOT = pkg.root;
 * export const CLI_NAME = pkg.name.replace(/-cli$/, '');
 * export const CLI_VERSION = pkg.version;
 * ```
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageInfo {
  /** Project root directory: the directory of the nearest package.json above the calling file. */
  root: string;
  /** Package name with `@scope/` stripped (e.g. `"foo-cli"` from `"@acme/foo-cli"`). */
  name: string;
  /** Package version as-is from package.json. */
  version: string;
}

/**
 * Read package identity from the nearest `package.json` above the calling
 * source file. Pass `import.meta.url`: the search starts in that file's
 * directory and walks up to the filesystem root, so a source file at any
 * depth (`src/config.ts`, `cli/src/config.ts`) and a bundle
 * (`node_modules/<pkg>/dist/node/cli/index.mjs`) both read their own
 * package's. That package.json must carry a `name` and a `version`.
 */
export function readPackageInfo(importMetaUrl: string): PackageInfo {
  const start = path.dirname(fileURLToPath(importMetaUrl));
  const root = nearestPackageRoot(start);
  const raw = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const name = (raw.name as string | undefined)?.replace(/^@[^/]+\//, "");
  if (!name) throw new Error(`No "name" in ${root}/package.json`);
  if (!raw.version) throw new Error(`No "version" in ${root}/package.json`);
  return { root, name, version: raw.version };
}

/** The first directory from `start` up that holds a package.json. */
function nearestPackageRoot(start: string): string {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    if (path.dirname(dir) === dir) {
      throw new Error(`No package.json in ${start} or any directory above it`);
    }
  }
}
