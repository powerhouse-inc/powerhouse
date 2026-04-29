import type { DocumentModelDocumentTypeMetadata } from "file-builders";
import { readdirSync } from "fs";
import { getDocumentModelVariableNames } from "name-builders";
import { join } from "path";
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
import { getOrCreateDirectory, loadDocumentModelInDir } from "utils";

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
    map(loadDocumentModelInDir),
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
