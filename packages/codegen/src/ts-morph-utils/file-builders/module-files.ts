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

  let modulesDir = project.getDirectory(modulesDirPath);
  if (!modulesDir) {
    modulesDir = project.addDirectoryAtPath(modulesDirPath);
  }
  const moduleFiles = modulesDir
    .getDescendantSourceFiles()
    .filter((file) => file.getFilePath().includes(`module.ts`));

  // get the variable declaration for the module object exported by each module.ts file by the given type name
  const moduleDeclarations = moduleFiles.map((file) =>
    getVariableDeclarationByTypeName(file, typeName),
  );

  const modules = moduleDeclarations
    .filter((module) => module !== undefined)
    .map((module) => {
      const name = module.getName();
      const sourceFile = module.getSourceFile();
      const parentDir = sourceFile.getDirectory();
      const parentDirName = parentDir.getBaseName();
      const moduleSpecifier = `./${parentDirName}/module.js`;
      return { name, moduleSpecifier };
    });

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
  } else {
    moduleExportsSourceFile.replaceWithText("");
  }

  const typeImport = {
    namedImports: [typeName],
    moduleSpecifier: "document-model",
    isTypeOnly: true,
  };
  const moduleImports = modules.map(({ name, moduleSpecifier }) => ({
    namedImports: [name],
    moduleSpecifier,
  }));
  const imports = [typeImport, ...moduleImports];
  moduleExportsSourceFile.addImportDeclarations(imports);

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
  arrayLiteral?.addElements(
    modules.map((module) => module.name),
    { useNewLines: true },
  );

  // we also need to export each module from the index.ts file for backwards compatibility
  if (shouldMakeLegacyIndexFile) {
    makeLegacyIndexFile({
      project,
      modulesDirPath,
      modules,
    });
  }

  project.saveSync();
}
