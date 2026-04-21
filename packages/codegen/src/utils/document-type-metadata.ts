import {
  DocumentModelGlobalStateSchema,
  type DocumentModelGlobalState,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelDocumentTypeMetadata } from "file-builders";
import { loadJsonFileSync } from "load-json-file";
import { getDocumentModelVariableNames } from "name-builders";
import { join } from "path";
import {
  filter,
  find,
  flatMap,
  isString,
  isTruthy,
  map,
  pipe,
  prop,
  when,
} from "remeda";
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

  const documentModelVariableNames = pipe(
    documentModelsDir.getDirectories(),
    flatMap((dir) => dir.getSourceFile(`${dir.getBaseName()}.json`)),
    filter(isTruthy),
    map((file) => file.getFilePath()),
    map((path) => loadJsonFileSync(path)),
    filter(
      (file): file is DocumentModelGlobalState =>
        DocumentModelGlobalStateSchema().safeParse(file).success === true,
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
