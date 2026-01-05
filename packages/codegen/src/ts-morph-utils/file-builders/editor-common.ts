import { pascalCase } from "change-case";
import path from "path";
import type { Project } from "ts-morph";
import { documentEditorModuleFileTemplate } from "../templates/document-editor/module.js";
import { getOrCreateSourceFile } from "../ts-morph-project.js";

type MakeEditorModuleFileArgs = {
  project: Project;
  editorName: string;
  editorId: string;
  documentModelId?: string;
  editorDirPath: string;
  legacyMultipleDocumentTypes?: string[];
};
/** Generates the `module.ts` file for a document editor or drive editor */
export function makeEditorModuleFile({
  project,
  editorDirPath,
  editorName,
  documentModelId,
  editorId,
  legacyMultipleDocumentTypes,
}: MakeEditorModuleFileArgs) {
  if (documentModelId && !!legacyMultipleDocumentTypes) {
    throw new Error(
      "Cannot specify both documentModelId and legacyMultipleDocumentTypes",
    );
  }
  const filePath = path.join(editorDirPath, "module.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");

  const pascalCaseEditorName = pascalCase(editorName);
  const documentTypes = documentModelId
    ? `["${documentModelId}"]`
    : JSON.stringify(legacyMultipleDocumentTypes);

  const template = documentEditorModuleFileTemplate({
    editorName,
    editorId,
    pascalCaseEditorName,
    documentTypes,
  });
  sourceFile.replaceWithText(template);
  project.saveSync();
}
