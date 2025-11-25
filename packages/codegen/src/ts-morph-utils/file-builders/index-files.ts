import type { Project, SourceFile } from "ts-morph";
import { buildModulesOutputFilePath } from "../name-builders/common-files.js";

type MakeLegacyIndexFileArgs = {
  /** The project to make the legacy index file for */
  project: Project;
  /** The directory containing the module.ts files to generate from */
  modulesDirPath: string;
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
  modulesDirPath,
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

  const indexSourceFilePath = buildModulesOutputFilePath(
    modulesDirPath,
    "index.ts",
  );

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
