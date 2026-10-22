import { join } from "path";
import { isIncludedIn, merge, pipe } from "remeda";
import { type Project } from "ts-morph";
import {
  getBooleanPropertyValue,
  getOrCreateDirectory,
  getStringArrayPropertyElements,
  getStringPropertyValue,
} from "utils";
import { z } from "zod";

const EditorMetadataSchema = z.object({
  name: z.string(),
  id: z.string(),
  dirName: z.string(),
  documentTypes: z.array(z.string()),
});

/** Names of the `editors/` directories, on disk or in the project, that hold a `module.ts` */
export function getEditorDirNames(project: Project) {
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  // The project starts without files, so load the ones discovery reads.
  project.addSourceFilesAtPaths(join(editorsDir.getPath(), "*", "module.ts"));
  return editorsDir
    .getDirectories()
    .filter((dir) => dir.getSourceFile("module.ts"))
    .map((dir) => dir.getBaseName())
    .sort();
}

export function getEditorMetadata(project: Project, dirName: string) {
  const { directory: editorDir } = getOrCreateDirectory(
    project,
    join("editors", dirName),
  );
  project.addSourceFileAtPathIfExists(join(editorDir.getPath(), "module.ts"));
  const parsedMetadata = pipe(
    editorDir,
    (dir) => dir.getSourceFile("module.ts"),
    (sourceFile) => ({
      dirName: sourceFile?.getDirectory().getBaseName(),
      id: getStringPropertyValue(sourceFile, "id"),
      name: getStringPropertyValue(sourceFile, "name"),
      documentTypes: getStringArrayPropertyElements(
        sourceFile,
        "documentTypes",
      ),
    }),
    (data) => EditorMetadataSchema.safeParse(data),
  );

  if (parsedMetadata.success) return parsedMetadata.data;
  return undefined;
}

export function getAppMetadata(project: Project, dirName: string) {
  const editorMetadata = getEditorMetadata(project, dirName);
  if (
    !editorMetadata ||
    !isIncludedIn("powerhouse/document-drive", editorMetadata.documentTypes)
  )
    return undefined;

  const { directory: editorDir } = getOrCreateDirectory(
    project,
    join("editors", dirName),
  );
  const appMetadata = pipe(
    project.addSourceFileAtPathIfExists(join(editorDir.getPath(), "config.ts")),
    (sourceFile) => ({
      isDragAndDropEnabled: getBooleanPropertyValue(
        sourceFile,
        "isDragAndDropEnabled",
        true,
      ),
      allowedDocumentTypes: getStringArrayPropertyElements(
        sourceFile,
        "allowedDocumentTypes",
      ),
    }),
  );
  return merge(editorMetadata, appMetadata);
}
