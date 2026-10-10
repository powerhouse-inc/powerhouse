import type { ConfigEntry, Manifest } from "@powerhousedao/shared";
import { defaultManifest, fileExists } from "@powerhousedao/shared/clis";
import { ManifestSchema } from "@powerhousedao/shared/document-model";
import { loadJsonFile } from "load-json-file";
import { dirname, join } from "path";
import { readPackage } from "read-pkg";
import {
  concat,
  filter,
  isIncludedIn,
  isPlainObject,
  isString,
  map,
  merge,
  pipe,
  prop,
  uniqueBy,
} from "remeda";
import { writeJsonFile } from "write-json-file";

const MANIFEST_FILE = "powerhouse.manifest.json";

export type ManifestFile = {
  raw: unknown;
  manifest: Manifest;
};

async function parseManifestFile(manifestPath: string): Promise<ManifestFile> {
  const raw = await loadJsonFile(manifestPath);
  const manifest = ManifestSchema.parse(raw);
  return { raw, manifest };
}

/**
 * Reads and validates the project's `powerhouse.manifest.json`. Returns
 * `undefined` when there is none. Throws `load-json-file`'s error when it is
 * not JSON, and the schema's `ZodError` when it is not a valid manifest.
 */
export async function readManifest(
  projectDir: string,
): Promise<ManifestFile | undefined> {
  const manifestPath = join(projectDir, MANIFEST_FILE);
  if (!(await fileExists(manifestPath))) return undefined;
  return await parseManifestFile(manifestPath);
}

async function newManifest(projectDir: string): Promise<Manifest> {
  const name = await readPackage({ cwd: projectDir, normalize: false }).then(
    (packageJson) => (isString(packageJson.name) ? packageJson.name : ""),
    () => "",
  );
  return { ...defaultManifest, name };
}

function keepUnknownKeys(parsed: unknown, raw: unknown): unknown {
  if (Array.isArray(parsed) && Array.isArray(raw)) {
    return parsed.map((value, index) => keepUnknownKeys(value, raw[index]));
  }
  if (isPlainObject(parsed) && isPlainObject(raw)) {
    return Object.fromEntries([
      ...Object.entries(parsed).map(([key, value]) => [
        key,
        keepUnknownKeys(value, raw[key]),
      ]),
      ...Object.entries(raw).filter(([key]) => !Object.hasOwn(parsed, key)),
    ]);
  }
  return parsed;
}

function withUnknownKeys({ raw, manifest }: ManifestFile): Manifest {
  return keepUnknownKeys(manifest, raw) as Manifest;
}

export async function getOrCreateManifestFile(
  manifestPath: string,
): Promise<Manifest> {
  const hasManifestFile = await fileExists(manifestPath);
  if (!hasManifestFile) {
    const seed = await newManifest(dirname(manifestPath));
    await writeJsonFile(manifestPath, seed, { indent: 2 });
  }
  const { manifest } = await parseManifestFile(manifestPath);
  return manifest;
}

// Generic over the entry: a `pieces` entry carries fields `PowerhouseModule`
// has no room for, and the widened return type would drop them.
function makeUpdatedModulesList<T extends { id: string }>(
  oldModules: T[] = [],
  newModules: T[] = [],
): T[] {
  return pipe(
    concat(oldModules, newModules),
    uniqueBy((module) => module.id),
  );
}
/* Updates the config field of powerhouse.manifest.json assuming unique `name` fields in the `ConfigEntry` objects */
function makeUpdatedConfig(
  oldConfig: ConfigEntry[] = [],
  newConfig: ConfigEntry[] = [],
) {
  return pipe(
    oldConfig,
    filter(({ name }) => !isIncludedIn(name, map(newConfig, prop("name")))),
    concat(newConfig),
    uniqueBy(prop("name")),
  );
}

/**
 * Removes entries from a manifest module list whose id is not in `validIds`.
 * Used by `generateAll<X>` to prune entries that no longer correspond to any
 * directory in the project (e.g. a module that was renamed or deleted). No-op
 * if the manifest file doesn't exist yet.
 */
export async function pruneManifestSection(
  projectDir: string,
  kind:
    | "documentModels"
    | "editors"
    | "apps"
    | "processors"
    | "subgraphs"
    | "pieces",
  validIds: readonly string[],
): Promise<void> {
  const manifestFile = await readManifest(projectDir);
  if (manifestFile === undefined) return;
  const manifest = withUnknownKeys(manifestFile);
  const existing = manifest[kind];
  // Nothing to prune if the section was never present.
  if (existing === undefined) return;
  const validSet = new Set(validIds);
  const filtered = existing.filter((entry) => validSet.has(entry.id));
  // Skip the write when nothing changed.
  if (filtered.length === existing.length) return;
  await writeJsonFile(
    join(projectDir, MANIFEST_FILE),
    { ...manifest, [kind]: filtered },
    { indent: 2, detectIndent: true },
  );
}

/* Creates a powerhouse.manifest.json file, or updates an existing one with the data provided */
export async function createOrUpdateManifest(
  manifestData: Partial<Manifest>,
  projectDir: string,
) {
  const manifestFile = await readManifest(projectDir);
  const existingManifest = manifestFile
    ? withUnknownKeys(manifestFile)
    : await getOrCreateManifestFile(join(projectDir, MANIFEST_FILE));

  const updatedManifest: Manifest = {
    ...existingManifest,
    ...manifestData,
    publisher: merge(existingManifest.publisher, manifestData.publisher),
    documentModels: makeUpdatedModulesList(
      existingManifest.documentModels,
      manifestData.documentModels,
    ),
    editors: makeUpdatedModulesList(
      existingManifest.editors,
      manifestData.editors,
    ),
    apps: makeUpdatedModulesList(existingManifest.apps, manifestData.apps),
    processors: makeUpdatedModulesList(
      existingManifest.processors,
      manifestData.processors,
    ),
    subgraphs: makeUpdatedModulesList(
      existingManifest.subgraphs,
      manifestData.subgraphs,
    ),
    // Materialized only when there is something to put in it: a project that
    // ships no piece should not grow an empty array on an unrelated run.
    ...(existingManifest.pieces !== undefined ||
    manifestData.pieces !== undefined
      ? {
          pieces: makeUpdatedModulesList(
            existingManifest.pieces,
            manifestData.pieces,
          ),
        }
      : {}),
    config: makeUpdatedConfig(existingManifest.config, manifestData.config),
  };
  await writeJsonFile(join(projectDir, MANIFEST_FILE), updatedManifest, {
    indent: 2,
    detectIndent: true,
  });
  return updatedManifest;
}
