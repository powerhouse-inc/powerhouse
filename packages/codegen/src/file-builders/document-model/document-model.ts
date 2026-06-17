import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import { directoryExists, fileExists } from "@powerhousedao/shared/clis";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import { createOrUpdateManifest } from "file-builders";
import { getDocumentModelVariableNames } from "name-builders";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  capitalize,
  filter,
  forEach,
  isTruthy,
  last,
  map,
  pipe,
  prop,
  sort,
  subtract,
  unique,
  uniqueBy,
} from "remeda";
import { documentModelsTemplate, upgradeManifestsTemplate } from "templates";
import { SyntaxKind, type Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSourceFileWithPrettier,
  getInitialStates,
  getOrCreateDirectory,
  getOrCreateSourceFile,
  getVariableDeclarationByTypeName,
} from "utils";
import { generateDocumentModelZodSchemas } from "../../codegen/graphql.js";
import {
  makeDocumentModelDocumentTypeFile,
  makeDocumentModelGenActionsFile,
  makeDocumentModelGenControllerFile,
  makeDocumentModelGenCreatorsFile,
  makeDocumentModelGenDirOperationModulesFiles,
  makeDocumentModelGenDocumentModelFile,
  makeDocumentModelGenDocumentSchemaFile,
  makeDocumentModelGenIndexFile,
  makeDocumentModelGenPhFactoriesFile,
  makeDocumentModelGenReducerFile,
  makeDocumentModelGenTypesFile,
  makeDocumentModelGenUtilsFile,
  makeDocumentModelSchemaIndexFile,
} from "./gen-dir.js";
import {
  makeDocumentModelHooksFile,
  makeDocumentModelModuleFile,
  makeDocumentModelRootActionsFile,
  makeDocumentModelUtilsFile,
  makeDocumentModelVersionIndexFile,
} from "./root-dir.js";
import {
  makeDocumentModelSrcIndexFile,
  makeDocumentModelSrcUtilsFile,
  makeReducerOperationHandlersForModules,
} from "./src-dir.js";
import {
  makeDocumentModelModulesOperationTestFiles,
  makeDocumentModelTestFile,
} from "./tests-dir.js";
import {
  createOrUpdateUpgradeManifestFile,
  createOrUpdateVersionConstantsFile,
  makeUpgradeFile,
  makeUpgradesIndexFile,
} from "./upgrades-dir.js";

/** Generates a document model from the given `documentModelState`
 *
 * for each `specification` in the `documentModelState`
 */
