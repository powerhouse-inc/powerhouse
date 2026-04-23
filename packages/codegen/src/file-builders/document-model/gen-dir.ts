import { kebabCase } from "change-case";
import type {
  DocumentModelFileMakerArgs,
  DocumentModelModuleFileMakerArgs,
} from "file-builders";
import path from "path";
import {
  documentModelDocumentSchemaFileTemplate,
  documentModelDocumentTypeTemplate,
  documentModelGenActionsFileTemplate,
  documentModelGenControllerFileTemplate,
  documentModelGenCreatorsFileTemplate,
  documentModelGenIndexFileTemplate,
  documentModelGenReducerFileTemplate,
  documentModelGenTypesTemplate,
  documentModelGenUtilsTemplate,
  documentModelOperationModuleActionsFileTemplate,
  documentModelOperationsModuleCreatorsFileTemplate,
  documentModelOperationsModuleErrorFileTemplate,
  documentModelOperationsModuleOperationsFileTemplate,
  documentModelPhFactoriesFileTemplate,
  documentModelSchemaIndexTemplate,
} from "templates";
import { VariableDeclarationKind } from "ts-morph";
import {
  buildObjectLiteral,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "utils";

export async function makeDocumentModelGenDirOperationModulesFiles(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  for (const module of fileMakerArgs.specification.modules) {
    await makeGenDirOperationModuleFiles({
      ...fileMakerArgs,
      module,
    });
  }
}

export async function makeGenDirOperationModuleFiles(
  fileMakerArgs: DocumentModelModuleFileMakerArgs,
) {
  await makeOperationModuleGenActionsFile(fileMakerArgs);
  await makeOperationModuleGenCreatorsFile(fileMakerArgs);
  await makeOperationModuleGenOperationsFile(fileMakerArgs);
  await makeOperationModuleGenErrorFile(fileMakerArgs);
}

export async function makeDocumentModelGenUtilsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenUtilsTemplate(args);
  const { project, genDirPath } = args;
  const utilsFilePath = path.join(genDirPath, "utils.ts");
  const { sourceFile } = getOrCreateSourceFile(project, utilsFilePath);
  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelDocumentTypeFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelDocumentTypeTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "document-type.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelSchemaIndexFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelSchemaIndexTemplate;
  const { project, schemaDirPath } = args;
  const filePath = path.join(schemaDirPath, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenTypesFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenTypesTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "types.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenDocumentModelFile(
  args: DocumentModelFileMakerArgs,
) {
  const { project, genDirPath, documentModelState } = args;
  const filePath = path.join(genDirPath, "document-model.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText("");

  sourceFile.addImportDeclaration({
    namedImports: ["DocumentModelGlobalState"],
    moduleSpecifier: "document-model",
    isTypeOnly: true,
  });

  const documentModelStateString = buildObjectLiteral(
    documentModelState,
    sourceFile,
  );

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: "documentModel",
        type: "DocumentModelGlobalState",
        initializer: documentModelStateString,
      },
    ],
  });

  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenDocumentSchemaFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelDocumentSchemaFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "document-schema.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenCreatorsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenCreatorsFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenPhFactoriesFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelPhFactoriesFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "ph-factories.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenControllerFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenControllerFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "controller.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenIndexFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenIndexFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenActionsFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenActionsFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeDocumentModelGenReducerFile(
  args: DocumentModelFileMakerArgs,
) {
  const template = documentModelGenReducerFileTemplate(args);
  const { project, genDirPath } = args;

  const filePath = path.join(genDirPath, "reducer.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeOperationModuleGenActionsFile(
  args: DocumentModelModuleFileMakerArgs,
) {
  const { module } = args;
  const kebabCaseModuleName = kebabCase(module.name);
  const template = documentModelOperationModuleActionsFileTemplate(args);
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, kebabCaseModuleName);
  const filePath = path.join(dirPath, "actions.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeOperationModuleGenCreatorsFile(
  args: DocumentModelModuleFileMakerArgs,
) {
  const { module } = args;
  const kebabCaseModuleName = kebabCase(module.name);
  const template = documentModelOperationsModuleCreatorsFileTemplate(args);
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, kebabCaseModuleName);
  const filePath = path.join(dirPath, "creators.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeOperationModuleGenOperationsFile(
  args: DocumentModelModuleFileMakerArgs,
) {
  const { module } = args;
  const kebabCaseModuleName = kebabCase(module.name);
  const template = documentModelOperationsModuleOperationsFileTemplate(args);
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, kebabCaseModuleName);
  const filePath = path.join(dirPath, "operations.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

export async function makeOperationModuleGenErrorFile(
  args: DocumentModelModuleFileMakerArgs,
) {
  const { module } = args;
  const kebabCaseModuleName = kebabCase(module.name);
  const template = documentModelOperationsModuleErrorFileTemplate(args);
  const { project, genDirPath } = args;

  const dirPath = path.join(genDirPath, kebabCaseModuleName);

  const filePath = path.join(dirPath, "error.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}
