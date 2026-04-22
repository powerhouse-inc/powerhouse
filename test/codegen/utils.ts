import { generateAllDocumentModels } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { $ } from "bun";
import { DocumentModelGlobalStateSchema } from "document-model";
import { loadJsonFileSync } from "load-json-file";
import { readdirSync, statSync, type PathLike } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import path from "path";
import { filter, map, pipe } from "remeda";
export function getDocumentModelJsonFilePath(
  basePath: string,
  dirName: string,
) {
  return path.join(basePath, dirName, `${dirName}.json`);
}

export async function loadDocumentModelsInDir(inDir: string, outDir: string) {
  const cwd = process.cwd();
  const data = pipe(
    readdirSync(inDir, { withFileTypes: true }),
    map((dir) => ({
      dir,
      srcPath: join(dir.parentPath, `${dir.name}/${dir.name}.json`),
      destPath: join(outDir, "document-models", `${dir.name}/${dir.name}.json`),
    })),
    filter(
      ({ srcPath }) =>
        statSync(srcPath, { throwIfNoEntry: false })?.isFile() ?? false,
    ),
    map(({ srcPath, ...data }) => ({
      ...data,
      srcPath,
      stateFile: loadJsonFileSync(srcPath),
    })),
    filter(
      ({ stateFile }) =>
        DocumentModelGlobalStateSchema().safeParse(stateFile).success === true,
    ),
  );

  for (const { srcPath, destPath } of data) {
    await cpForce(srcPath, destPath);
  }

  const project = buildTsMorphProject(outDir);
  await generateAllDocumentModels(project);
  await project.save();
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