export async function tsMorphGenerateDocumentModel(
  documentModelState: DocumentModelGlobalState,
  project: Project,
) {
  const { name, id, specifications } = documentModelState;
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    "document-models",
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  const projectDir = documentModelsDir.getParentOrThrow().getPath();
  const documentModelDirName = kebabCase(name);
  const documentModelDirPath = join(
    documentModelsDirPath,
    documentModelDirName,
  );
  const documentModelImportPath = join("document-models", documentModelDirName);
  const upgradesDirPath = join(documentModelDirPath, "upgrades");
  const documentModelVariableNames = getDocumentModelVariableNames(name);
  await ensureDirectoriesExist(
    project,
    documentModelsDirPath,
    documentModelDirPath,
    upgradesDirPath,
  );

  const versions = pipe(
    specifications,
    map(prop("version")),
    unique(),
    sort(subtract),
  );

  if (versions.length !== specifications.length) {
    throw new Error(
      "Document model specifications array is misconfigured. Length does not match with spec versions.",
    );
  }

  const latestVersion = Math.max(...versions);
  if (prop(last(specifications), "version") !== latestVersion) {
    throw new Error(
      "Document model has incorrect version at the latest version index",
    );
  }

  await writeDocumentModelStateJsonFile({
    documentModelState,
    documentModelDirName,
    documentModelDirPath,
  });

  for (const specification of specifications) {
    const { version } = specification;
    const versionDirName = `v${version}`;
    const versionDirPath = join(documentModelDirPath, versionDirName);
    const versionImportPath = join(documentModelImportPath, versionDirName);
    const srcDirPath = join(versionDirPath, "src");
    const testsDirPath = join(versionDirPath, "tests");
    const genDirPath = join(versionDirPath, "gen");
    const schemaDirPath = join(genDirPath, "schema");
    const { initialGlobalState, initialLocalState } = getInitialStates(
      specification.state,
    );
    const hasLocalSchema = specification.state.local.schema !== "";

    const fileMakerArgs: DocumentModelFileMakerArgs = {
      ...documentModelVariableNames,
      project,
      documentModelState,
      version,
      versions,
      latestVersion,
      specification,
      initialGlobalState,
      initialLocalState,
      hasLocalSchema,
      projectDir,
      documentModelsDirPath,
      documentModelDirPath,
      documentModelDirName,
      documentModelImportPath,
      versionDirPath,
      versionDirName,
      versionImportPath,
      genDirPath,
      schemaDirPath,
      srcDirPath,
      testsDirPath,
      upgradesDirPath,
    };

    // /{document-model-dir}/v{version}/
    await generateDocumentModelZodSchemas(fileMakerArgs);
    await makeDocumentModelVersionIndexFile(fileMakerArgs);
    await makeDocumentModelRootActionsFile(fileMakerArgs);
    await makeDocumentModelUtilsFile(fileMakerArgs);
    await makeDocumentModelHooksFile(fileMakerArgs);
    await makeDocumentModelModuleFile(fileMakerArgs);

    // /{document-model-dir}/v{version}/gen/
    await makeDocumentModelSchemaIndexFile(fileMakerArgs);
    await makeDocumentModelGenUtilsFile(fileMakerArgs);
    await makeDocumentModelGenTypesFile(fileMakerArgs);
    await makeDocumentModelGenCreatorsFile(fileMakerArgs);
    await makeDocumentModelGenActionsFile(fileMakerArgs);
    await makeDocumentModelGenDocumentSchemaFile(fileMakerArgs);
    await makeDocumentModelGenReducerFile(fileMakerArgs);
    await makeDocumentModelDocumentTypeFile(fileMakerArgs);
    await makeDocumentModelGenIndexFile(fileMakerArgs);
    await makeDocumentModelGenDocumentModelFile(fileMakerArgs);
    await makeDocumentModelGenPhFactoriesFile(fileMakerArgs);
    await makeDocumentModelGenControllerFile(fileMakerArgs);
    await makeDocumentModelGenDirOperationModulesFiles(fileMakerArgs);

    // /{document-model-dir}/v{version}/src/
    await makeDocumentModelSrcIndexFile(fileMakerArgs);
    await makeDocumentModelSrcUtilsFile(fileMakerArgs);
    await makeReducerOperationHandlersForModules(fileMakerArgs);

    // /{document-model-dir}/v{version}/tests
    await makeDocumentModelTestFile(fileMakerArgs);
    await makeDocumentModelModulesOperationTestFiles(fileMakerArgs);

    // /{document-model-dir}/v{version}/*
    await persistCustomFilesFromPreviousVersion(fileMakerArgs);

    // /{document-model-dir}/upgrades/v{version}.ts
    await makeUpgradeFile(fileMakerArgs);

    // /{document-model-dir}/upgrades/upgrade-manifest.ts
    await createOrUpdateUpgradeManifestFile(fileMakerArgs);
  }

  // /upgrades/versions.ts
  await createOrUpdateVersionConstantsFile({
    project,
    versions,
    latestVersion,
    upgradesDirPath,
  });

  // /{document-model-dir}/upgrades/index.ts
  await makeUpgradesIndexFile({
    ...documentModelVariableNames,
    project,
    versions,
    upgradesDirPath,
  });
  // /document-models/{document-model-dir}/index.ts
  await makeDocumentModelIndexFile({
    project,
    documentModelDirPath,
    latestVersion,
  });
  // skipAddingFilesFromTsConfig leaves other models out of the project; add
  // the files the aggregates scan so every model is included, not just the new one.
  project.addSourceFilesAtPaths([
    join(documentModelsDirPath, "**", "module.ts"),
    join(documentModelsDirPath, "**", "upgrade-manifest.ts"),
  ]);
  // /document-models/document-models.ts
  await makeDocumentModelsFile({ project, documentModelsDirPath });
  // /document-models/index.ts
  await makeDocumentModelsIndexFile({ project, documentModelsDirPath });
  // /document-models/upgrade-manifests.ts
  await makeUpgradeManifestsFile({ project, documentModelsDirPath });
  await createOrUpdateManifest(
    {
      documentModels: [
        {
          name,
          id,
        },
      ],
    },
    projectDir,
  );
}

