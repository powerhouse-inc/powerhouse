import path from "node:path";
import type {
  ArrayLiteralExpression,
  ObjectLiteralExpression,
  SourceFile,
  StringLiteral,
} from "ts-morph";
import {
  IndentationText,
  Project,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";

type MakeModuleFileArgs = {
  projectDir: string;
  modulesDir: string;
  moduleFileName: string;
  typeName: string;
  variableName: string;
  variableType: string;
  shouldMakeLegacyIndexFile?: boolean;
};

export function makeModulesFile({
  projectDir,
  modulesDir,
  moduleFileName,
  typeName,
  variableName,
  variableType,
  shouldMakeLegacyIndexFile = true,
}: MakeModuleFileArgs) {
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");

  const project = new Project({
    tsConfigFilePath,
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    manipulationSettings: {
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
    },
  });

  project.addSourceFilesAtPaths(`${projectDir}/${modulesDir}/**/*`);
  const moduleFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().includes(`module.ts`));
  const moduleDeclarations = moduleFiles.map((file) =>
    getVariableDeclarationByTypeName(file, typeName),
  );
  const moduleDeclarationNames = moduleDeclarations
    .map((declaration) => declaration?.getName())
    .filter((name) => name !== undefined);

  let moduleExportsSourceFile = project.getSourceFile(
    `${projectDir}/${modulesDir}/${moduleFileName}`,
  );
  if (!moduleExportsSourceFile) {
    moduleExportsSourceFile = project.createSourceFile(
      `${projectDir}/${modulesDir}/${moduleFileName}`,
      "",
    );
  }
  const moduleExportsVariableStatementInput = {
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: variableName,
        type: variableType,
        initializer: `[]`,
      },
    ],
  };
  let moduleExportsVariableStatement =
    moduleExportsSourceFile.getVariableStatement(variableName);
  if (!moduleExportsVariableStatement) {
    moduleExportsVariableStatement =
      moduleExportsSourceFile.addVariableStatement(
        moduleExportsVariableStatementInput,
      );
  } else {
    moduleExportsVariableStatement.set(moduleExportsVariableStatementInput);
  }
  const arrayLiteral = moduleExportsVariableStatement
    .getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  arrayLiteral?.addElements(moduleDeclarationNames, { useNewLines: true });

  moduleExportsSourceFile.fixMissingImports(undefined, {
    importModuleSpecifierEnding: "js",
  });

  if (shouldMakeLegacyIndexFile) {
    makeLegacyIndexFile({
      project,
      projectDir,
      modulesDir,
      moduleExportsSourceFile,
      moduleDeclarationNames,
    });
  }

  project.saveSync();
}

type MakeLegacyIndexFileArgs = {
  project: Project;
  projectDir: string;
  modulesDir: string;
  moduleExportsSourceFile: SourceFile;
  moduleDeclarationNames: string[];
};
export function makeLegacyIndexFile({
  project,
  projectDir,
  modulesDir,
  moduleExportsSourceFile,
  moduleDeclarationNames,
}: MakeLegacyIndexFileArgs) {
  const importStatements = moduleExportsSourceFile
    .getImportDeclarations()
    .filter((importStatement) =>
      moduleDeclarationNames.some((name) =>
        importStatement.getText().includes(name),
      ),
    );

  let indexSourceFile = project.getSourceFile(
    `${projectDir}/${modulesDir}/index.ts`,
  );
  if (!indexSourceFile) {
    indexSourceFile = project.createSourceFile(
      `${projectDir}/${modulesDir}/index.ts`,
      "",
    );
  }

  importStatements.forEach((importStatement) => {
    const moduleSpecifier = importStatement.getModuleSpecifierValue();
    const namesToExport = importStatement
      .getNamedImports()
      .map((namedImport) => namedImport.getName());

    const existingExportDecls = indexSourceFile
      .getExportDeclarations()
      .filter((ed) => ed.getModuleSpecifierValue() === moduleSpecifier);

    const alreadyExported = new Set(
      existingExportDecls.flatMap((ed) =>
        ed.getNamedExports().map((ne) => ne.getName()),
      ),
    );

    const newNames = namesToExport.filter((name) => !alreadyExported.has(name));

    if (newNames.length === 0) return;

    indexSourceFile.addExportDeclaration({
      namedExports: newNames,
      moduleSpecifier,
    });
  });
}

export function getVariableDeclarationByTypeName(
  sourceFile: SourceFile,
  typeName: string,
) {
  const variableDeclarations = sourceFile.getVariableDeclarations();
  return variableDeclarations.find((declaration) =>
    declaration.getType().getText().includes(typeName),
  );
}

export function getStringLiteralValue(
  stringLiteral: StringLiteral | undefined,
) {
  return stringLiteral?.getText().replace(/["']/g, "");
}

export function getObjectProperty<T extends SyntaxKind>(
  object: ObjectLiteralExpression | undefined,
  propertyName: string,
  propertyType: T,
) {
  return object
    ?.getProperty(propertyName)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getChildren()
    .find((child) => child.getKind() === propertyType)
    ?.asKind(propertyType);
}

export function getArrayLiteralExpressionElementsText(
  arrayLiteralExpression: ArrayLiteralExpression | undefined,
) {
  return arrayLiteralExpression
    ?.getElements()
    .map((element) => element.getText())
    .map((text) => text.replace(/["']/g, ""));
}
