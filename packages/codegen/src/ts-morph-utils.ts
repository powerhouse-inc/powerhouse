import { camelCase, paramCase, pascalCase } from "change-case";
import path from "node:path";
import type {
  ArrayLiteralExpression,
  ObjectLiteralExpression,
  SourceFile,
  StringLiteral,
  VariableStatement,
} from "ts-morph";
import {
  IndentationText,
  Project,
  StructureKind,
  SyntaxKind,
  VariableDeclarationKind,
  ts,
} from "ts-morph";

function getOrCreateSourceFile(project: Project, filePath: string) {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return project.createSourceFile(filePath, "");
  }
  console.log(`Source file ${filePath} already exists`);
  console.log(sourceFile.getFullText());
  return sourceFile;
}

function getDefaultProjectOptions(tsConfigFilePath: string) {
  const DEFAULT_PROJECT_OPTIONS = {
    // don't add files from the tsconfig.json file, only use the ones we need
    skipAddingFilesFromTsConfig: true,
    // don't load library files, we only need the files we're adding
    skipLoadingLibFiles: true,
    // use formatting rules which match prettier
    manipulationSettings: {
      useTrailingCommas: true,
      indentationText: IndentationText.TwoSpaces,
      indentMultiLineObjectLiteralBeginningOnBlankLine: true,
    },
  };
  return {
    ...DEFAULT_PROJECT_OPTIONS,
    tsConfigFilePath,
  };
}

function buildClassNameAttribute(value: string) {
  const classAttr = ts.factory.createJsxAttribute(
    ts.factory.createIdentifier("className"),
    ts.factory.createStringLiteral(value),
  );

  return classAttr;
}

function buildJsxElement(
  identifierText: string,
  children: readonly ts.JsxChild[] = [],
  attributes: readonly ts.JsxAttributeLike[] = [],
  typeArguments?: readonly ts.TypeNode[],
) {
  const identifier = ts.factory.createIdentifier(identifierText);
  const openingElement = ts.factory.createJsxOpeningElement(
    identifier,
    typeArguments,
    ts.factory.createJsxAttributes(attributes),
  );
  const closingElement = ts.factory.createJsxClosingElement(identifier);

  const element = ts.factory.createJsxElement(
    openingElement,
    children,
    closingElement,
  );

  return element;
}

function buildSelfClosingJsxElement(
  identifierText: string,
  attributes: readonly ts.JsxAttributeLike[] = [],
  typeArguments?: readonly ts.TypeNode[],
) {
  const identifier = ts.factory.createIdentifier(identifierText);
  const element = ts.factory.createJsxSelfClosingElement(
    identifier,
    typeArguments,
    ts.factory.createJsxAttributes(attributes),
  );

  return element;
}

function buildIfStatement(
  condition: ts.Expression,
  thenStatement: ts.Statement,
) {
  return ts.factory.createIfStatement(condition, thenStatement);
}

