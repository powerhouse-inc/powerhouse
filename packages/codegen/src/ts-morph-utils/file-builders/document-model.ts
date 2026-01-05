import {
  buildTsMorphProject,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";
import { paramCase } from "change-case";
import type { DocumentModelGlobalState } from "document-model";
import { writeFileSync } from "fs";
import path from "path";
import { type Project } from "ts-morph";
import { generateDocumentModelZodSchemas } from "../../codegen/graphql.js";
import {
  getDocumentModelDirName,
  getDocumentModelVariableNames,
} from "../name-builders/get-variable-names.js";
import type { DocumentModelVariableNames } from "../name-builders/types.js";
import { getInitialStates } from "../templates/unsafe-utils.js";
import { makeGenDirFiles } from "./document-model/gen-dir.js";
import { makeRootDirFiles } from "./document-model/root-dir.js";
import { makeSrcDirFiles } from "./document-model/src-dir.js";
import type {
  DocumentModelFileMakerArgs,
  GenerateDocumentModelArgs,
} from "./document-model/types.js";
import {
  createOrUpdateUpgradeManifestFile,
  createOrUpdateVersionConstantsFile,
  makeUpgradeFile,
  makeUpgradesIndexFile,
} from "./document-model/upgrades-dir.js";
import { makeModulesFile } from "./module-files.js";

function ensureDirectoriesExist(project: Project, ...pathsToEnsure: string[]) {
  for (const dirPath of pathsToEnsure) {
    const dir = project.getDirectory(dirPath);
    if (!dir) {
      project.createDirectory(dirPath);
      project.saveSync();
    }
  }
}

function makeDocumentModelIndexFile(args: {
  project: Project;
  documentModelDirPath: string;
  latestVersion: number;
}) {
  const { project, documentModelDirPath, latestVersion } = args;

  const filePath = path.join(documentModelDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");
  sourceFile.addExportDeclarations([
    { moduleSpecifier: `./v${latestVersion}/index.js` },
    { moduleSpecifier: `./upgrades/index.js` },
  ]);

  formatSourceFileWithPrettier(sourceFile);
}

function writeDocumentModelStateJsonFile({
  documentModelState,
  documentModelDirName,
  documentModelDirPath,
}: {
  documentModelState: DocumentModelGlobalState;
  documentModelDirPath: string;
  documentModelDirName: string;
}) {
  const filePath = path.join(
    documentModelDirPath,
    `${documentModelDirName}.json`,
  );
  const documentModelStateJson = JSON.stringify(documentModelState, null, 2);
  writeFileSync(filePath, documentModelStateJson);
}

type GenerateDocumentModelFromSpecArgs = {
  project: Project;
  version: number;
  useVersioning: boolean;
  packageName: string;
  documentModelState: DocumentModelGlobalState;
  projectDir: string;
  documentModelPackageImportPath: string;
  documentModelsDirPath: string;
  documentModelDirName: string;
  documentModelDirPath: string;
} & DocumentModelVariableNames;
async function generateDocumentModelForSpec({
  project,
  projectDir,
  packageName,
  documentModelState,
  documentModelPackageImportPath,
  documentModelsDirPath,
  documentModelDirName,
  documentModelDirPath,
  useVersioning,
  version,
  ...documentModelVariableNames
}: GenerateDocumentModelFromSpecArgs) {
  const specification = documentModelState.specifications.find(
    (spec) => spec.version === version,
  );

  if (!specification) {
    throw new Error(
      `Document model specifications array is misconfigured, no specification found for version: ${version}`,
    );
  }

  const versionDirName = useVersioning ? `v${version}` : "";

  const documentModelVersionDirName = path.join(
    documentModelDirName,
    versionDirName,
  );

  const documentModelVersionDirPath = path.join(
    documentModelDirPath,
    versionDirName,
  );

  const versionedDocumentModelPackageImportPath = path.join(
    documentModelPackageImportPath,
    versionDirName,
  );

  const fileExtension = documentModelState.extension;
  const documentTypeId = documentModelState.id;
  const srcDirPath = path.join(documentModelVersionDirPath, "src");
  const reducersDirPath = path.join(srcDirPath, "reducers");
  const testsDirPath = path.join(srcDirPath, "tests");
  const genDirPath = path.join(documentModelVersionDirPath, "gen");
  const schemaDirPath = path.join(genDirPath, "schema");
  const { initialGlobalState, initialLocalState } = getInitialStates(
    specification.state,
  );
  const hasLocalSchema = specification.state.local.schema !== "";
  const modules = specification.modules;
  const moduleDirPaths = modules.map((module) =>
    path.join(genDirPath, paramCase(module.name)),
  );

  ensureDirectoriesExist(
    project,
    documentModelVersionDirPath,
    reducersDirPath,
    testsDirPath,
    schemaDirPath,
    ...moduleDirPaths,
  );

  const fileMakerArgs: DocumentModelFileMakerArgs = {
    project,
    projectDir,
    packageName,
    version,
    useVersioning,
    documentTypeId,
    documentModelState,
    initialGlobalState,
    initialLocalState,
    modules,
    hasLocalSchema,
    documentModelsDirPath,
    documentModelDirPath,
    documentModelDirName,
    documentModelVersionDirName,
    documentModelVersionDirPath,
    documentModelPackageImportPath,
    versionedDocumentModelPackageImportPath,
    srcDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    reducersDirPath,
    fileExtension,
    ...documentModelVariableNames,
  };

  await generateDocumentModelZodSchemas({
    documentModelDirPath: documentModelVersionDirPath,
    specification,
  });

  makeRootDirFiles(fileMakerArgs);
  makeGenDirFiles(fileMakerArgs);
  makeSrcDirFiles(fileMakerArgs);
  makeDocumentModelModulesFile(fileMakerArgs);

  if (!useVersioning) return;

  const previousVersionDirPath = getPreviousVersionDirPath(
    documentModelDirPath,
    version,
  );

  if (!previousVersionDirPath) return;

  persistCustomFilesFromPreviousVersion({
    project,
    currentVersionDirPath: documentModelVersionDirPath,
    previousVersionDirPath,
  });
}

export async function tsMorphGenerateDocumentModel({
  projectDir,
  packageName,
  documentModelState,
  useVersioning,
}: GenerateDocumentModelArgs) {
  const project = buildTsMorphProject(projectDir);
  const documentModelsSourceFilesPath = path.join(
    projectDir,
    "document-models/**/*",
  );
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const documentModelDirName = getDocumentModelDirName(documentModelState);
  const documentModelDirPath = path.join(
    documentModelsDirPath,
    documentModelDirName,
  );
  const documentModelVariableNames = getDocumentModelVariableNames(
    documentModelState.name,
  );
  ensureDirectoriesExist(project, documentModelsDirPath, documentModelDirPath);

  const upgradesDirPath = path.join(documentModelDirPath, "upgrades");

  if (useVersioning) {
    ensureDirectoriesExist(project, upgradesDirPath);
  }

  const documentModelPackageImportPath = path.join(
    packageName,
    "document-models",
    documentModelDirName,
  );

  const specVersions = [
    ...new Set([
      ...documentModelState.specifications.map((spec) => spec.version),
    ]),
  ].toSorted();

  if (specVersions.length !== documentModelState.specifications.length) {
    throw new Error(
      "Document model specifications array is misconfigured. Length is not match with spec versions.",
    );
  }

  const latestVersion = specVersions[specVersions.length - 1];
  if (
    documentModelState.specifications[
      documentModelState.specifications.length - 1
    ].version !== latestVersion
  ) {
    throw new Error(
      "Document model has incorrect version at the latest version index",
    );
  }

  writeDocumentModelStateJsonFile({
    documentModelState,
    documentModelDirName,
    documentModelDirPath,
  });

  if (useVersioning) {
    await Promise.all(
      specVersions.map(
        async (version) =>
          await generateDocumentModelForSpec({
            project,
            version,
            useVersioning: true,
            packageName,
            documentModelState,
            projectDir,
            documentModelsDirPath,
            documentModelDirName,
            documentModelDirPath,
            documentModelPackageImportPath,
            ...documentModelVariableNames,
          }),
      ),
    );

    for (const version of specVersions) {
      makeUpgradeFile({
        version,
        upgradesDirPath,
        project,
        documentModelPackageImportPath,
        ...documentModelVariableNames,
      });
    }

    makeDocumentModelIndexFile({
      project,
      documentModelDirPath,
      latestVersion,
    });

    createOrUpdateVersionConstantsFile({
      project,
      specVersions,
      latestVersion,
      upgradesDirPath,
    });

    createOrUpdateUpgradeManifestFile({
      project,
      specVersions,
      latestVersion,
      upgradesDirPath,
      documentModelId: documentModelState.id,
      ...documentModelVariableNames,
    });

    makeUpgradesIndexFile({ project, upgradesDirPath, specVersions });
  } else {
    await generateDocumentModelForSpec({
      project,
      useVersioning: false,
      version: latestVersion,
      packageName,
      documentModelState,
      projectDir,
      documentModelsDirPath,
      documentModelDirName,
      documentModelDirPath,
      documentModelPackageImportPath,
      ...documentModelVariableNames,
    });
  }

  project.saveSync();
}

export function makeDocumentModelModulesFile({
  project,
  projectDir,
}: {
  project: Project;
  projectDir: string;
}) {
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const documentModelsSourceFilesPath = path.join(
    documentModelsDirPath,
    "/**/*",
  );
  makeModulesFile({
    project,
    modulesDirPath: documentModelsDirPath,
    modulesSourceFilesPath: documentModelsSourceFilesPath,
    outputFileName: "document-models.ts",
    typeName: "DocumentModelModule",
    variableName: "documentModels",
    variableType: "DocumentModelModule<any>[]",
  });
}

function getPreviousVersionDirPath(
  documentModelDirPath: string,
  version: number,
) {
  const previousVersion = version - 1;
  if (previousVersion < 1) return;

  const previousVersionDirName = `v${previousVersion}`;

  return path.join(documentModelDirPath, previousVersionDirName);
}

type PersistCustomFilesFromPreviousVersionArgs = {
  project: Project;
  currentVersionDirPath: string;
  previousVersionDirPath: string;
};
function persistCustomFilesFromPreviousVersion(
  args: PersistCustomFilesFromPreviousVersionArgs,
) {
  const { project, currentVersionDirPath, previousVersionDirPath } = args;
  const currentVersionDir = project.getDirectoryOrThrow(currentVersionDirPath);

  const previousVersionDir = project.getDirectory(previousVersionDirPath);

  if (!previousVersionDir) return;

  const currentVersionSourceFiles =
    currentVersionDir.getDescendantSourceFiles();
  const previousVersionSourceFiles =
    previousVersionDir.getDescendantSourceFiles();
  const currentVersionDirs = currentVersionDir.getDescendantDirectories();
  const previousVersionDirs = previousVersionDir.getDescendantDirectories();

  const previousVersionRelativeDirPaths = previousVersionDirs.map((d) =>
    previousVersionDir.getRelativePathTo(d),
  );
  const currentVersionRelativeDirPaths = currentVersionDirs.map((d) =>
    currentVersionDir.getRelativePathTo(d),
  );

  const missingDirPaths = previousVersionRelativeDirPaths.filter(
    (p) => !currentVersionRelativeDirPaths.includes(p),
  );

  const missingDirs = previousVersionDirs.filter((f) =>
    missingDirPaths.includes(previousVersionDir.getRelativePathTo(f)),
  );

  for (const dir of missingDirs) {
    const relativePath = previousVersionDir.getRelativePathTo(dir);
    const newDir = currentVersionDir.createDirectory(relativePath);
    newDir.saveSync();
  }

  const previousVersionRelativeFilePaths = previousVersionSourceFiles.map((f) =>
    previousVersionDir.getRelativePathTo(f),
  );
  const currentVersionRelativeFilePaths = currentVersionSourceFiles.map((f) =>
    currentVersionDir.getRelativePathTo(f),
  );

  const missingFilePaths = previousVersionRelativeFilePaths.filter(
    (p) => !currentVersionRelativeFilePaths.includes(p),
  );

  const missingFiles = previousVersionSourceFiles.filter((f) =>
    missingFilePaths.includes(previousVersionDir.getRelativePathTo(f)),
  );

  for (const file of missingFiles) {
    const relativePath = previousVersionDir.getRelativePathTo(file);
    const fileText = file.getText();
    const newFile = currentVersionDir.createSourceFile(relativePath, fileText);
    newFile.saveSync();
  }
}