async function makeUpgradeManifestsFile(args: {
  project: Project;
  documentModelsDirPath: string;
}) {
  const { project, documentModelsDirPath } = args;
  const sourceFile = project.createSourceFile(
    join(documentModelsDirPath, "upgrade-manifests.ts"),
    upgradeManifestsTemplate,
    { overwrite: true },
  );

  const upgradeManifestsArray = sourceFile
    .getVariableDeclarationOrThrow("upgradeManifests")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  pipe(
    project.getSourceFiles(),
    // find the upgrade manifest files for each document model
    filter((sourceFile) => sourceFile.getBaseName() === "upgrade-manifest.ts"),
    // get the upgrade manifest objects
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "UpgradeManifest"),
    ),
    filter(isTruthy),
    // get name and dir for adding to upgradeManifests array and making import specifier
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      // the upgrade-manifest.ts file lives in `document-models/{document-model-dir}/upgrades`
      documentModelDir: variableDeclaration
        .getSourceFile()
        .getDirectory()
        .getParentOrThrow()
        .getBaseName(),
    })),
    uniqueBy(prop("name")),
    // make named imports and module specifier to add for each upgrade manifest
    map(({ name, documentModelDir }) => ({
      name,
      namedImports: [name],
      moduleSpecifier: join("document-models", documentModelDir, "upgrades"),
    })),
    // add import of each upgrade manifest and add it to the upgradeManifests array
    forEach(({ name, namedImports, moduleSpecifier }) => {
      sourceFile.addImportDeclaration({ namedImports, moduleSpecifier });
      upgradeManifestsArray.addElement(name);
    }),
  );

  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelsFile(args: {
  project: Project;
  documentModelsDirPath: string;
}) {
  const { project, documentModelsDirPath } = args;
  const sourceFile = project.createSourceFile(
    join(documentModelsDirPath, "document-models.ts"),
    documentModelsTemplate,
    { overwrite: true },
  );

  const documentModelsArray = sourceFile
    .getVariableDeclarationOrThrow("documentModels")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  pipe(
    project
      .getDirectoryOrThrow(documentModelsDirPath)
      .getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "module.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "DocumentModel"),
    ),
    filter(isTruthy),
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      directory: variableDeclaration.getSourceFile().getDirectory(),
    })),
    map(({ name, directory }) => ({
      name,
      version: directory.getBaseName(),
      documentModelDir: directory.getParentOrThrow().getBaseName(),
    })),
    filter(({ version }) => /^v\d+$/.test(version)),
    map(({ name, version, documentModelDir }) => ({
      name: `${name}${capitalize(version)}`,
      // imports the document model with the version appended to the name
      namedImports: [`${name} as ${name}${capitalize(version)}`],
      moduleSpecifier: join("document-models", documentModelDir, version),
    })),
    forEach(({ name, namedImports, moduleSpecifier }) => {
      sourceFile.addImportDeclaration({
        namedImports,
        moduleSpecifier,
      });
      documentModelsArray.addElement(name);
    }),
  );
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelsIndexFile(args: {
  project: Project;
  documentModelsDirPath: string;
}) {
  const { project, documentModelsDirPath } = args;
  const sourceFile = project.createSourceFile(
    join(documentModelsDirPath, "index.ts"),
    "",
    { overwrite: true },
  );
  pipe(
    project
      .getDirectoryOrThrow(documentModelsDirPath)
      .getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "module.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) =>
      getVariableDeclarationByTypeName(sourceFile, "DocumentModel"),
    ),
    filter(isTruthy),
    map((variableDeclaration) => ({
      name: variableDeclaration.getName(),
      directory: variableDeclaration.getSourceFile().getDirectory(),
    })),
    map(({ name, directory }) => ({
      name,
      version: directory.getBaseName(),
      documentModelDir: directory.getParentOrThrow().getBaseName(),
    })),
    filter(({ version }) => /^v\d+$/.test(version)),
    map(({ name, version, documentModelDir }) => ({
      // exports the document model with the version appended to the name
      namedExports: [`${name} as ${name}${capitalize(version)}`],
      moduleSpecifier: `./${documentModelDir}/${version}/module.js`,
    })),
    forEach(({ namedExports, moduleSpecifier }) => {
      sourceFile.addExportDeclaration({
        namedExports,
        moduleSpecifier,
      });
    }),
  );
  await formatSourceFileWithPrettier(sourceFile);
}

