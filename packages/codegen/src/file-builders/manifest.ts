import type { Manifest } from "@powerhousedao/shared";
import { fileExists } from "@powerhousedao/shared/clis";
import { ManifestSchema } from "@powerhousedao/shared/document-model";
import { defaultManifest } from "file-builders";
import { loadJsonFile } from "load-json-file";
import { join } from "path";
import { mergeDeep, prop, uniqueBy } from "remeda";
import { writeJsonFile } from "write-json-file";

export async function getOrCreateManifestFile(
  manifestPath: string,
): Promise<Manifest> {
  const hasManifestFile = await fileExists(manifestPath);
  if (!hasManifestFile) {
    await writeJsonFile(manifestPath, defaultManifest);
  }
  const manifestFile = await loadJsonFile(manifestPath);
  return ManifestSchema.parse(manifestFile);
}

export async function createOrUpdateManifest(
  manifestData: Partial<Manifest>,
  projectDir: string,
) {
  const manifestPath = join(projectDir, "powerhouse.manifest.json");
  const manifestFile = await getOrCreateManifestFile(manifestPath);
  const updatedManifest = mergeDeep(manifestFile, manifestData);
  const {
    documentModels = [],
    editors = [],
    apps = [],
    processors = [],
    subgraphs = [],
    ...otherFields
  } = updatedManifest;
  const dedupedManifest = {
    ...otherFields,
    documentModels: uniqueBy(documentModels, prop("id")),
    editors: uniqueBy(editors, prop("id")),
    apps: uniqueBy(apps, prop("id")),
    processors: uniqueBy(processors, prop("id")),
    subgraphs: uniqueBy(subgraphs, prop("id")),
  };
  await writeJsonFile(manifestPath, dedupedManifest);
  return dedupedManifest;
}
