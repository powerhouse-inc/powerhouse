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
  /** The root directory of the project */
  projectDir: string;
  /** The directory containing the module.ts files to generate from */
  modulesDir: string;
  /** The name of the output file which exports the modules, e.g. 'document-models.ts' or 'editors.ts' */
  outputFileName: string;
  /** The type name of the modules exported by the module.ts files, e.g. 'DocumentModelModule' or 'EditorModule' */
  typeName: string;
  /** The name of the variable that exports the modules, e.g. 'documentModels' or 'editors' */
  variableName: string;
  /** The type of the variable that exports the modules, e.g. 'DocumentModelModule<any>[]' or 'EditorModule[]' */
  variableType: string;
  /** Whether to make a legacy index.ts file for the modules, to be removed in the future */
  shouldMakeLegacyIndexFile?: boolean;
};

/**
 * Makes a file which exports the modules from the module.ts files in the given directory as a variable declaration.
 */
export function makeModulesFile({
  projectDir,
  modulesDir,
  outputFileName,
  typeName,
  variableName,
  variableType,
  shouldMakeLegacyIndexFile = true,
}: MakeModuleFileArgs) {
  // use the local tsconfig.json file for a given project
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");

  const project = new Project({
    tsConfigFilePath,
    // don't add files from the tsconfig.json file, only use the ones we need
    skipAddingFilesFromTsConfig: true,
    // don't load library files, we only need the files we're adding
    skipLoadingLibFiles: true,
    // use formatting rules which match prettier
    manipulationSettings: {
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
    },
  });

  // we only need the files in the directory we're creating the modules file from
  project.addSourceFilesAtPaths(`${projectDir}/${modulesDir}/**/*`);

  // get all the module.ts files in the directory we're creating the modules file from
  const moduleFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().includes(`module.ts`));

  // get the variable declaration for the module object exported by each module.ts file by the given type name
  const moduleDeclarations = moduleFiles.map((file) =>
    getVariableDeclarationByTypeName(file, typeName),
  );

  // get the variable names for each of the module objects, this is all we need for the codegen
  const moduleDeclarationNames = moduleDeclarations
    .map((declaration) => declaration?.getName())
    .filter((name) => name !== undefined);

  const moduleExportsFilePath = `${projectDir}/${modulesDir}/${outputFileName}`;

  // get the source file for the modules file if it exists
  let moduleExportsSourceFile = project.getSourceFile(moduleExportsFilePath);
  // if the modules file doesn't exist, create it
  if (!moduleExportsSourceFile) {
    moduleExportsSourceFile = project.createSourceFile(
      moduleExportsFilePath,
      "",
    );
  }

  // create the variable statement for the modules file
  // start as an empty array
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
  // get the variable statement for the modules file if it exists
  let moduleExportsVariableStatement =
    moduleExportsSourceFile.getVariableStatement(variableName);
  // if the variable statement doesn't exist, create it
  if (!moduleExportsVariableStatement) {
    moduleExportsVariableStatement =
      moduleExportsSourceFile.addVariableStatement(
        moduleExportsVariableStatementInput,
      );
  } else {
    // if the variable statement exists, set it to the new variable statement
    moduleExportsVariableStatement.set(moduleExportsVariableStatementInput);
  }
  // get the array literal expression for the variable statement
  const arrayLiteral = moduleExportsVariableStatement
    .getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);

  // add the module declaration names to the array literal expression
  arrayLiteral?.addElements(moduleDeclarationNames, { useNewLines: true });

  // we don't need to handle the import statements for the file manually, since typescript already knows how to add them
  moduleExportsSourceFile.fixMissingImports(undefined, {
    importModuleSpecifierEnding: "js",
  });

  // we also need to export each module from the index.ts file for backwards compatibility
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
  /** The project to make the legacy index file for */
  project: Project;
  /** The root directory of the project */
  projectDir: string;
  /** The directory containing the module.ts files to generate from */
  modulesDir: string;
  /** The source file for the modules file which exports the modules, we can use this instead of starting from scratch */
  moduleExportsSourceFile: SourceFile;
  /** The names of the module declarations to export from the index.ts file */
  moduleDeclarationNames: string[];
};

/**
 * Makes a legacy index.ts file for the modules file which exports the modules as individual exports instead of an array of named exports.
 */
export function makeLegacyIndexFile({
  project,
  projectDir,
  modulesDir,
  moduleExportsSourceFile,
  moduleDeclarationNames,
}: MakeLegacyIndexFileArgs) {
  // we know that for every module that is imported by the modules file, we also need to export it from the index.ts file
  // instead of just using the module declaration names, we can get the import statements so that we can get the module specifier
  // this lets us be resilient to the case where the directory name of the modules file changes
  const importStatements = moduleExportsSourceFile
    .getImportDeclarations()
    .filter((importStatement) =>
      moduleDeclarationNames.some((name) =>
        importStatement.getText().includes(name),
      ),
    );

  const indexSourceFilePath = `${projectDir}/${modulesDir}/index.ts`;

  // get the source file for the index.ts file if it exists
  let indexSourceFile = project.getSourceFile(indexSourceFilePath);
  // if the index.ts file doesn't exist, create it
  if (!indexSourceFile) {
    indexSourceFile = project.createSourceFile(indexSourceFilePath, "");
  }

  importStatements.forEach((importStatement) => {
    // get the module specifier for the import statement
    // e.g. "./document-models/test-doc/module.ts"
    const moduleSpecifier = importStatement.getModuleSpecifierValue();
    // get the named imports for the import statement
    // there should only be one named import, the variable name of the module object
    // e.g. "TestDoc"
    const namesToExport = importStatement
      .getNamedImports()
      .map((namedImport) => namedImport.getName());

    // get the existing export declarations for the module specifier
    // e.g. "export { TestDoc } from './document-models/test-doc/module.ts';"
    // we can use this to check if the module has already been exported
    // and avoid adding it again
    const existingExportDeclarations = indexSourceFile
      .getExportDeclarations()
      .filter(
        (exportDeclaration) =>
          exportDeclaration.getModuleSpecifierValue() === moduleSpecifier,
      );

    // get the names of the modules that have already been exported
    // e.g. ["TestDoc"]
    const alreadyExported = new Set(
      existingExportDeclarations.flatMap((exportDeclaration) =>
        exportDeclaration
          .getNamedExports()
          .map((exportSpecifier) => exportSpecifier.getName()),
      ),
    );

    const newNames = namesToExport.filter((name) => !alreadyExported.has(name));

    if (newNames.length === 0) return;

    // add the new export declarations to the index.ts file
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
