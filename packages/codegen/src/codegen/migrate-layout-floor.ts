import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { documentModelsDirOf } from "../utils/document-models-dir.js";

const isDirectory = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;

/** The document models still on the 5.x layout: a model folder holding
 * `<name>.json` with `src/` or `gen/` beside it and no `v1/`. */
export function unversionedDocumentModels(projectDir: string): string[] {
  const modelsDir = documentModelsDirOf(projectDir).path;
  if (!isDirectory(modelsDir)) return [];
  return readdirSync(modelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const dir = join(modelsDir, name);
      return (
        existsSync(join(dir, `${name}.json`)) &&
        (isDirectory(join(dir, "src")) || isDirectory(join(dir, "gen"))) &&
        !isDirectory(join(dir, "v1"))
      );
    })
    .sort();
}

/** `ph migrate` supports the versioned document-model layout (6.0.0 and
 * later). A 5.x project is moved to it by the 6.2.2 `ph migrate`. */
export function assertVersionedDocumentModels(projectDir: string): void {
  const unversioned = unversionedDocumentModels(projectDir);
  if (unversioned.length === 0) return;
  throw new Error(
    `This project has document models on the 5.x layout (no v1/ folder): ${unversioned.join(", ")}. ` +
      "Run the 6.2.2 `ph migrate` first (for example `npx @powerhousedao/ph-cli@6.2.2 migrate 6.2.2`), then run this one again. Nothing was written.",
  );
}
