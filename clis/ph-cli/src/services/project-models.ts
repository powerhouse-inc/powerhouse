import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import fs from "node:fs";
import path from "node:path";

/**
 * The project around a command and the document models it holds without a
 * host: what `ph mcp` and `ph mutate --create` build documents with.
 */

export const CONFIG_FILE = "powerhouse.config.json";

/** The nearest directory at or above `start` holding powerhouse.config.json. */
export function findProjectDir(start: string): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** The package names powerhouse.config.json lists, in its order. */
export function configPackageNames(projectDir: string): string[] {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(projectDir, CONFIG_FILE), "utf8"),
    ) as { packages?: { packageName?: unknown }[] };
    return (config.packages ?? [])
      .map((entry) => entry.packageName)
      .filter((name): name is string => typeof name === "string" && !!name);
  } catch {
    return [];
  }
}

/**
 * The document models of the packages powerhouse.config.json lists, loaded
 * from node_modules by the loader the project's Switchboard loads them with.
 * A package that is not installed, or ships no models, adds none; one that
 * fails to load is reported to `onError` and adds none.
 */
export async function configPackageModels(
  projectDir: string,
  onError?: (packageName: string, error: unknown) => void,
): Promise<DocumentModelModule[]> {
  const names = configPackageNames(projectDir);
  if (names.length === 0) return [];
  const { ImportPackageLoader, isExpectedLoaderMiss } =
    await import("@powerhousedao/reactor-api");
  const loader = new ImportPackageLoader(projectDir);
  const models: DocumentModelModule[] = [];
  for (const name of names) {
    try {
      models.push(...(await loader.loadDocumentModels(name)));
    } catch (error) {
      if (isExpectedLoaderMiss(error, name, "document-models")) continue;
      onError?.(name, error);
    }
  }
  return models;
}
