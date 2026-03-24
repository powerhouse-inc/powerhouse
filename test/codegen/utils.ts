import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { readdir } from "node:fs/promises";
import path from "path";

export function getDocumentModelJsonFilePath(
  basePath: string,
  dirName: string,
) {
  return path.join(basePath, dirName, `${dirName}.json`);
}

export async function loadDocumentModelsInDir(
  documentModelsInDir: string,
  testOutDir: string,
  useVersioning = true,
) {
  const documentModelsOutDir = path.join(testOutDir, "document-models");
  const documentModelDirs = (
    await readdir(documentModelsInDir, {
      withFileTypes: true,
    })
  )
    .filter((value) => value.isDirectory())
    .map((value) => value.name);

  const documentModelStates = await Promise.all(
    documentModelDirs.map(
      async (dirName) =>
        await loadDocumentModel(
          getDocumentModelJsonFilePath(documentModelsInDir, dirName),
        ),
    ),
  );

  for (const documentModelState of documentModelStates) {
    await generateDocumentModel({
      documentModelState,
      dir: documentModelsOutDir,
      useTsMorph: true,
      useVersioning,
      specifiedPackageName: "test-project",
    });
  }
}
