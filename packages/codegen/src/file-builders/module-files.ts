import { camelCase, pascalCase } from "change-case";
import path from "node:path";
import type { Project } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
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
  const moduleDeclarations = moduleFiles
    .map((file) =>
      file.getVariableDeclaration((declaration) =>
        declaration.getType().getText().includes(typeName),
      ),
    )
    .filter((v) => v !== undefined);

  const modules = moduleDeclarations.map((module) => {
    const sourceFile = module.getSourceFile();
    const moduleSpecifier =
      modulesDir.getRelativePathAsModuleSpecifierTo(sourceFile.getFilePath()) +
      ".js";
    const versionDir = getVersionDirFromModuleSpecifier(moduleSpecifier);
    const unversionedName = module.getName();
    const versionedName = versionDir
      ? `${unversionedName}${pascalCase(versionDir)}`
      : undefined;
    return { versionedName, unversionedName, moduleSpecifier };
  });

  const moduleExportsFilePath = path.join(modulesDirPath, outputFileName);

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
  const moduleImports = modules.map(
    ({ versionedName, unversionedName, moduleSpecifier }) => ({
      namedImports: [
        versionedName
          ? `${unversionedName} as ${versionedName}`
          : unversionedName,
      ],
      moduleSpecifier,
    }),
  );
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
    modules.map((module) => module.versionedName ?? module.unversionedName),
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

/** Generates the `document-models.ts` file which exports the document models defined in each document model dir's `module.ts` file */
export function makeDocumentModelModulesFile({
  project,
  projectDir,
}: {
  project: Project;
  projectDir: string;
}) {
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const documentModelsSourceFilesPath = path.join(
    documentModelsDirPath,
    "/**/*",
  );
  makeModulesFile({
    project,
    modulesDirPath: documentModelsDirPath,
    modulesSourceFilesPath: documentModelsSourceFilesPath,
    outputFileName: "document-models.ts",
    typeName: "DocumentModelModule",
    variableName: "documentModels",
    variableType: "DocumentModelModule<any>[]",
  });
}

/** Generates the `editors.ts` file which exports the editors defined in each editor dir's `module.ts` file */
export function makeEditorsModulesFile(project: Project, projectDir: string) {
  const modulesDirPath = path.join(projectDir, "editors");
  const modulesSourceFilesPath = path.join(modulesDirPath, "/**/*");
  makeModulesFile({
    project,
    modulesDirPath,
    modulesSourceFilesPath,
    outputFileName: "editors.ts",
    typeName: "EditorModule",
    variableName: "editors",
    variableType: "EditorModule[]",
  });
}

function getVersionDirFromModuleSpecifier(moduleSpecifier: string) {
  const match = moduleSpecifier.match(/\/(v\d+)(?=\/)/);
  const version = match?.[1];
  return version;
}

type MakeUpgradeManifestsExportArgs = {
  /** The project to add the export to */
  project: Project;
  /** The directory containing the document model directories (e.g., document-models/) */
  modulesDirPath: string;
  /** The path to the output file (document-models.ts) */
  outputFilePath: string;
  /** The variable name for the upgrade manifests array */
  variableName: string;
  /** The type of the upgrade manifests variable */
  variableType: string;
  /** The type name for UpgradeManifest to add to imports */
  typeName: string;
};

/**
 * Adds the upgradeManifests export to an existing document-models.ts file.
 * Searches for upgrade-manifest.ts files in each document model's upgrades directory,
 * adds imports for each, and creates the upgradeManifests array export.
 */
