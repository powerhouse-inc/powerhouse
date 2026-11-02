import { pascalCase } from "change-case";
import path from "node:path";
import type { Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
  projectPath,
} from "utils";
import {
  codeFirstEditorModuleTemplate,
  codeFirstEditorTemplate,
} from "../templates/code-first/editor.js";
import { emittedImportPath } from "./document-model/code-first-aggregates.js";
import type { CodeFirstModel } from "./document-model/code-first-inventory.js";
import { makeEditorsFile, makeEditorsIndexFile } from "./editor-common.js";
import { createOrUpdateManifest } from "./manifest.js";

export async function generateCodeFirstDocumentEditor({
  project,
  editorDir,
  editorName,
  editorId,
  model,
}: {
  project: Project;
  editorDir: string;
  editorName: string;
  editorId: string;
  model: CodeFirstModel;
}) {
  const projectDir = projectPath(project, ".");
  const editorsDirPath = path.join(projectDir, "editors");
  const editorDirPath = path.join(editorsDirPath, editorDir);
  await ensureDirectoriesExist(project, editorsDirPath, editorDirPath);

  const editor = getOrCreateSourceFile(
    project,
    path.join(editorDirPath, "editor.tsx"),
  );
  const existingEditor = editor.alreadyExists
    ? editor.sourceFile.getFunction("Editor")
    : undefined;
  existingEditor?.setIsDefaultExport(true);
  const hasEditor = existingEditor !== undefined;
  const { binding } = model;
  if (binding === undefined && !hasEditor) {
    throw new Error(
      `${model.source.specifier} exports version ${model.version} of ${model.documentType} only inside another value, so an editor cannot import it. Export that version by name.`,
    );
  }

  if (binding !== undefined) {
    const imported = {
      exportName: binding.exportName,
      importPath: emittedImportPath(
        editorDirPath,
        projectDir,
        binding.specifier,
      ),
    };
    if (!hasEditor) {
      editor.sourceFile.replaceWithText(codeFirstEditorTemplate(imported));
      await formatSourceFileWithPrettier(editor.sourceFile);
    }
    const { sourceFile: moduleFile } = getOrCreateSourceFile(
      project,
      path.join(editorDirPath, "module.ts"),
    );
    moduleFile.replaceWithText(
      codeFirstEditorModuleTemplate({
        ...imported,
        editorName,
        pascalCaseEditorName: pascalCase(editorName),
        editorId,
        documentType: model.documentType,
      }),
    );
    await formatSourceFileWithPrettier(moduleFile);
  }

  await makeEditorsFile({ project, editorsDirPath });
  await makeEditorsIndexFile({ project, editorsDirPath });
  await createOrUpdateManifest(
    {
      editors: [
        { name: editorName, id: editorId, documentTypes: [model.documentType] },
      ],
    },
    projectDir,
  );
}
