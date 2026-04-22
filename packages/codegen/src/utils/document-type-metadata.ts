import {
  DocumentModelGlobalStateSchema,
  type DocumentModelGlobalState,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelDocumentTypeMetadata } from "file-builders";
import { readdirSync, statSync } from "fs";
import { loadJsonFileSync } from "load-json-file";
import { getDocumentModelVariableNames } from "name-builders";
import { join } from "path";
import { filter, find, isString, map, pipe, prop, when } from "remeda";
import type { Project } from "ts-morph";
import { getOrCreateDirectory } from "utils";

type GetDocumentTypeMetadataArgs = {
  project: Project;
  documentModelId: string;
};
/** Gets the document model metadata for the --document-type argument
 * passed to the `generate --editor` and `generate --app` commands.
 */
export function getDocumentTypeMetadata({
  project,
  documentModelId,
}: GetDocumentTypeMetadataArgs) {
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();

  const documentModelVariableNames = pipe(
    readdirSync(documentModelsDirPath, { withFileTypes: true }),
    filter((dirent) => dirent.isDirectory()),
    map((dir) => join(dir.parentPath, `${dir.name}/${dir.name}.json`)),
    filter(
      (srcPath) =>
        statSync(srcPath, { throwIfNoEntry: false })?.isFile() ?? false,
    ),
    map((srcPath) => loadJsonFileSync(srcPath)),
    filter(
      (stateFile): stateFile is DocumentModelGlobalState =>
        DocumentModelGlobalStateSchema().safeParse(stateFile).success === true,
    ),
    find((state) => state.id === documentModelId),
    prop("name"),
    when(isString, (name) => getDocumentModelVariableNames(name)),
  );

  if (!documentModelVariableNames) {
    throw new Error(
      `Failed to get document type metadata for document type: ${documentModelId}.`,
    );
  }

  const { kebabCaseDocumentType, phDocumentTypeName } =
    documentModelVariableNames;

  const documentTypeMetadata: DocumentModelDocumentTypeMetadata = {
    documentModelId,
    documentModelDocumentTypeName: phDocumentTypeName,
    documentModelDirName: kebabCaseDocumentType,
    documentModelImportPath: join("document-models", kebabCaseDocumentType),
  };

  return documentTypeMetadata;
}
