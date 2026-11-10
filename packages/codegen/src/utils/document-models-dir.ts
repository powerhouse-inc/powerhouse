import { POWERHOUSE_CONFIG_FILE } from "@powerhousedao/shared/clis";
import {
  formatDefinitionDiagnostic,
  resolveDocumentModelsDir,
} from "document-model/tooling";
import { existsSync, readFileSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { isPlainObject } from "remeda";

/** The directory a package's model directories live in, as discovery reads it. */
export type DocumentModelsDir = {
  /** Absolute. */
  readonly path: string;
  /** Whether it is `./document-models`, where the barrels and the path alias live. */
  readonly canonical: boolean;
};

/**
 * Resolves `documentModelsDir` from the package's config, as discovery does.
 * A missing config reads the default directory.
 */
export function documentModelsDirOf(projectDir: string): DocumentModelsDir {
  const configFile = join(projectDir, POWERHOUSE_CONFIG_FILE);
  let config: unknown = {};
  if (existsSync(configFile)) {
    try {
      config = JSON.parse(readFileSync(configFile, "utf8"));
    } catch (cause) {
      throw new Error(
        `Cannot read ${configFile}. Fix its JSON before generating.`,
        { cause },
      );
    }
  }
  const resolved = resolveDocumentModelsDir(
    projectDir,
    isPlainObject(config) ? config : {},
  );
  if (!resolved.ok) {
    throw new Error(formatDefinitionDiagnostic(resolved.diagnostic));
  }
  return {
    path: resolved.path,
    canonical:
      resolve(resolved.path) === resolve(projectDir, "document-models"),
  };
}

/**
 * How a file in `fromDir` imports `<documentModelsDir>/<segments>`: through
 * the package's `document-models/*` alias in the canonical directory, which
 * keeps generated code unchanged, and by relative path elsewhere, where no
 * alias exists.
 */
export function documentModelImport(
  models: DocumentModelsDir,
  fromDir: string,
  ...segments: string[]
): string {
  if (models.canonical) return posix.join("document-models", ...segments);
  const path = relative(
    fromDir,
    join(models.path, ...segments, "index.js"),
  ).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
}
