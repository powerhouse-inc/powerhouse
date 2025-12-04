import { paramCase } from "change-case";
import path from "path";
import type { Project } from "ts-morph";
import { generateDocumentModelZodSchemas } from "../../codegen/graphql.js";
import {
  documentModelModulesOutputFileName,
  documentModelModulesVariableName,
  documentModelModulesVariableType,
  documentModelModuleTypeName,
} from "../constants.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import {
  getDocumentModelDirName,
  getDocumentModelVariableNames,
  getLatestDocumentModelSpec,
  getLatestDocumentModelSpecVersionNumber,
} from "../name-builders/get-variable-names.js";
import { getInitialStates } from "../templates/unsafe-utils.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeGenDirFiles } from "./document-model/gen-dir.js";
import { makeRootDirFiles } from "./document-model/root-dir.js";
import { makeSrcDirFiles } from "./document-model/src-dir.js";
import type {
  DocumentModelFileMakerArgs,
  GenerateDocumentModelArgs,
} from "./document-model/types.js";
import { createOrUpdateVersionConstantsFile } from "./document-model/versions.js";
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
export async function tsMorphGenerateDocumentModel({
  projectDir,
  packageName,
  documentModelState,
}: GenerateDocumentModelArgs) {
  const project = buildTsMorphProject(projectDir);
  const { documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const documentModelDirName = getDocumentModelDirName(documentModelState);
  const documentModelDirPath = path.join(
    documentModelsDirPath,
    documentModelDirName,
  );
  ensureDirectoriesExist(project, documentModelsDirPath, documentModelDirPath);

  const specification = getLatestDocumentModelSpec(documentModelState);
  const version = getLatestDocumentModelSpecVersionNumber(documentModelState);

  const versionDirName = `v${version}`;

  const documentModelVersionDirName = path.join(
    documentModelDirName,
    versionDirName,
  );

  const documentModelVersionDirPath = path.join(
    documentModelDirPath,
    versionDirName,
  );

  const documentModelPackageImportPath = path.join(
    packageName,
    "document-models",
    documentModelDirName,
  );

  const versionedDocumentModelPackageImportPath = path.join(
    documentModelPackageImportPath,
    versionDirName,
  );

  const fileExtension = documentModelState.extension;
  const documentType = documentModelState.name;
  const documentTypeId = documentModelState.id;
  const documentModelVariableNames =
    getDocumentModelVariableNames(documentType);
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
    srcDirPath,
    reducersDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    ...moduleDirPaths,
  );

  const fileMakerArgs: DocumentModelFileMakerArgs = {
    project,
    projectDir,
    packageName,
    version,
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

  await generateDocumentModelZodSchemas(
    documentModelVersionDirPath,
    specification,
  );

  createOrUpdateVersionConstantsFile({
    project,
    version,
    documentModelDirPath,
  });

  makeRootDirFiles(fileMakerArgs);
  makeGenDirFiles(fileMakerArgs);
  makeSrcDirFiles(fileMakerArgs);
  makeDocumentModelModulesFile(fileMakerArgs);

  project.saveSync();
}

export function makeDocumentModelModulesFile({
  project,
  projectDir,
}: {
  project: Project;
  projectDir: string;
}) {
  const { documentModelsDirPath, documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  makeModulesFile({
    project,
    modulesDirPath: documentModelsDirPath,
    modulesSourceFilesPath: documentModelsSourceFilesPath,
    outputFileName: documentModelModulesOutputFileName,
    typeName: documentModelModuleTypeName,
    variableName: documentModelModulesVariableName,
    variableType: documentModelModulesVariableType,
  });
}
