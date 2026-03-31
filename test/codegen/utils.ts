import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { $ } from "bun";
import type { PathLike } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
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
      useVersioning,
    });
  }
}

export async function cpForce(source: string | URL, destination: string | URL) {
  await cp(source, destination, {
    recursive: true,
    force: true,
  });
}

export async function rmForce(path: PathLike) {
  await rm(path, {
    recursive: true,
    force: true,
  });
}

export async function mkdirRecursive(path: PathLike) {
  await mkdir(path, { recursive: true });
}

export async function runTsc(cwd = process.cwd()) {
  await $`bun run --cwd ${cwd} tsc --noEmit`;
}
