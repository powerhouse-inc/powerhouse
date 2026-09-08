import type { DocumentModelDocumentTypeMetadata } from "file-builders";
import { existsSync, readFileSync, readdirSync } from "fs";
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

type ManifestDocumentModel = {
  id: string;
  name: string;
};

function loadManifestDocumentModel(
  projectDir: string,
  documentModelId: string,
): ManifestDocumentModel | undefined {
  const manifestPath = join(projectDir, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return undefined;

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return undefined;
  }

  if (manifest === null || typeof manifest !== "object") return undefined;
  const documentModels = (manifest as { documentModels?: unknown })
    .documentModels;
  if (!Array.isArray(documentModels)) return undefined;

  return documentModels.find(
    (entry): entry is ManifestDocumentModel =>
      entry !== null &&
      typeof entry === "object" &&
      (entry as { id?: unknown }).id === documentModelId &&
      typeof (entry as { name?: unknown }).name === "string",
  );
}
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
  const projectDir = documentModelsDir.getParentOrThrow().getPath();

  const schemaFirstVariableNames = pipe(
    readdirSync(documentModelsDirPath, { withFileTypes: true }),
    map(loadDocumentModelInDir),
    filter(isDefined),
    filter((state) => isStrictEqual(state.id, documentModelId)),
    first(),
    prop("name"),
    when(isString, getDocumentModelVariableNames),
  );

  const manifestDocumentModel = loadManifestDocumentModel(
    projectDir,
    documentModelId,
  );
  const documentModelVariableNames =
    schemaFirstVariableNames ??
    (manifestDocumentModel
      ? getDocumentModelVariableNames(manifestDocumentModel.name)
      : undefined);

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
    authoringMode: schemaFirstVariableNames ? "schema-first" : "code-first",
  };

  return documentTypeMetadata;
}