function printNode(node: ts.Node, sourceFile: ts.SourceFile) {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

type MakeEditDocumentNameComponentArgs = {
  projectDir: string;
  editorDir: string;
  packageName: string;
  documentType: string;
  documentModelDir: string;
};
export function makeEditDocumentNameComponent({
  projectDir,
  editorDir,
  packageName,
  documentType,
  documentModelDir,
}: MakeEditDocumentNameComponentArgs) {
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");
  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));
  const editDocumentNameComponentFilePath = path.join(
    projectDir,
    "editors",
    editorDir,
    "components",
    "_EditName.tsx",
  );
  const editDocumentNameComponentSourceFile = getOrCreateSourceFile(
    project,
    editDocumentNameComponentFilePath,
  );

  const pascalCaseDocumentType = pascalCase(documentType);
  const paramCaseDocumentType = paramCase(documentType);
  const camelCaseDocumentType = camelCase(documentType);
  const editDocumentNameComponentName = `Edit${pascalCaseDocumentType}Name`;
  const useSelectedDocumentHookName = `useSelected${pascalCaseDocumentType}Document`;

  editDocumentNameComponentSourceFile.addImportDeclarations([
    {
      namedImports: ["setName"],
      moduleSpecifier: "document-model",
    },
    {
      namedImports: [useSelectedDocumentHookName],
      moduleSpecifier: `${packageName}/document-models/${paramCaseDocumentType}`,
    },
    {
      namedImports: ["useState"],
      moduleSpecifier: "react",
    },
    {
      namedImports: ["FormEventHandler", "MouseEventHandler"],
      moduleSpecifier: "react",
      isTypeOnly: true,
    },
  ]);

  const editNameComponent = editDocumentNameComponentSourceFile.addFunction({
    name: editDocumentNameComponentName,
    isExported: true,
    parameters: [],
    statements: [],
    docs: [
      `Displays the name of the selected ${documentType} document and allows editing it`,
    ],
  });

  editNameComponent.addStatements([
    {
      kind: StructureKind.VariableStatement,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `[${camelCaseDocumentType}Document, dispatch]`,
          initializer: `${useSelectedDocumentHookName}()`,
        },
      ],
    },
    {
      kind: StructureKind.VariableStatement,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `[isEditing, setIsEditing]`,
          initializer: `useState(false)`,
        },
      ],
    },
  ]);

  editNameComponent.addStatements([
    printNode(
      buildIfStatement(
        ts.factory.createLogicalNot(
          ts.factory.createIdentifier(`${camelCaseDocumentType}Document`),
        ),
        ts.factory.createReturnStatement(ts.factory.createNull()),
      ),
      editDocumentNameComponentSourceFile.compilerNode,
    ),
  ]);

  editNameComponent.addStatements([
    {
      kind: StructureKind.VariableStatement,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `${camelCaseDocumentType}DocumentName`,
          initializer: `${camelCaseDocumentType}Document.header.name`,
        },
      ],
    },
    {
      kind: StructureKind.VariableStatement,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          type: "MouseEventHandler<HTMLButtonElement>",
          name: `onClickEdit${pascalCaseDocumentType}Name`,
          initializer: `() => {
            setIsEditing(true);
          }`,
        },
      ],
    },
    {
      kind: StructureKind.VariableStatement,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          type: "MouseEventHandler<HTMLButtonElement>",
          name: `onClickCancelEdit${pascalCaseDocumentType}Name`,
          initializer: `() => {
            setIsEditing(false);
          }`,
        },
      ],
    },
  ]);

  editDocumentNameComponentSourceFile.formatText();
  project.saveSync();
}

type MakeEditorComponentArgs = {
  projectDir: string;
  editorDir: string;
  documentType: string;
};
export function makeEditorComponent({
  projectDir,
  editorDir,
  documentType,
}: MakeEditorComponentArgs) {
  // use the local tsconfig.json file for a given project
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");

  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));

  const editorFilePath = path.join(
    projectDir,
    "editors",
    editorDir,
    "editor.tsx",
  );

  const editorSourceFile = getOrCreateSourceFile(project, editorFilePath);
  const editNameComponentName = `Edit${pascalCase(documentType)}Name`;

  editorSourceFile.addImportDeclaration({
    moduleSpecifier: "./components/EditName.js",
    namedImports: [editNameComponentName],
  });

  const editNameComponent = buildSelfClosingJsxElement(editNameComponentName);

  const editorWrapperDiv = buildJsxElement(
    "div",
    [editNameComponent],
    [buildClassNameAttribute("py-4 px-8")],
  );
  const returnStatement = ts.factory.createReturnStatement(editorWrapperDiv);
  const returnStatementText = printNode(
    returnStatement,
    editorSourceFile.compilerNode,
  );

  editorSourceFile.addFunction({
    name: "Editor",
    isDefaultExport: true,
    parameters: [],
    statements: [returnStatementText],
    docs: ["Implement your editor behavior here"],
  });

  project.saveSync();
}

