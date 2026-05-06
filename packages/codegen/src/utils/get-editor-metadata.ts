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

export function getEditorMetadata(project: Project, dirName: string) {
  const { directory: editorDir } = getOrCreateDirectory(
    project,
    join("editors", dirName),
  );
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

  const appMetadata = pipe(
    project.getSourceFile(join("editors", dirName, "config.ts")),
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
