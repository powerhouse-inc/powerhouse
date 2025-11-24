import console from "node:console";
import path from "node:path";
import { format } from "prettier";
import type { SourceFile } from "ts-morph";
import {
  IndentationText,
  Project,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import {
  editorModuleOutputFileName,
  editorModuleTypeName,
  editorModuleVariableName,
  editorModuleVariableType,
} from "./constants.js";
import {
  buildNodePrinter,
  getDocumentTypeMetadata,
  getOrCreateSourceFile,
} from "./file-utils.js";

import { buildModulesOutputFilePath } from "./name-builders/common-files.js";
import {
  buildDocumentModelsDirPath,
  buildDocumentModelsSourceFilesPath,
} from "./name-builders/document-model-files.js";
import {
  buildEditDocumentNameComponentFilePath,
  buildEditorFilePath,
  buildEditorModuleFilePath,
  buildEditorSourceFilesPath,
  buildEditorsDirPath,
} from "./name-builders/editor-files.js";
import {
  buildDispatchFunctionName,
  buildDocumentNameVariableName,
  buildDocumentVariableName,
  buildEditDocumentNameComponentName,
  buildIsEditingVariableName,
  buildOnCancelEditHandlerName,
  buildOnClickHandlerName,
  buildOnSubmitSetNameFunctionName,
  buildSetIsEditingFunctionName,
  buildSetNameActionName,
  buildUseSelectedDocumentHookName,
} from "./name-builders/variables.js";
import {
  buildArrowFunction,
  buildClassNameAttribute,
  buildConstAssignment,
  buildDestructuredArrayHookCallAssignment,
  buildFalse,
  buildFunctionCall,
  buildJsxAttribute,
  buildJsxBooleanAttribute,
  buildJsxElement,
  buildJsxExpression,
  buildJsxStringValueAttribute,
  buildJsxText,
  buildMethodInvocation,
  buildNull,
  buildObjectPropertyAccess,
  buildReturn,
  buildReturnIfVariableIsFalsy,
  buildReturnIfVariableIsTruthy,
  buildSelfClosingJsxElement,
  buildStringLiteral,
  buildTrue,
  buildType,
} from "./syntax-builders.js";
import {
  getObjectLiteral,
  getObjectProperty,
  getVariableDeclarationByTypeName,
} from "./syntax-getters.js";
import { buildTsMorphProject } from "./ts-morph-project.js";

type GenerateEditorArgs = {
  packageName: string;
  projectDir: string;
  editorDir: string;
  editorName: string;
  editorId: string;
  documentModelId: string;
};
export function tsMorphGenerateEditor({
  packageName,
  projectDir,
  editorDir,
  editorName,
  editorId,
  documentModelId,
}: GenerateEditorArgs) {
  const documentModelsSourceFilesPath =
    buildDocumentModelsSourceFilesPath(projectDir);
  const editorSourceFilesPath = buildEditorSourceFilesPath(projectDir);

  const project = buildTsMorphProject(projectDir);

  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  const documentModelsDirPath = buildDocumentModelsDirPath(projectDir);
  const editorsDirPath = buildEditorsDirPath(projectDir);

  const { documentModelDocumentTypeName, documentModelImportPath } =
    getDocumentTypeMetadata({
      project,
      packageName,
      documentModelId,
      documentModelsDirPath,
    });

  const documentVariableName = buildDocumentVariableName(
    documentModelDocumentTypeName,
  );
  const editDocumentNameComponentName = buildEditDocumentNameComponentName(
    documentModelDocumentTypeName,
  );
  const useSelectedDocumentHookName = buildUseSelectedDocumentHookName(
    documentModelDocumentTypeName,
  );
  const documentNameVariableName = buildDocumentNameVariableName(
    documentModelDocumentTypeName,
  );
  const dispatchFunctionName = buildDispatchFunctionName(
    documentModelDocumentTypeName,
  );
  const onClickEditHandlerName = buildOnClickHandlerName(
    documentModelDocumentTypeName,
  );
  const onCancelEditHandlerName = buildOnCancelEditHandlerName(
    documentModelDocumentTypeName,
  );
  const setNameActionName = buildSetNameActionName(
    documentModelDocumentTypeName,
  );
  const isEditingVariableName = buildIsEditingVariableName(
    documentModelDocumentTypeName,
  );
  const setIsEditingFunctionName = buildSetIsEditingFunctionName(
    documentModelDocumentTypeName,
  );
  const onSubmitSetNameFunctionName = buildOnSubmitSetNameFunctionName(
    documentModelDocumentTypeName,
  );
  const editDocumentNameComponentFilePath =
    buildEditDocumentNameComponentFilePath(projectDir, editorDir);
  const editorFilePath = buildEditorFilePath(projectDir, editorDir);
  const editorModuleFilePath = buildEditorModuleFilePath(projectDir, editorDir);

  makeEditDocumentNameComponent({
    project,
    documentModelDocumentTypeName,
    documentModelImportPath,
    documentVariableName,
    onClickEditHandlerName,
    onCancelEditHandlerName,
    setNameActionName,
    useSelectedDocumentHookName,
    dispatchFunctionName,
    isEditingVariableName,
    setIsEditingFunctionName,
    onSubmitSetNameFunctionName,
    documentNameVariableName,
    editDocumentNameComponentName,
    editDocumentNameComponentFilePath,
  });

  makeEditorComponent({
    project,
    editorFilePath,
    editDocumentNameComponentName,
  });

  makeEditorModuleFile({
    project,
    editorModuleFilePath,
    editorName,
    editorId,
    documentModelId,
  });

  makeModulesFile({
    project,
    modulesDirPath: editorsDirPath,
    modulesSourceFilesPath: editorSourceFilesPath,
    outputFileName: editorModuleOutputFileName,
    typeName: editorModuleTypeName,
    variableName: editorModuleVariableName,
    variableType: editorModuleVariableType,
  });

  project.saveSync();
}

type MakeEditDocumentNameComponentArgs = {
  project: Project;
  documentModelDocumentTypeName: string;
  documentModelImportPath: string;
  documentVariableName: string;
  onClickEditHandlerName: string;
  onCancelEditHandlerName: string;
  setNameActionName: string;
  useSelectedDocumentHookName: string;
  dispatchFunctionName: string;
  isEditingVariableName: string;
  setIsEditingFunctionName: string;
  onSubmitSetNameFunctionName: string;
  documentNameVariableName: string;
  editDocumentNameComponentName: string;
  editDocumentNameComponentFilePath: string;
};
export function makeEditDocumentNameComponent({
  project,
  documentModelDocumentTypeName,
  documentVariableName,
  onClickEditHandlerName,
  onCancelEditHandlerName,
  documentModelImportPath,
  setNameActionName,
  useSelectedDocumentHookName,
  dispatchFunctionName,
  isEditingVariableName,
  setIsEditingFunctionName,
  onSubmitSetNameFunctionName,
  documentNameVariableName,
  editDocumentNameComponentName,
  editDocumentNameComponentFilePath,
}: MakeEditDocumentNameComponentArgs) {
  const editDocumentNameComponentSourceFile = getOrCreateSourceFile(
    project,
    editDocumentNameComponentFilePath,
  );

  const printNode = buildNodePrinter(editDocumentNameComponentSourceFile);

  const importSetName = {
    namedImports: [setNameActionName],
    moduleSpecifier: "document-model",
  };
  const importUseSelectedDocument = {
    namedImports: [useSelectedDocumentHookName],
    moduleSpecifier: documentModelImportPath,
  };
  const importUseState = {
    namedImports: ["useState"],
    moduleSpecifier: "react",
  };

  const importFormEventHandlerTypes = {
    namedImports: ["FormEventHandler", "MouseEventHandler"],
    moduleSpecifier: "react",
    isTypeOnly: true,
  };

  const importDeclarations = [
    importSetName,
    importUseSelectedDocument,
    importUseState,
    importFormEventHandlerTypes,
  ];

  editDocumentNameComponentSourceFile.addImportDeclarations(importDeclarations);

  const useSelectedDocumentHook = buildDestructuredArrayHookCallAssignment({
    hookName: useSelectedDocumentHookName,
    destructuredElements: [documentVariableName, dispatchFunctionName],
  });
  const isEditingUseStateHook = buildDestructuredArrayHookCallAssignment({
    hookName: "useState",
    hookArguments: [buildFalse()],
    destructuredElements: [isEditingVariableName, setIsEditingFunctionName],
  });
  const returnIfDocumentIsFalsy = buildReturnIfVariableIsFalsy(
    documentVariableName,
    buildNull(),
  );
  const assignDocumentNameVariable = buildConstAssignment({
    name: documentNameVariableName,
    assignmentExpression: buildObjectPropertyAccess(
      documentVariableName,
      "header.name",
    ),
  });

  const onClickEditNameHandler = buildConstAssignment({
    name: onClickEditHandlerName,
    type: buildType("MouseEventHandler", ["HTMLButtonElement"]),
    assignmentExpression: buildArrowFunction({
      bodyStatements: [
        buildFunctionCall({
          functionName: setIsEditingFunctionName,
          argumentsArray: [buildTrue()],
        }),
      ],
    }),
  });

  const onCancelEditNameHandler = buildConstAssignment({
    name: onCancelEditHandlerName,
    type: buildType("MouseEventHandler", ["HTMLButtonElement"]),
    assignmentExpression: buildArrowFunction({
      bodyStatements: [
        buildFunctionCall({
          functionName: setIsEditingFunctionName,
          argumentsArray: [buildFalse()],
        }),
      ],
    }),
  });

  const onSubmitSetNameHandler = buildConstAssignment({
    name: onSubmitSetNameFunctionName,
    type: buildType("FormEventHandler", ["HTMLFormElement"]),
    assignmentExpression: buildArrowFunction({
      parameters: [
        {
          name: "event",
        },
      ],
      bodyStatements: [
        buildMethodInvocation({
          objectName: "event",
          methodName: "preventDefault",
          argumentsArray: [],
        }),
        buildConstAssignment({
          name: "form",
          assignmentExpression: buildObjectPropertyAccess(
            "event",
            "currentTarget",
          ),
          castAsType: "HTMLFormElement",
        }),
        buildConstAssignment({
          name: "nameInput",
          assignmentExpression: buildMethodInvocation({
            objectName: "form",
            methodName: "elements.namedItem",
            argumentsArray: [buildStringLiteral("name")],
          }).expression,
          castAsType: "HTMLInputElement",
        }),
        buildConstAssignment({
          name: "name",
          assignmentExpression: buildObjectPropertyAccess("nameInput", "value"),
        }),
        buildReturnIfVariableIsFalsy("name"),
        buildFunctionCall({
          functionName: dispatchFunctionName,
          argumentsArray: [
            buildFunctionCall({
              functionName: setNameActionName,
              argumentsArray: ["name"],
            }).expression,
          ],
        }),
        buildFunctionCall({
          functionName: setIsEditingFunctionName,
          argumentsArray: [buildFalse()],
        }),
      ],
    }),
  });

  const editNameInput = buildSelfClosingJsxElement("input", [
    buildClassNameAttribute("text-lg font-semibold text-gray-900 p-1"),
    buildJsxStringValueAttribute("type", "text"),
    buildJsxStringValueAttribute("name", "name"),
    buildJsxStringValueAttribute("defaultValue", documentNameVariableName),
    buildJsxBooleanAttribute("autoFocus", true),
  ]);

  const saveButton = buildJsxElement(
    "button",
    [buildJsxText("Save")],
    [
      buildClassNameAttribute("text-sm text-gray-600"),
      buildJsxStringValueAttribute("type", "submit"),
    ],
  );

  const cancelButton = buildJsxElement(
    "button",
    [buildJsxText("Cancel")],
    [
      buildClassNameAttribute("text-sm text-red-800"),
      buildJsxAttribute("onClick", onCancelEditHandlerName),
    ],
  );

  const saveAndCancelButtonsWrapperDiv = buildJsxElement(
    "div",
    [saveButton, cancelButton],
    [buildClassNameAttribute("flex gap-2")],
  );

  const editNameForm = buildJsxElement(
    "form",
    [editNameInput, saveAndCancelButtonsWrapperDiv],
    [
      buildClassNameAttribute("flex gap-2 items-center justify-between"),
      buildJsxAttribute("onSubmit", onSubmitSetNameFunctionName),
    ],
  );

  const returnIfIsEditing = buildReturnIfVariableIsTruthy(
    isEditingVariableName,
    editNameForm,
  );

  const documentNameJsxExpression = buildJsxExpression(
    documentNameVariableName,
  );

  const notEditingHeader = buildJsxElement(
    "h2",
    [documentNameJsxExpression],
    [buildClassNameAttribute("text-lg font-semibold text-gray-900")],
  );

  const onClickEditButton = buildJsxElement(
    "button",
    [buildJsxText("Edit Name")],
    [
      buildClassNameAttribute("text-sm text-gray-600"),
      buildJsxAttribute("onClick", onClickEditHandlerName),
    ],
  );

  const notEditingWrapperDiv = buildJsxElement(
    "div",
    [notEditingHeader, onClickEditButton],
    [buildClassNameAttribute("flex justify-between items-center")],
  );

  const returnIfNotEditing = buildReturn(notEditingWrapperDiv);

  const statements = [
    useSelectedDocumentHook,
    isEditingUseStateHook,
    returnIfDocumentIsFalsy,
    assignDocumentNameVariable,
    onClickEditNameHandler,
    onCancelEditNameHandler,
    onSubmitSetNameHandler,
    returnIfIsEditing,
    returnIfNotEditing,
  ].map(printNode);

  editDocumentNameComponentSourceFile.addFunction({
    name: editDocumentNameComponentName,
    isExported: true,
    parameters: [],
    statements,
    docs: [
      `Displays the name of the selected ${documentModelDocumentTypeName} document and allows editing it`,
    ],
  });

  format(editDocumentNameComponentSourceFile.getFullText(), {
    parser: "typescript",
  })
    .then((formattedText) => {
      editDocumentNameComponentSourceFile.replaceWithText(formattedText);
      project.saveSync();
    })
    .catch((error) => {
      console.error("Error formatting edit document name component:", error);
    });
}

type MakeEditorComponentArgs = {
  project: Project;
  editorFilePath: string;
  editDocumentNameComponentName: string;
};
export function makeEditorComponent({
  project,
  editorFilePath,
  editDocumentNameComponentName,
}: MakeEditorComponentArgs) {
  const editorSourceFile = getOrCreateSourceFile(project, editorFilePath);
  const printNode = buildNodePrinter(editorSourceFile);

  editorSourceFile.addImportDeclaration({
    moduleSpecifier: "./components/EditName.js",
    namedImports: [editDocumentNameComponentName],
  });

  const editNameComponent = buildSelfClosingJsxElement(
    editDocumentNameComponentName,
  );

  const editorWrapperDiv = buildJsxElement(
    "div",
    [editNameComponent],
    [buildClassNameAttribute("py-4 px-8")],
  );
  const returnStatement = buildReturn(editorWrapperDiv);

  editorSourceFile.addFunction({
    name: "Editor",
    isDefaultExport: true,
    parameters: [],
    statements: [printNode(returnStatement)],
    docs: ["Implement your editor behavior here"],
  });
}

type MakeEditorModuleFileArgs = {
  project: Project;
  editorName: string;
  editorId: string;
  documentModelId: string;
  editorModuleFilePath: string;
};
export function makeEditorModuleFile({
  project,
  editorModuleFilePath,
  editorName,
  documentModelId,
  editorId,
}: MakeEditorModuleFileArgs) {
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
        name: editorName,
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
    initializer: `["${documentModelId}"]`,
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
