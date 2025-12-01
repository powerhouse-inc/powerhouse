import { pascalCase } from "change-case";
import type { Project } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getDocumentTypeMetadata,
  getOrCreateSourceFile,
} from "../file-utils.js";
import {
  getDocumentModelFilePaths,
  getEditorFilePaths,
} from "../name-builders/get-file-paths.js";
import { getEditorVariableNames } from "../name-builders/get-variable-names.js";
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
} from "../syntax-builders.js";
import { getObjectLiteral, getObjectProperty } from "../syntax-getters.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import type { EditorFilePaths, EditorVariableNames } from "../types.js";
import { makeEditorsModulesFile } from "./editor-common.js";
import type {
  CommonGenerateEditorArgs,
  CommonMakeEditorComponentArgs,
} from "./types.js";

type GenerateEditorArgs = CommonGenerateEditorArgs & {
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
  const documentModelFilePaths = getDocumentModelFilePaths(projectDir);
  const { documentModelsSourceFilesPath } = documentModelFilePaths;
  const editorFilePaths = getEditorFilePaths(projectDir, editorDir);
  const { editorSourceFilesPath } = editorFilePaths;

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  const documentTypeMetadata = getDocumentTypeMetadata({
    project,
    packageName,
    documentModelId,
    ...documentModelFilePaths,
  });

  const editorVariableNames = getEditorVariableNames(documentTypeMetadata);

  makeEditDocumentNameComponent({
    project,
    ...documentTypeMetadata,
    ...editorVariableNames,
    ...editorFilePaths,
  });

  makeEditorComponent({
    project,
    ...editorFilePaths,
    ...editorVariableNames,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId,
    ...editorFilePaths,
  });

  makeEditorsModulesFile(project, projectDir);

  project.saveSync();
}

type MakeEditDocumentNameComponentArgs = EditorVariableNames &
  EditorFilePaths & {
    project: Project;
    documentModelDocumentTypeName: string;
    documentModelImportPath: string;
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
  const { alreadyExists, sourceFile: editDocumentNameComponentSourceFile } =
    getOrCreateSourceFile(project, editDocumentNameComponentFilePath);

  if (alreadyExists) return;

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

  formatSourceFileWithPrettier(editDocumentNameComponentSourceFile);
}

type MakeEditorComponentArgs = CommonMakeEditorComponentArgs & {
  editDocumentNameComponentName: string;
};
export function makeEditorComponent({
  project,
  editorFilePath,
  editDocumentNameComponentName,
}: MakeEditorComponentArgs) {
  const { alreadyExists, sourceFile: editorSourceFile } = getOrCreateSourceFile(
    project,
    editorFilePath,
  );

  if (alreadyExists) {
    const functionDeclaration = editorSourceFile.getFunction("Editor");
    if (functionDeclaration && !functionDeclaration.isDefaultExport()) {
      functionDeclaration.setIsDefaultExport(true);
    }
    return;
  }

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
  documentModelId?: string;
  editorModuleFilePath: string;
  legacyMultipleDocumentTypes?: string[];
};
export function makeEditorModuleFile({
  project,
  editorModuleFilePath,
  editorName,
  documentModelId,
  editorId,
  legacyMultipleDocumentTypes,
}: MakeEditorModuleFileArgs) {
  if (documentModelId && !!legacyMultipleDocumentTypes) {
    throw new Error(
      "Cannot specify both documentModelId and legacyMultipleDocumentTypes",
    );
  }
  const { sourceFile: editorModuleSourceFile } = getOrCreateSourceFile(
    project,
    editorModuleFilePath,
  );

  const pascalCaseEditorName = pascalCase(editorName);

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
        name: pascalCaseEditorName,
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
    initializer: documentModelId
      ? `["${documentModelId}"]`
      : JSON.stringify(legacyMultipleDocumentTypes),
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
