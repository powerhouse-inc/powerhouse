import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import type { ModuleSpecification } from "@powerhousedao/shared/document-model";
import { ts } from "@tmpl/core";
import { camelCase, kebabCase, pascalCase } from "change-case";
import path from "path";
import {
    documentModelSrcIndexFileTemplate,
    documentModelSrcUtilsTemplate,
} from "templates";
import type { SourceFile } from "ts-morph";
import { VariableDeclarationKind } from "ts-morph";
import {
    formatSourceFileWithPrettier,
    getObjectLiteral,
    getOrCreateSourceFile,
    getPreviousVersionSourceFile,
} from "utils";

export async function makeSrcDirFiles(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  await makeDocumentModelSrcIndexFile(fileMakerArgs);
  await makeDocumentModelSrcUtilsFile(fileMakerArgs);
  await makeReducerOperationHandlersForModules(fileMakerArgs);
}

async function makeReducerOperationHandlersForModules(
  fileMakerArgs: DocumentModelFileMakerArgs,
) {
  const { modules } = fileMakerArgs;
  for (const module of modules) {
    await makeReducerOperationHandlerForModule({
      ...fileMakerArgs,
      module,
    });
  }
}

async function makeReducerOperationHandlerForModule({
  project,
  module,
  version,
  reducersDirPath,
  pascalCaseDocumentType,
  camelCaseDocumentType,
  versionedDocumentModelPackageImportPath,
}: DocumentModelFileMakerArgs & { module: ModuleSpecification }) {
  const kebabCaseModuleName = kebabCase(module.name);
  const pascalCaseModuleName = pascalCase(module.name);
  const filePath = path.join(reducersDirPath, `${kebabCaseModuleName}.ts`);
  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );
  if (!alreadyExists) {
    const previousVersionFile = getPreviousVersionSourceFile({
      project,
      version,
      filePath,
    });
    if (previousVersionFile) {
      sourceFile.replaceWithText(previousVersionFile.getText());
    }
  }
  const operationsInterfaceTypeName = `${pascalCaseDocumentType}${pascalCaseModuleName}Operations`;
  const operationsInterfaceVariableName = `${camelCaseDocumentType}${pascalCaseModuleName}Operations`;

  const existingOperationsInterfaceTypeImport = sourceFile.getImportDeclaration(
    (importDeclaration) =>
      !!importDeclaration
        .getNamedImports()
        .find(
          (importSpecifier) =>
            importSpecifier.getName() === operationsInterfaceTypeName,
        ),
  );
  if (existingOperationsInterfaceTypeImport) {
    existingOperationsInterfaceTypeImport.remove();
  }

  const operationsInterfaceTypeImport = sourceFile.addImportDeclaration({
    namedImports: [operationsInterfaceTypeName],
    moduleSpecifier: versionedDocumentModelPackageImportPath,
    isTypeOnly: true,
  });

  const operationsInterfaceTypeProperties = operationsInterfaceTypeImport
    .getNamedImports()
    .find((value) => value.getName() === operationsInterfaceTypeName)
    ?.getNameNode()
    .getType()
    .getProperties()
    .map((symbol) => symbol.getName());

  if (!operationsInterfaceTypeProperties) {
    throw new Error("Failed to create operation handler object");
  }

  let operationsInterfaceVariableStatement = sourceFile.getVariableStatement(
    operationsInterfaceVariableName,
  );

  if (!operationsInterfaceVariableStatement) {
    operationsInterfaceVariableStatement = sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [
        {
          name: operationsInterfaceVariableName,
          type: operationsInterfaceTypeName,
          initializer: "{}",
        },
      ],
    });
  }

  const operationsInterfaceObject = getObjectLiteral(
    operationsInterfaceVariableStatement,
  );

  if (!operationsInterfaceObject) {
    throw new Error("Failed to build reducer object");
  }

  // Build a lookup map from method name to operation spec to access reducer code
  const operationsByMethodName = new Map<
    string,
    (typeof module.operations)[number]
  >();
  for (const operation of module.operations) {
    if (operation.name) {
      const methodName = `${camelCase(operation.name)}Operation`;
      operationsByMethodName.set(methodName, operation);
    }
  }

  for (const name of operationsInterfaceTypeProperties) {
    if (operationsInterfaceObject.getProperty(name)) continue;

    const operationSpec = operationsByMethodName.get(name);
    const reducerCode = operationSpec?.reducer?.trim();

    operationsInterfaceObject.addMethod({
      name,
      parameters: [{ name: "state" }, { name: "action" }],
      statements: reducerCode
        ? [reducerCode]
        : [
            `// TODO: implement ${name} reducer`,
            ts`throw new Error("Reducer for '${name}' not implemented.")`.raw,
          ],
    });
  }

  // Add error imports for error classes referenced in reducer code
  addErrorImportsForModule(sourceFile, module);

  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelSrcIndexFile({
  project,
  ...variableNames
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcIndexFileTemplate;
  const { srcDirPath } = variableNames;

  const filePath = path.join(srcDirPath, "index.ts");

  const { sourceFile } = getOrCreateSourceFile(project, filePath);

  sourceFile.replaceWithText(template);
  await formatSourceFileWithPrettier(sourceFile);
}

async function makeDocumentModelSrcUtilsFile({
  project,
  srcDirPath,
  version,
}: DocumentModelFileMakerArgs) {
  const template = documentModelSrcUtilsTemplate;

  const filePath = path.join(srcDirPath, "utils.ts");

  const { alreadyExists, sourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (!alreadyExists) {
    const previousVersionSourceFile = getPreviousVersionSourceFile({
      project,
      version,
      filePath,
    });

    if (previousVersionSourceFile) {
      sourceFile.replaceWithText(previousVersionSourceFile.getText());
    } else {
      sourceFile.replaceWithText(template);
    }
  }

  await formatSourceFileWithPrettier(sourceFile);
}

function addErrorImportsForModule(
  sourceFile: SourceFile,
  module: ModuleSpecification,
): void {
  // Collect all unique errors from all operations in this module
  const allErrors: { name: string }[] = [];
  for (const operation of module.operations) {
    if (Array.isArray(operation.errors)) {
      for (const error of operation.errors) {
        if (error.name && !allErrors.find((e) => e.name === error.name)) {
          allErrors.push({ name: error.name });
        }
      }
    }
  }

  if (allErrors.length === 0) return;

  // Scan the source file content to find which error classes are actually referenced
  const sourceFileContent = sourceFile.getFullText();
  const usedErrors: string[] = [];

  for (const error of allErrors) {
    const errorPattern = new RegExp(`\\b${error.name}\\b`, "g");
    if (errorPattern.test(sourceFileContent)) {
      usedErrors.push(error.name);
    }
  }

  if (usedErrors.length === 0) return;

  const errorImportPath = `../../gen/${kebabCase(module.name)}/error.js`;

  const existingErrorImport = sourceFile
    .getImportDeclarations()
    .find(
      (importDecl) => importDecl.getModuleSpecifierValue() === errorImportPath,
    );

  if (existingErrorImport) {
    const existingNamedImports = existingErrorImport
      .getNamedImports()
      .map((namedImport) => namedImport.getName());

    const newErrorsToImport = usedErrors.filter(
      (errorName) => !existingNamedImports.includes(errorName),
    );

    if (newErrorsToImport.length > 0) {
      existingErrorImport.addNamedImports(newErrorsToImport);
    }
  } else {
    sourceFile.addImportDeclaration({
      namedImports: usedErrors,
      moduleSpecifier: errorImportPath,
    });
  }
}
