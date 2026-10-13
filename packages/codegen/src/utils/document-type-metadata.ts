import type { DocumentModelDocumentTypeMetadata } from "file-builders";
import { readdirSync } from "fs";
import { getDocumentModelVariableNames } from "name-builders";
import { posix } from "path";
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
/** The schema-first document model metadata for `documentModelId`, or
 * `undefined` when no `<dir>/<dir>.json` in `document-models` declares it.
 */
export function findDocumentTypeMetadata({
  project,
  documentModelId,
}: GetDocumentTypeMetadataArgs): DocumentModelDocumentTypeMetadata | undefined {
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

  if (!documentModelVariableNames) return undefined;

  const { kebabCaseDocumentType, phDocumentTypeName } =
    documentModelVariableNames;

  return {
    documentModelId,
    documentModelDocumentTypeName: phDocumentTypeName,
    documentModelDirName: kebabCaseDocumentType,
    documentModelImportPath: posix.join(
      "document-models",
      kebabCaseDocumentType,
    ),
  };
}

/** Gets the document model metadata for the --document-type argument
 * passed to the `generate --editor` and `generate --app` commands.
 */
export function getDocumentTypeMetadata(args: GetDocumentTypeMetadataArgs) {
  const documentTypeMetadata = findDocumentTypeMetadata(args);
  if (!documentTypeMetadata) {
    throw new Error(
      `Failed to get document type metadata for document type: ${args.documentModelId}.`,
    );
  }
  return documentTypeMetadata;
}
