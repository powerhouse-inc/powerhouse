import type { Project } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { buildModulesOutputFilePath } from "../name-builders/common-files.js";
import { getVariableDeclarationByTypeName } from "../syntax-getters.js";
import { makeLegacyIndexFile } from "./index-files.js";

type MakeModuleFileArgs = {
  /** The project to make the modules file for */
  project: Project;
  /** The directory containing the module.ts files to generate from */
  modulesDirPath: string;
  /** The path to the module.ts files to generate from */
  modulesSourceFilesPath: string;
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
  project,
  modulesDirPath,
  modulesSourceFilesPath,
  outputFileName,
  typeName,
  variableName,
  variableType,
  shouldMakeLegacyIndexFile = true,
}: MakeModuleFileArgs) {
  // we only need the files in the directory we're creating the modules file from
  project.addSourceFilesAtPaths(modulesSourceFilesPath);

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

  const moduleExportsFilePath = buildModulesOutputFilePath(
    modulesDirPath,
    outputFileName,
  );

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
      modulesDirPath,
      moduleExportsSourceFile,
      moduleDeclarationNames,
    });
  }

  project.saveSync();
}
