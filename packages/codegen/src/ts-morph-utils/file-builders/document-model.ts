import path from "path";
import type { Project } from "ts-morph";
import { generateDocumentModelZodSchemas } from "../../codegen/graphql.js";
import { TSMorphCodeGenerator } from "../../ts-morph-generator/index.js";
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
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeGenDirFiles } from "./document-model/gen-dir.js";
import { makeRootDirFiles } from "./document-model/root-dir.js";
import { makeSrcDirFiles } from "./document-model/src-dir.js";
import type { GenerateDocumentModelArgs } from "./document-model/types.js";
import { createOrUpdateVersionConstantsFile } from "./document-model/versions.js";
import { makeModulesFile } from "./module-files.js";

function ensureDirectoriesExist(project: Project, ...pathsToEnsure: string[]) {
  // const pathsToEnsure = [
  //   documentModelsDirPath,
  //   documentModelDirPath,
  //   srcDirPath,
  //   genDirPath,
  //   testsDirPath,
  //   schemaDirPath,
  //   ...moduleDirPaths,
  // ];

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

  const versionedDocumentModelDirName = path.join(
    documentModelDirName,
    // latestVersionDirName,
  );

  const versionedDocumentModelDirPath = path.join(
    documentModelDirPath,
    // latestVersionDirName,
  );

  const documentModelVariableNames = getDocumentModelVariableNames({
    packageName,
    versionedDocumentModelDirPath,
    documentModelDirName: versionedDocumentModelDirName,
    documentModelState,
  });

  const {
    srcDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    moduleDirPaths,
  } = documentModelVariableNames;

  ensureDirectoriesExist(
    project,
    versionedDocumentModelDirPath,
    srcDirPath,
    genDirPath,
    testsDirPath,
    schemaDirPath,
    ...moduleDirPaths,
  );

  const fileMakerArgs = {
    project,
    projectDir,
    packageName,
    documentModelDirPath: versionedDocumentModelDirPath,
    ...documentModelVariableNames,
  };

  await generateDocumentModelZodSchemas(
    versionedDocumentModelDirPath,
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

  const generator = new TSMorphCodeGenerator(
    projectDir,
    [documentModelState],
    packageName,
    {
      directories: { documentModelDir: "document-models" },
      forceUpdate: true,
    },
  );

  await generator.generateReducers();
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