type MakeEditorModuleFileArgs = {
  projectDir: string;
  editorDir: string;
  documentTypeName: string;
  editorName: string;
  editorId: string;
};
export function makeEditorModuleFile({
  projectDir,
  editorDir,
  documentTypeName,
  editorName,
  editorId,
}: MakeEditorModuleFileArgs) {
  const editorNamePascalCase = pascalCase(editorName);
  const tsConfigFilePath = path.join(projectDir, "tsconfig.json");
  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));
  const editorModuleFilePath = path.join(
    projectDir,
    "editors",
    editorDir,
    "module.ts",
  );
  const editorModuleSourceFile = getOrCreateSourceFile(
    project,
    editorModuleFilePath,
  );

  editorModuleSourceFile.addImportDeclarations([
    {
      namedImports: ["EditorModule"],
      moduleSpecifier: "document-model",
      isTypeOnly: true,
    },
    {
      namedImports: ["lazy"],
      moduleSpecifier: "react",
    },
  ]);

  const moduleVariableStatement = editorModuleSourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: editorNamePascalCase,
        type: "EditorModule",
        initializer: "{}",
      },
    ],
  });

  const objectLiteral = getObjectLiteral(moduleVariableStatement);

  if (!objectLiteral) {
    throw new Error("Object literal not found");
  }

  objectLiteral.addPropertyAssignment({
    name: "Component",
    initializer: `lazy(() => import("./editor.js"))`,
  });

  objectLiteral.addPropertyAssignment({
    name: "documentTypes",
    initializer: `["${documentTypeName}"]`,
  });

  objectLiteral.addPropertyAssignment({
    name: "config",
    initializer: "{}",
  });

  const configProperty = getObjectProperty(
    objectLiteral,
    "config",
    SyntaxKind.ObjectLiteralExpression,
  );

  if (!configProperty) {
    throw new Error("Config property not found");
  }

  configProperty.addPropertyAssignment({
    name: "id",
    initializer: `"${editorId}"`,
  });

  configProperty.addPropertyAssignment({
    name: "name",
    initializer: `"${editorName}"`,
  });

  editorModuleSourceFile.formatText();

  project.saveSync();
}

type MakeSubgraphsIndexFileArgs = { projectDir: string };
export function makeSubgraphsIndexFile({
  projectDir,
}: MakeSubgraphsIndexFileArgs) {
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

  project.addSourceFilesAtPaths(`${projectDir}/subgraphs/**/*`);

  const subgraphsDir = project.getDirectory(path.join(projectDir, "subgraphs"));
  const subgraphsSubdirs = subgraphsDir?.getDirectories() ?? [];

  let subgraphsIndexSourceFile = project.getSourceFile(
    path.join(projectDir, "subgraphs/index.ts"),
  );
  if (!subgraphsIndexSourceFile) {
    subgraphsIndexSourceFile = project.createSourceFile(
      path.join(projectDir, "subgraphs/index.js"),
      "",
    );
  }

  for (const subgraphSubdir of subgraphsSubdirs) {
    const subgraphIndexSourceFilePath = `${subgraphSubdir.getPath()}/index.ts`;
    const subgraphIndexSourceFile = project.getSourceFile(
      subgraphIndexSourceFilePath,
    );
    if (!subgraphIndexSourceFile) {
      continue;
    }
    const subgraphClassExport = subgraphIndexSourceFile
      .getClasses()
      .find((c) => c.getBaseClass()?.getText().includes("BaseSubgraph"));
    const subgraphClassName = subgraphClassExport?.getName();
    if (!subgraphClassName) {
      continue;
    }
    const indexFileExports = subgraphsIndexSourceFile
      .getExportDeclarations()
      .map((e) => e.getNamespaceExport()?.getText())
      .filter((e) => e !== undefined)
      .join();
    if (indexFileExports.includes(subgraphClassName)) {
      continue;
    }
    subgraphsIndexSourceFile.addExportDeclaration({
      namespaceExport: subgraphClassName,
      moduleSpecifier: `./${subgraphSubdir.getBaseName()}/index.js`,
    });
  }

  project.saveSync();
}

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

  const project = new Project(getDefaultProjectOptions(tsConfigFilePath));

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

function getObjectLiteral(statement: VariableStatement | undefined) {
  return statement
    ?.getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}
