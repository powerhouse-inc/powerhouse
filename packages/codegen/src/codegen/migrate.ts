import {
  VERSIONED_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import console from "console";
import {
  externalDependencies,
  externalDevDependencies,
  makePackageJsonExports,
  packageScripts,
  writeGeneratedProjectRootFiles,
} from "file-builders";
import { cp, readdir, rm } from "fs/promises";
import npmFetch from "npm-registry-fetch";
import path, { join } from "path";
import { readPackage } from "read-pkg";
import {
  filter,
  fromKeys,
  isTruthy,
  keys,
  map,
  mapKeys,
  merge,
  omit,
  pipe,
  prop,
} from "remeda";
import { Project } from "ts-morph";
import { updatePackage } from "write-package";
import { generateAll } from "./generate.js";

export async function getFullyQualifiedWorkspacePackageVersion(
  versionOrTag: string,
) {
  const isTag =
    versionOrTag === "latest" ||
    versionOrTag === "staging" ||
    versionOrTag === "dev";

  if (!isTag) return versionOrTag;
  const result = (await npmFetch.json(
    `${WORKSPACE_PACKAGES[0].manifest.name!}`,
  )) as { "dist-tags": Record<"latest" | "staging" | "dev", string> };
  return result["dist-tags"][versionOrTag];
}

export async function fixLegacyImportPaths(
  project: Project,
  packageName: string | undefined,
) {
  if (!packageName) {
    console.error("No package name found in package.json.");
    return;
  }
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const importStatements = sourceFile.getImportDeclarations();
    for (const importStatement of importStatements) {
      const moduleSpecifier = importStatement.getModuleSpecifier();
      const moduleSpecifierText = moduleSpecifier.getText();
      if (moduleSpecifierText.includes(packageName)) {
        moduleSpecifier.replaceWithText(
          moduleSpecifierText.replace(`${packageName}/`, ""),
        );
      }
    }
  }
  await project.save();
}

export async function migrate(args: { version: string }) {
  const { version } = args;

  const fullyQualifiedVersion =
    await getFullyQualifiedWorkspacePackageVersion(version);

  const packageJson = await readPackage();
  const exports = makePackageJsonExports();
  const scripts = merge(packageJson.scripts, packageScripts);
  const workspacePackageNames = filter(
    map(WORKSPACE_PACKAGES, prop("manifest", "name")),
    isTruthy,
  );
  const projectDependencyNames = [
    ...VERSIONED_DEPENDENCIES,
    ...keys(externalDependencies),
  ];
  const projectDevDependencyNames = [
    ...VERSIONED_DEV_DEPENDENCIES,
    ...keys(externalDevDependencies),
  ];
  const dependencies = pipe(
    packageJson.dependencies ?? {},
    // remove dev dependencies if they are in here
    omit(projectDevDependencyNames),
    merge({
      // use the fully qualified version we just got for these
      ...fromKeys(VERSIONED_DEPENDENCIES, () => fullyQualifiedVersion),
      // use the versions defined for the other deps we need to control
      ...externalDependencies,
    }),
    // use the fully qualified version for other workspace deps the user may have added
    mapKeys((key, value) =>
      workspacePackageNames.includes(key) ? fullyQualifiedVersion : value,
    ),
  );
  const devDependencies = pipe(
    packageJson.devDependencies ?? {},
    omit(projectDependencyNames),
    merge({
      ...fromKeys(VERSIONED_DEV_DEPENDENCIES, () => fullyQualifiedVersion),
      ...externalDevDependencies,
    }),
    mapKeys((key, value) =>
      workspacePackageNames.includes(key) ? fullyQualifiedVersion : value,
    ),
  );
  console.log("Updating package.json...");
  await updatePackage({
    exports,
    scripts,
    dependencies,
    devDependencies,
  });
  console.log("Overwriting project root files...");
  await writeGeneratedProjectRootFiles();
  console.log("Moving unversioned document models...");
  await moveLegacyDocumentModels();
  const project = new Project({
    tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
  });
  console.log("Fixing legacy import paths...");
  await fixLegacyImportPaths(project, packageJson.name);
  console.log("Re-generating document models with versioning if needed...");
  await generateAll({
    dir: process.cwd(),
    useVersioning: true,
  });
}

async function moveLegacyDocumentModels() {
  const documentModelsDir = join(process.cwd(), "document-models");
  const documentModelDirNames = map(
    filter(
      await readdir(documentModelsDir, { withFileTypes: true }),
      (dirent) => dirent.isDirectory(),
    ),
    (dir) => dir.name,
  );
  for (const documentModelDirName of documentModelDirNames) {
    const documentModelDir = join(documentModelsDir, documentModelDirName);
    const versionDir = join(documentModelDir, "v1");
    const toIgnore = [
      /^v\d+$/,
      /upgrades/,
      /index.ts/,
      new RegExp(`${documentModelDirName}.json`),
    ];
    const dirContents = await readdir(documentModelDir);
    const toCopy = filter(
      dirContents,
      (v) => !toIgnore.some((regex) => regex.test(v)),
    );
    for (const item of toCopy) {
      const itemSrc = join(documentModelDir, item);
      const itemDest = join(versionDir, item);
      await cp(itemSrc, itemDest, {
        recursive: true,
      });
      await rm(itemSrc, {
        recursive: true,
        force: true,
      });
    }
  }
}
