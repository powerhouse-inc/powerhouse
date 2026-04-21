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
  writeAllGeneratedProjectFiles,
} from "file-builders";
import { cp, readdir, rm } from "fs/promises";
import npmFetch from "npm-registry-fetch";
import { join } from "path";
import { readPackage } from "read-pkg";
import {
  filter,
  fromKeys,
  isTruthy,
  keys,
  map,
  mapValues,
  merge,
  omit,
  pipe,
  prop,
} from "remeda";
import type { Project } from "ts-morph";
import { buildTsMorphProject, formatSourceFileWithPrettier } from "utils";
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
      const namedImports = map(
        importStatement.getNamedImports(),
        (importSpecifier) => importSpecifier.getText(),
      );
      const moduleSpecifier = importStatement.getModuleSpecifier();
      const moduleSpecifierText = moduleSpecifier.getLiteralText();
      if (moduleSpecifierText.includes(packageName)) {
        moduleSpecifier.setLiteralValue(
          moduleSpecifierText.replace(`${packageName}/`, ""),
        );
      }
      if (namedImports.includes("generateMock")) {
        moduleSpecifier.setLiteralValue("document-model");
      }
    }
  }
  await project.save();
}

export async function migrate(version: string, projectDir = process.cwd()) {
  const fullyQualifiedVersion =
    await getFullyQualifiedWorkspacePackageVersion(version);

  const packageJson = await readPackage({ cwd: projectDir });
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
    mapValues((value, key) =>
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
    mapValues((value, key) =>
      workspacePackageNames.includes(key) ? fullyQualifiedVersion : value,
    ),
  );
  console.log("Updating package.json...");
  await updatePackage(projectDir, {
    exports,
    scripts,
    dependencies,
    devDependencies,
  });
  // console.log("Moving unversioned document models...");
  // const documentModelsDir = join(projectDir, "document-models");
  // await moveLegacyDocumentModels(project, documentModelsDir);
  // await project.save();
  console.log("Overwriting project root files...");
  await writeAllGeneratedProjectFiles(projectDir);
  // await project.save();
  // console.log("Fixing legacy import paths...");
  // await fixLegacyImportPaths(project, packageJson.name);
  // await project.save();
  const project = buildTsMorphProject(projectDir);
  console.log("Re-generating code...");
  await generateAll(project);
  await project.save();
}

async function moveLegacyDocumentModels(
  project: Project,
  documentModelsDir: string,
) {
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
      new RegExp(`${documentModelDirName}.json`),
      /upgrades/,
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
    const projectVersionDir = project.addDirectoryAtPath(versionDir);
    project.addSourceFilesAtPaths(join(versionDir, "**/*.ts"));
    const versionDirSourceFiles = projectVersionDir.getDescendantSourceFiles();
    for (const sourceFile of versionDirSourceFiles) {
      const importStatements = sourceFile.getImportDeclarations();
      for (const importStatement of importStatements) {
        const moduleSpecifier = importStatement.getModuleSpecifier();
        const moduleSpecifierText = moduleSpecifier.getLiteralText();

        if (/^document-models\/.+/.test(moduleSpecifierText)) {
          moduleSpecifier.setLiteralValue(join(moduleSpecifierText, "v1"));
        }
      }
      await formatSourceFileWithPrettier(sourceFile);
    }
  }
}
