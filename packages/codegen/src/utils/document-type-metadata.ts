import type { DocumentModelDocumentTypeMetadata } from "file-builders";
import { discoverDocumentModelDirectories } from "document-model/tooling";
import { join } from "node:path";
import { getDocumentModelVariableNames } from "name-builders";
import {
  filter,
  first,
  isDefined,
  isStrictEqual,
  isString,
  map,
  pipe,
  prop,
  when,
} from "remeda";
import type { Project } from "ts-morph";
import {
  getOrCreateDirectory,
  loadDocumentModelSpec,
  projectPath,
} from "utils";
import {
  documentModelImport,
  documentModelsDirOf,
} from "./document-models-dir.js";

type GetDocumentTypeMetadataArgs = {
  project: Project;
  documentModelId: string;
  /** The directory of the files that import the model; needed outside ./document-models. */
  importingDir?: string;
};
/** Gets the document model metadata for the --document-type argument
 * passed to the `generate --editor` and `generate --app` commands.
 */
export function getDocumentTypeMetadata({
  project,
  documentModelId,
  importingDir,
}: GetDocumentTypeMetadataArgs) {
  const models = documentModelsDirOf(projectPath(project, "."));
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    models.path,
  );
  const documentModelsDirPath = documentModelsDir.getPath();

  const documentModelVariableNames = pipe(
    discoverDocumentModelDirectories(
      projectPath(project, "."),
      documentModelsDirPath,
    ).directories,
    map((directory) =>
      directory.kind === "stored"
        ? loadDocumentModelSpec(
            join(projectPath(project, "."), directory.specification),
          )
        : undefined,
    ),
    filter(isDefined),
    filter((state) => isStrictEqual(state.id, documentModelId)),
    first(),
    prop("name"),
    when(isString, getDocumentModelVariableNames),
  );

  if (!documentModelVariableNames) {
    throw new Error(
      `Failed to get document type metadata for document type: ${documentModelId}.`,
    );
  }

  const { kebabCaseDocumentType, phDocumentTypeName, actionTypeName } =
    documentModelVariableNames;

  const documentTypeMetadata: DocumentModelDocumentTypeMetadata = {
    documentModelId,
    documentModelDocumentTypeName: phDocumentTypeName,
    documentModelActionTypeName: actionTypeName,
    documentModelDirName: kebabCaseDocumentType,
    documentModelImportPath: documentModelImport(
      models,
      importingDir ?? projectPath(project, "."),
      kebabCaseDocumentType,
    ),
  };

  return documentTypeMetadata;
}
