import {
  generateDocumentModel,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
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

export async function loadDocumentModelsInDir(inDir: string, outDir: string) {
  const documentModelDirs = (
    await readdir(inDir, {
      withFileTypes: true,
    })
  )
    .filter((value) => value.isDirectory())
    .map((value) => value.name);

  const documentModelStates = await Promise.all(
    documentModelDirs.map(
      async (dirName) =>
        await loadDocumentModel(getDocumentModelJsonFilePath(inDir, dirName)),
    ),
  );

  const cwd = process.cwd();
  process.chdir(outDir);
  const project = buildTsMorphProject(outDir);

  for (const documentModelState of documentModelStates) {
    await generateDocumentModel(documentModelState, project);
  }
  process.chdir(cwd);
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

export async function runEslint(cwd = process.cwd()) {
  await $`bun run --cwd ${cwd} eslint . --fix --quiet`;
}
