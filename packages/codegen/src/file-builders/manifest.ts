import type { Manifest, PowerhouseModule } from "@powerhousedao/shared";
import { fileExists } from "@powerhousedao/shared/clis";
import { ManifestSchema } from "@powerhousedao/shared/document-model";
import { defaultManifest } from "file-builders";
import { loadJsonFile } from "load-json-file";
import { join } from "path";
import { concat, merge, pipe, prop, uniqueBy } from "remeda";
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

function makeUpdatedModulesList(
  oldModules: PowerhouseModule[] = [],
  newModules: PowerhouseModule[] = [],
): PowerhouseModule[] {
  return pipe(concat(oldModules, newModules), uniqueBy(prop("id")));
}

export async function createOrUpdateManifest(
  manifestData: Partial<Manifest>,
  projectDir: string,
) {
  const manifestPath = join(projectDir, "powerhouse.manifest.json");
  const existingManifest = await getOrCreateManifestFile(manifestPath);

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
  };
  await writeJsonFile(manifestPath, updatedManifest);
  return updatedManifest;
}
