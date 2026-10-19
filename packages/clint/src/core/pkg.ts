/**
 * Read CLI identity from the implementation project's package.json.
 *
 * ```ts
 * import { readPackageInfo } from '@powerhousedao/ph-clint';
 *
 * const pkg = readPackageInfo(import.meta.url);
 * export const CLI_ROOT = pkg.root;
 * export const CLI_NAME = pkg.name.replace(/-cli$/, '');
 * export const CLI_VERSION = pkg.version;
 * ```
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageInfo {
  /** Project root directory (parent of the `src/` file that called this). */
  root: string;
  /** Package name with `@scope/` stripped (e.g. `"foo-cli"` from `"@acme/foo-cli"`). */
  name: string;
  /** Package version as-is from package.json. */
  version: string;
}

/**
 * Read package identity from the nearest `package.json` above the calling
 * source file. Pass `import.meta.url` — the function resolves the project
 * root as the parent directory of the file's directory (i.e. `src/config.ts`
 * → project root is `..`).
 */
export function readPackageInfo(importMetaUrl: string): PackageInfo {
  const root = path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
  const raw = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const name = (raw.name as string | undefined)?.replace(/^@[^/]+\//, "");
  if (!name) throw new Error(`No "name" in ${root}/package.json`);
  if (!raw.version) throw new Error(`No "version" in ${root}/package.json`);
  return { root, name, version: raw.version };
}