export function makeUpgradeManifestsExport({
  project,
  modulesDirPath,
  outputFilePath,
  variableName,
  variableType,
  typeName,
}: MakeUpgradeManifestsExportArgs) {
  // Resolve to absolute path for glob pattern matching
  const absoluteModulesDirPath = path.resolve(modulesDirPath);
  const absoluteOutputFilePath = path.resolve(outputFilePath);

  // Add upgrade-manifest.ts files to the project
  const upgradeManifestGlob = `${absoluteModulesDirPath}/**/upgrade-manifest.ts`;
  project.addSourceFilesAtPaths(upgradeManifestGlob);

  // Find all upgrade-manifest.ts files
  const upgradeManifestFiles = project
    .getSourceFiles()
    .filter((file) => file.getFilePath().includes("upgrade-manifest.ts"))
    .filter((file) => file.getFilePath().startsWith(absoluteModulesDirPath));

  if (upgradeManifestFiles.length === 0) {
    return;
  }

  // Get the output source file (document-models.ts)
  // Refresh from file system to ensure we have the latest content after makeModulesFile
  let outputSourceFile = project.getSourceFile(absoluteOutputFilePath);
  if (outputSourceFile) {
    outputSourceFile.refreshFromFileSystemSync();
  } else {
    // If not found in project, add it
    project.addSourceFilesAtPaths(absoluteOutputFilePath);
    outputSourceFile = project.getSourceFile(absoluteOutputFilePath);
  }
  if (!outputSourceFile) {
    return;
  }

  const modulesDir = project.getDirectory(absoluteModulesDirPath);
  if (!modulesDir) {
    return;
  }

  // Extract upgrade manifest info from each file
  const manifests = upgradeManifestFiles.map((file) => {
    const filePath = file.getFilePath();
    // Extract document model name from path (e.g., ./todo/upgrades/upgrade-manifest.ts -> todo)
    const pathParts = filePath.split("/");
    const upgradesIndex = pathParts.indexOf("upgrades");
    const documentModelName =
      upgradesIndex > 0 ? pathParts[upgradesIndex - 1] : "unknown";

    const moduleSpecifier =
      modulesDir.getRelativePathAsModuleSpecifierTo(filePath) + ".js";

    // Create aliased name like "upgradeManifest as todoUpgradeManifest"
    // Convert to camelCase to ensure valid JS identifier (e.g., billing-statement -> billingStatementUpgradeManifest)
    const aliasedName = `${camelCase(documentModelName)}UpgradeManifest`;

    return {
      originalName: "upgradeManifest",
      aliasedName,
      moduleSpecifier,
    };
  });

  // Add UpgradeManifest to the existing type import from document-model
  const existingTypeImport = outputSourceFile
    .getImportDeclarations()
    .find(
      (imp) =>
        imp.getModuleSpecifierValue() === "document-model" && imp.isTypeOnly(),
    );

  if (existingTypeImport) {
    const namedImports = existingTypeImport.getNamedImports();
    const hasUpgradeManifest = namedImports.some(
      (ni) => ni.getName() === typeName,
    );
    if (!hasUpgradeManifest) {
      existingTypeImport.addNamedImport(typeName);
    }
  }

  // Add import declarations for each upgrade manifest using text insertion
  // This avoids ts-morph AST manipulation issues with the refreshed file
  const existingImports = outputSourceFile.getImportDeclarations();
  const lastImport = existingImports[existingImports.length - 1];

  if (lastImport) {
    const importTexts = manifests.map(
      ({ originalName, aliasedName, moduleSpecifier }) =>
        `import { ${originalName} as ${aliasedName} } from "${moduleSpecifier}";`,
    );
    const insertText = "\n" + importTexts.join("\n");
    const insertPos = lastImport.getEnd();
    outputSourceFile.insertText(insertPos, insertText);
  }

  // Create the upgradeManifests variable statement
  const variableStatementInput = {
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

  // Add the variable statement
  const variableStatement = outputSourceFile.addVariableStatement(
    variableStatementInput,
  );

  // Get the array literal and add the manifest names
  const arrayLiteral = variableStatement
    .getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);

  arrayLiteral?.addElements(
    manifests.map((m) => m.aliasedName),
    { useNewLines: true },
  );

  project.saveSync();
}
