import { paramCase, pascalCase } from "change-case";
import type {
  DocumentModelGlobalState,
  ModuleSpecification,
} from "document-model";
import path from "path";
import { VariableDeclarationKind, type Project } from "ts-morph";
import {
  documentModelModulesOutputFileName,
  documentModelModulesVariableName,
  documentModelModulesVariableType,
  documentModelModuleTypeName,
} from "../constants.js";
import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../file-utils.js";
import {
  buildDocumentModelGenDirFilePath,
  buildDocumentModelRootDirFilePath,
  buildDocumentModelSrcDirFilePath,
} from "../name-builders/document-model-files.js";
import { getDocumentModelFilePaths } from "../name-builders/get-file-paths.js";
import {
  getDocumentModelOperationsModuleVariableNames,
  getDocumentModelVariableNames,
} from "../name-builders/get-variable-names.js";
import type { DocumentModelVariableNames } from "../name-builders/types.js";
import { buildObjectLiteral } from "../syntax-builders.js";
import { documentModelRootActionsFileTemplate } from "../templates/document-model/actions.js";
import { documentModelGenActionsFileTemplate } from "../templates/document-model/gen/actions.js";
import { documentModelGenCreatorsFileTemplate } from "../templates/document-model/gen/creators.js";
import { documentModelDocumentSchemaFileTemplate } from "../templates/document-model/gen/document-schema.js";
import { documentModelDocumentTypeTemplate } from "../templates/document-model/gen/document-type.js";
import { documentModelGenIndexFileTemplate } from "../templates/document-model/gen/index.js";
import { documentModelOperationModuleActionsFileTemplate } from "../templates/document-model/gen/modules/actions.js";
import { documentModelOperationsModuleCreatorsFileTemplate } from "../templates/document-model/gen/modules/creators.js";
import { documentModelOperationsModuleErrorFileTemplate } from "../templates/document-model/gen/modules/error.js";
import { documentModelOperationsModuleOperationsFileTemplate } from "../templates/document-model/gen/modules/operations.js";
import { documentModelPhFactoriesFileTemplate } from "../templates/document-model/gen/ph-factories.js";
import { documentModelGenReducerFileTemplate } from "../templates/document-model/gen/reducer.js";
import { documentModelSchemaIndexTemplate } from "../templates/document-model/gen/schema/index.js";
import { documentModelGenTypesTemplate } from "../templates/document-model/gen/types.js";
import { documentModelGenUtilsTemplate } from "../templates/document-model/gen/utils.js";
import { documentModelHooksFileTemplate } from "../templates/document-model/hooks.js";
import { documentModelIndexTemplate } from "../templates/document-model/index.js";
import { documentModelModuleFileTemplate } from "../templates/document-model/module.js";
import { documentModelSrcIndexFileTemplate } from "../templates/document-model/src/index.js";
import { documentModelTestFileTemplate } from "../templates/document-model/src/tests/document-model.test.js";
import { documentModelOperationsModuleTestFileTemplate } from "../templates/document-model/src/tests/module.test.js";
import { documentModelSrcUtilsTemplate } from "../templates/document-model/src/utils.js";
import { documentModelUtilsTemplate } from "../templates/document-model/utils.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeModulesFile } from "./module-files.js";

type GenerateDocumentModelArgs = {
  projectDir: string;
  packageName: string;
  documentModelState: DocumentModelGlobalState;
};

type DocumentModelFileMakerArgs = DocumentModelVariableNames &
  GenerateDocumentModelArgs & {
    project: Project;
  };
export function tsMorphGenerateDocumentModel({
  projectDir,
  packageName,
  documentModelState,
}: GenerateDocumentModelArgs) {
  const project = buildTsMorphProject(projectDir);

  const { documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);

  const documentModelVariableNames = getDocumentModelVariableNames({
    packageName,
    projectDir,
    documentModelState,
  });

  const fileMakerArgs = {
    project,
    projectDir,
    packageName,
    ...documentModelVariableNames,
  };

  makeRootDirFiles(fileMakerArgs);
  makeGenDirFiles(fileMakerArgs);
  makeSrcDirFiles(fileMakerArgs);
  makeDocumentModelModulesFile(project, projectDir);

  project.saveSync();
}

function makeRootDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  const { documentModelDirPath, project } = fileMakerArgs;
  const dir = project.getDirectory(documentModelDirPath);

  if (!dir) {
    project.createDirectory(documentModelDirPath);
    project.saveSync();
  }

  makeDocumentModelIndexFile(fileMakerArgs);
  makeDocumentModelRootActionsFile(fileMakerArgs);
  makeDocumentModelModuleFile(fileMakerArgs);
  makeDocumentModelUtilsFile(fileMakerArgs);
}

function makeGenDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  const { documentModelDirPath, project } = fileMakerArgs;
  const genDirPath = path.join(documentModelDirPath, "gen");
  const dir = project.getDirectory(genDirPath);
  if (!dir) {
    project.createDirectory(genDirPath);
    project.saveSync();
  }
  makeDocumentModelSchemaIndexFile(fileMakerArgs);
  makeDocumentModelGenUtilsFile(fileMakerArgs);
  makeDocumentModelGenTypesFile(fileMakerArgs);
  makeDocumentModelGenCreatorsFile(fileMakerArgs);
  makeDocumentModelGenActionsFile(fileMakerArgs);
  makeDocumentModelGenDocumentSchemaFile(fileMakerArgs);
  makeDocumentModelGenReducerFile(fileMakerArgs);
  makeDocumentModelDocumentTypeFile(fileMakerArgs);
  makeDocumentModelGenIndexFile(fileMakerArgs);
  makeDocumentModelGenDocumentModelFile(fileMakerArgs);
  makeDocumentModelGenPhFactoriesFile(fileMakerArgs);

  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    const dirPath = path.join(genDirPath, paramCase(module.name));
    const dir = project.getDirectory(dirPath);
    if (!dir) {
      console.log("Creating dir:", dirPath);
      project.createDirectory(dirPath);
      project.saveSync();
    }
    console.log("Making module files for:", module.name, "in", dirPath);
    try {
      makeGenDirOperationModuleFiles({ ...fileMakerArgs, module });
    } catch (e) {
      console.error(e);
    }
  }
}

function makeGenDirOperationModuleFiles(
  fileMakerArgs: DocumentModelFileMakerArgs & { module: ModuleSpecification },
) {
  makeOperationModuleGenActionsFile(fileMakerArgs);
  makeOperationModuleGenCreatorsFile(fileMakerArgs);
  makeOperationModuleGenOperationsFile(fileMakerArgs);
  makeOperationModuleGenErrorFile(fileMakerArgs);
}

function makeSrcDirFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  const { documentModelDirPath, project } = fileMakerArgs;
  const srcDirPath = path.join(documentModelDirPath, "src");
  const dir = project.getDirectory(srcDirPath);
  if (!dir) {
    project.createDirectory(srcDirPath);
    project.saveSync();
  }
  makeDocumentModelSrcIndexFile(fileMakerArgs);
  makeDocumentModelSrcUtilsFile(fileMakerArgs);
  makeDocumentModelHooksFile(fileMakerArgs);
  makeSrcDirTestFiles(fileMakerArgs);
}

function makeSrcDirTestFiles(fileMakerArgs: DocumentModelFileMakerArgs) {
  const { documentModelDirPath, project } = fileMakerArgs;
  const testDirPath = path.join(documentModelDirPath, "src", "tests");
  const dir = project.getDirectory(testDirPath);
  if (!dir) {
    project.createDirectory(testDirPath);
    project.saveSync();
  }
  makeDocumentModelTestFile(fileMakerArgs);
  const modules = fileMakerArgs.modules;

  for (const module of modules) {
    makeOperationModuleTestFile({ ...fileMakerArgs, module });
  }
}

export function makeOperationModuleTestFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleTestFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { documentModelDirPath } = variableNames;
  const dirPath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "tests",
  );

  const filePath = path.join(dirPath, `${paramCaseModuleName}.test.ts`);

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelModulesFile(
  project: Project,
  projectDir: string,
) {
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

export function makeDocumentModelModuleFile({
  project,
  phStateName,
  pascalCaseDocumentType,
  documentModelDir,
  documentModelDirPath,
}: DocumentModelFileMakerArgs) {
  const template = documentModelModuleFileTemplate({
    phStateName,
    documentModelDir,
    pascalCaseDocumentType,
  });

  const moduleFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "module.ts",
  );
  const { sourceFile: documentModelModuleSourceFile } = getOrCreateSourceFile(
    project,
    moduleFilePath,
  );

  documentModelModuleSourceFile.replaceWithText(template);

  formatSourceFileWithPrettier(documentModelModuleSourceFile);
}

export function makeDocumentModelGenUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;
  const utilsFilePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );
  const { sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );
  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelUtilsTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const utilsFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );

  const { sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );
  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelIndexTemplate;
  const { documentModelDirPath } = variableNames;

  const indexFilePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile: indexSourceFile } = getOrCreateSourceFile(
    project,
    indexFilePath,
  );

  indexSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(indexSourceFile);
}

export function makeDocumentModelSrcUtilsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcUtilsTemplate;
  const { documentModelDirPath } = variableNames;

  const utilsFilePath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "utils.ts",
  );

  const { alreadyExists, sourceFile: utilsSourceFile } = getOrCreateSourceFile(
    project,
    utilsFilePath,
  );

  if (alreadyExists) return;

  utilsSourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(utilsSourceFile);
}

export function makeDocumentModelDocumentTypeFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentTypeTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "document-type.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelSrcIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcIndexFileTemplate;
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelTestFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelTestFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;
  const testsDirPath = buildDocumentModelSrcDirFilePath(
    documentModelDirPath,
    "tests",
  );

  const testsDir = project.getDirectory(testsDirPath);

  if (!testsDir) {
    project.createDirectory(testsDirPath);
  }

  const filePath = path.join(testsDirPath, "document-model.test.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelSchemaIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSchemaIndexTemplate;
  const { documentModelDirPath } = variableNames;

  const schemaDirPath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "schema",
  );
  const schemaDir = project.getDirectory(schemaDirPath);

  if (!schemaDir) {
    project.createDirectory(schemaDirPath);
    project.saveSync();
  }

  const filePath = path.join(schemaDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenTypesFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenTypesTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "types.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenDocumentModelFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const { documentModelDirPath, documentModelState } = variableNames;
  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "document-model.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);
  const printNode = buildNodePrinter(sourceFile);

  sourceFile.addImportDeclaration({
    namedImports: ["DocumentModelGlobalState"],
    moduleSpecifier: "document-model",
    isTypeOnly: true,
  });

  const objectLiteral = buildObjectLiteral(documentModelState);

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: "documentModel",
        type: "DocumentModelGlobalState",
        initializer: printNode(objectLiteral),
      },
    ],
  });

  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenDocumentSchemaFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelDocumentSchemaFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "document-schema.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenCreatorsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenCreatorsFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "creators.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenPhFactoriesFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelPhFactoriesFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "ph-factories.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenIndexFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "index.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenActionsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenActionsFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "actions.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelGenReducerFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelGenReducerFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    "reducer.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelHooksFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelHooksFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "hooks.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeDocumentModelRootActionsFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelRootActionsFileTemplate(variableNames);
  const { documentModelDirPath } = variableNames;

  const filePath = buildDocumentModelRootDirFilePath(
    documentModelDirPath,
    "actions.ts",
  );

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeOperationModuleGenActionsFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const { actions } = getDocumentModelOperationsModuleVariableNames(module);
  const pascalCaseModuleName = pascalCase(module.name);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationModuleActionsFileTemplate({
    ...variableNames,
    actions,
    pascalCaseModuleName,
  });
  const { documentModelDirPath } = variableNames;

  const dirPath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    paramCaseModuleName,
  );

  const dir = project.getDirectory(dirPath);

  if (!dir) {
    project.createDirectory(dirPath);
  }

  const filePath = path.join(dirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeOperationModuleGenCreatorsFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleCreatorsFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { documentModelDirPath } = variableNames;

  const dirPath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    paramCaseModuleName,
  );

  const dir = project.getDirectory(dirPath);

  if (!dir) {
    project.createDirectory(dirPath);
  }

  const filePath = path.join(dirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeOperationModuleGenOperationsFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleOperationsFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { documentModelDirPath } = variableNames;

  const dirPath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    paramCaseModuleName,
  );

  const dir = project.getDirectory(dirPath);

  if (!dir) {
    project.createDirectory(dirPath);
  }

  const filePath = path.join(dirPath, "operations.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}

export function makeOperationModuleGenErrorFile({
  project,
  module,
  ...variableNames
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const moduleVariableNames =
    getDocumentModelOperationsModuleVariableNames(module);
  const paramCaseModuleName = paramCase(module.name);
  const template = documentModelOperationsModuleErrorFileTemplate({
    ...variableNames,
    ...moduleVariableNames,
  });
  const { documentModelDirPath } = variableNames;

  const dirPath = buildDocumentModelGenDirFilePath(
    documentModelDirPath,
    paramCaseModuleName,
  );

  const dir = project.getDirectory(dirPath);

  if (!dir) {
    project.createDirectory(dirPath);
  }

  const filePath = path.join(dirPath, "error.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  formatSourceFileWithPrettier(sourceFile);
}
