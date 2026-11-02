import { generateAllDocumentModels } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { $ } from "bun";
import { DocumentModelGlobalStateSchema } from "document-model";
import { loadJsonFileSync } from "load-json-file";
import { existsSync, readdirSync, statSync, type PathLike } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
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
  // git writes its objects read-only, so a copy over a copy replaces .git whole.
  const toPath = (p: string | URL) =>
    typeof p === "string" ? p : fileURLToPath(p);
  if (existsSync(join(toPath(source), ".git"))) {
    await rmForce(join(toPath(destination), ".git"));
  }
  await cp(source, destination, {
    recursive: true,
    force: true,
  });
}

export async function rmForce(path: PathLike) {
  // Tests chdir into the projects they generate, and Windows can't remove the cwd
  const target = path instanceof URL ? fileURLToPath(path) : path.toString();
  const fromTarget = relative(target, process.cwd());
  if (!fromTarget.startsWith("..") && !isAbsolute(fromTarget)) {
    process.chdir(dirname(target));
  }
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

/** Commits everything in `dir` to its own repo, as a project is before `ph migrate`. */
export async function commitProject(dir: string) {
  const git = [
    "-C",
    dir,
    "-c",
    "user.name=codegen-tests",
    "-c",
    "user.email=codegen-tests@powerhouse.invalid",
    "-c",
    "commit.gpgsign=false",
  ];
  await $`git ${git} init --quiet`;
  await $`git ${git} add --all`;
  await $`git ${git} commit --quiet --no-verify --allow-empty --message fixture`;
}
