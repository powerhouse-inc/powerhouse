import type { DocumentModelFileMakerArgs } from "@powerhousedao/codegen";
import {
  documentModelSrcIndexFileTemplate,
  documentModelSrcUtilsTemplate,
} from "@powerhousedao/codegen/templates";
import {
  formatSourceFileWithPrettier,
  getObjectLiteral,
  getOrCreateSourceFile,
  getPreviousVersionSourceFile,
} from "@powerhousedao/codegen/utils";
import { ts } from "@tmpl/core";
import { kebabCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import path from "path";
import { VariableDeclarationKind } from "ts-morph";

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

  for (const name of operationsInterfaceTypeProperties) {
    if (operationsInterfaceObject.getProperty(name)) continue;

    operationsInterfaceObject.addMethod({
      name,
      parameters: [{ name: "state" }, { name: "action" }],
      statements: [
        `// TODO: implement ${name} reducer`,
        ts`throw new Error("Reducer for '${name}' not implemented.")`.raw,
      ],
    });
  }

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