/** Writes a json file derived from a `documentModelState` */
async function writeDocumentModelStateJsonFile({
  documentModelState,
  documentModelDirName,
  documentModelDirPath,
}: {
  documentModelState: DocumentModelGlobalState;
  documentModelDirPath: string;
  documentModelDirName: string;
}) {
  const filePath = join(documentModelDirPath, `${documentModelDirName}.json`);
  const documentModelStateJson = JSON.stringify(documentModelState, null, 2);
  await writeFile(filePath, documentModelStateJson);
}

async function makeDocumentModelIndexFile(args: {
  project: Project;
  documentModelDirPath: string;
  latestVersion: number;
}) {
  const { project, documentModelDirPath, latestVersion } = args;

  const filePath = join(documentModelDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");
  sourceFile.addExportDeclarations([
    { moduleSpecifier: `./v${latestVersion}/index.js` },
    { moduleSpecifier: `./upgrades/index.js` },
  ]);

  await formatSourceFileWithPrettier(sourceFile);
}

async function persistCustomFilesFromPreviousVersion(
  args: DocumentModelFileMakerArgs,
) {
  const { version, documentModelDirPath } = args;
  const previousVersion = version - 1;
  if (previousVersion <= 1) return;

  const currentVersionDirName = `v${version}`;
  const previousVersionDirName = `v${previousVersion}`;

  if (currentVersionDirName === previousVersionDirName) return;

  const previousVersionDirPath = join(
    documentModelDirPath,
    previousVersionDirName,
  );
  const currentVersionDirPath = join(
    documentModelDirPath,
    currentVersionDirName,
  );
  const previousVersionDirExists = await directoryExists(
    previousVersionDirPath,
  );

  if (!previousVersionDirExists) return;

  const previousVersionDirContents = await readdir(previousVersionDirPath, {
    withFileTypes: true,
    recursive: true,
  });

  const previousVersionFiles = previousVersionDirContents
    .filter((dirEnt) => dirEnt.isFile())
    .map(({ name, parentPath }) => ({
      name,
      parentPath,
      relativePath: relative(previousVersionDirPath, parentPath),
    }));

  for (const { name, relativePath } of previousVersionFiles) {
    const filePathInCurrentVersionDir = join(
      currentVersionDirPath,
      relativePath,
      name,
    );
    const filePathInPreviousVersionDir = join(
      previousVersionDirPath,
      relativePath,
      name,
    );
    const existsInPreviousVersionDir = await fileExists(
      filePathInPreviousVersionDir,
    );
    const existsInCurrentVersionDir = await fileExists(
      filePathInCurrentVersionDir,
    );
    if (existsInPreviousVersionDir && !existsInCurrentVersionDir) {
      console.log(
        `Persisting file "${join(relativePath, name)}" from previous version directory.`,
      );
      await mkdir(join(currentVersionDirPath, relativePath), {
        recursive: true,
      });
      await copyFile(filePathInPreviousVersionDir, filePathInCurrentVersionDir);
    }
  }
}
