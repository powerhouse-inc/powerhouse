import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import { directoryExists, fileExists } from "@powerhousedao/shared/clis";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { kebabCase } from "change-case";
import { createOrUpdateManifest } from "file-builders";
import { getDocumentModelVariableNames } from "name-builders";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { last, map, pipe, prop, sort, subtract, unique } from "remeda";
import { resolveModuleErrors } from "templates";
import type { Project } from "ts-morph";
import {
  ensureDirectoriesExist,
  formatJson,
  formatSourceFileWithPrettier,
  getInitialStates,
  getOrCreateDirectory,
  getOrCreateSourceFile,
  projectPath,
} from "utils";
import {
  documentModelImport,
  documentModelsDirOf,
} from "../../utils/document-models-dir.js";
import { generateDocumentModelZodSchemas } from "../../codegen/graphql.js";
import { assertProjectScalarsModuleExists } from "../../codegen/project-scalars.js";
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
  const projectDir = projectPath(project, ".");
  const models = documentModelsDirOf(projectDir);
  const { directory: documentModelsDir } = getOrCreateDirectory(
    project,
    models.path,
  );
  const documentModelsDirPath = documentModelsDir.getPath();
  assertProjectScalarsModuleExists({
    modelName: name,
    specifications,
    projectDir,
  });
  const documentModelDirName = kebabCase(name);
  const documentModelDirPath = join(
    documentModelsDirPath,
    documentModelDirName,
  );
  // Module specifiers, so always `/`.
  const documentModelImportPath = posix.join(
    "document-models",
    documentModelDirName,
  );
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

  // Throws on an error name defined with two codes, before anything is written.
  const errorWarnings = new Set(
    specifications.flatMap(({ modules }) =>
      modules.flatMap((module) => resolveModuleErrors(module).warnings),
    ),
  );
  for (const warning of errorWarnings) console.warn(`⚠ ${warning}`);

  await writeDocumentModelStateJsonFile({
    documentModelState,
    documentModelDirName,
    documentModelDirPath,
  });

  for (const specification of specifications) {
    const { version } = specification;
    const versionDirName = `v${version}`;
    const versionDirPath = join(documentModelDirPath, versionDirName);
    const versionImportPath = posix.join(
      documentModelImportPath,
      versionDirName,
    );
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
      importDocumentModel: (fromDir, ...segments) =>
        documentModelImport(models, fromDir, ...segments),
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
  await writeFile(
    filePath,
    await formatJson(`${documentModelDirName}.json`, documentModelState),
  );
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
