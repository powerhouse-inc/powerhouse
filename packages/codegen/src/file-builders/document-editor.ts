import type {
  CommonGenerateEditorArgs,
  DocumentModelDocumentTypeMetadata,
} from "@powerhousedao/codegen";
import { createOrUpdateManifest } from "file-builders";
import {
  getDocumentModelVariableNames,
  getEditorVariableNames,
} from "name-builders";
import path from "path";
import {
  codeFirstDocumentEditorEditorFileTemplate,
  documentEditorEditorFileTemplate,
} from "templates";
import { type Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  findDocumentTypeMetadata,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
} from "utils";
import {
  emittedImportPath,
  findCodeFirstDocumentModelExport,
  unregisteredCodeFirstDefinitions,
  type CodeFirstDocumentModelExport,
} from "./document-model/code-first-aggregates.js";
import {
  makeEditorModuleFile,
  makeEditorsFile,
  makeEditorsIndexFile,
} from "./editor-common.js";

type GenerateEditorArgs = CommonGenerateEditorArgs & {
  documentModelId: string;
};
/** Generates a document editor for the given `documentModelId` (also called `documentType`) */
export async function tsMorphGenerateDocumentEditor({
  project,
  editorDir,
  editorName,
  editorId,
  documentModelId,
}: GenerateEditorArgs) {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const { directory: editorsDir } = getOrCreateDirectory(project, "editors");
  const editorsDirPath = editorsDir.getPath();
  const projectDir = editorsDir.getParentOrThrow().getPath();
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const componentsDirPath = path.join(editorDirPath, "components");

  await ensureDirectoriesExist(
    project,
    documentModelsDirPath,
    editorsDirPath,
    editorDirPath,
    componentsDirPath,
  );
  const documentModel = await resolveEditorDocumentModel(
    project,
    projectDir,
    documentModelId,
  );

  await makeEditorComponent({
    project,
    projectDir,
    editorDirPath,
    documentModel,
  });

  await makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId,
    editorDirPath,
  });

  await makeEditorsFile({ project, editorsDirPath });
  await makeEditorsIndexFile({ project, editorsDirPath });
  await createOrUpdateManifest(
    {
      editors: [
        {
          name: editorName,
          id: editorId,
          documentTypes: [documentModelId],
        },
      ],
    },
    projectDir,
  );
}

type EditorDocumentModel =
  | { kind: "schema-first"; metadata: DocumentModelDocumentTypeMetadata }
  | {
      kind: "code-first";
      documentModelId: string;
      model: CodeFirstDocumentModelExport;
    };

/** Schema-first models are found first, so a package without code-first
 * sources never starts the code-first loader.
 */
async function resolveEditorDocumentModel(
  project: Project,
  projectDir: string,
  documentModelId: string,
): Promise<EditorDocumentModel> {
  const metadata = findDocumentTypeMetadata({ project, documentModelId });
  if (metadata) return { kind: "schema-first", metadata };
  const model = await findCodeFirstDocumentModelExport(
    projectDir,
    documentModelId,
  );
  if (model) return { kind: "code-first", documentModelId, model };
  const unregistered = unregisteredCodeFirstDefinitions(projectDir)
    .filter(({ kind }) => kind === "document-model")
    .map(({ specifier }) => specifier);
  throw new Error(
    `Failed to get document type metadata for document type: ${documentModelId}.` +
      (unregistered.length === 0
        ? ""
        : ` If a code-first model declares it, register that model in definitionSources in powerhouse.config.json. Unregistered: ${unregistered.join(", ")}.`),
  );
}

function editorFileTemplate(
  documentModel: EditorDocumentModel,
  projectDir: string,
  editorDirPath: string,
) {
  switch (documentModel.kind) {
    case "schema-first": {
      const { metadata } = documentModel;
      return documentEditorEditorFileTemplate({
        ...getEditorVariableNames(metadata),
        documentModelImportPath: metadata.documentModelImportPath,
      });
    }
    case "code-first": {
      const { documentModelId, model } = documentModel;
      if (model.binding === undefined)
        throw new Error(
          `${model.specifier} exports version ${model.version} of ${documentModelId} only inside another value, so an editor cannot import it by name. Export that version by name from ${model.specifier}, as a reactor worker also imports a version by its export name.`,
        );
      const { phDocumentTypeName, actionTypeName } =
        getDocumentModelVariableNames(model.name);
      return codeFirstDocumentEditorEditorFileTemplate({
        exportName: model.binding.exportName,
        importPath: emittedImportPath(
          editorDirPath,
          projectDir,
          model.binding.specifier,
        ),
        documentTypeName: phDocumentTypeName,
        actionTypeName,
      });
    }
  }
}

type MakeEditorComponentArgs = {
  project: Project;
  projectDir: string;
  editorDirPath: string;
  documentModel: EditorDocumentModel;
};
async function makeEditorComponent({
  project,
  projectDir,
  editorDirPath,
  documentModel,
}: MakeEditorComponentArgs) {
  const filePath = path.join(editorDirPath, "editor.tsx");
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) {
    const functionDeclaration = sourceFile.getFunction("Editor");
    if (functionDeclaration) {
      if (!functionDeclaration.isDefaultExport()) {
        functionDeclaration.setIsDefaultExport(true);
      }
      return;
    }
  }

  sourceFile.replaceWithText(
    editorFileTemplate(documentModel, projectDir, editorDirPath),
  );
  await formatSourceFileWithPrettier(sourceFile);
}
