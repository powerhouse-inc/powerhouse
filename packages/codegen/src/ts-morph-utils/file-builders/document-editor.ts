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
  buildNodePrinter,
  buildNull,
  buildObjectPropertyAccess,
  buildReturn,
  buildReturnIfVariableIsFalsy,
  buildReturnIfVariableIsTruthy,
  buildSelfClosingJsxElement,
  buildStringLiteral,
  buildTrue,
  buildType,
  formatSourceFileWithPrettier,
  getDocumentTypeMetadata,
  getObjectLiteral,
  getObjectProperty,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";
import { pascalCase } from "change-case";
import path from "path";
import type { Project } from "ts-morph";
import { SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { getEditorVariableNames } from "../name-builders/get-variable-names.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import type { EditorVariableNames } from "../types.js";
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
  const documentModelsDirPath = path.join(projectDir, "document-models");
  const editorsDirPath = path.join(projectDir, "editors");
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const editorComponentsDirPath = path.join(editorDirPath, "components");
  const editorSourceFilesPath = path.join(editorsDirPath, "/**/*");
  const documentModelsSourceFilesPath = path.join(
    documentModelsDirPath,
    "/**/*",
  );

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  const documentTypeMetadata = getDocumentTypeMetadata({
    project,
    packageName,
    documentModelId,
    documentModelsDirPath,
  });

  const editorVariableNames = getEditorVariableNames(documentTypeMetadata);

  makeEditDocumentNameComponent({
    project,
    editorComponentsDirPath,
    ...documentTypeMetadata,
    ...editorVariableNames,
  });

  makeEditorComponent({
    project,
    editorDirPath,
    editorComponentsDirPath,
    ...editorVariableNames,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId,
    editorDirPath,
    ...editorVariableNames,
  });

  makeEditorsModulesFile(project, projectDir);

  project.saveSync();
}

type MakeEditDocumentNameComponentArgs = EditorVariableNames & {
  project: Project;
  editorComponentsDirPath: string;
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
  editorComponentsDirPath,
}: MakeEditDocumentNameComponentArgs) {
  const filePath = path.join(editorComponentsDirPath, "EditName.tsx");
  const { alreadyExists, sourceFile: editDocumentNameComponentSourceFile } =
    getOrCreateSourceFile(project, filePath);

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
  editorDirPath,
  editDocumentNameComponentName,
}: MakeEditorComponentArgs) {
  const filePath = path.join(editorDirPath, "editor.tsx");
  const { alreadyExists, sourceFile: editorSourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  if (alreadyExists) {
    const functionDeclaration = editorSourceFile.getFunction("Editor");
    if (functionDeclaration) {
      if (!functionDeclaration.isDefaultExport()) {
        functionDeclaration.setIsDefaultExport(true);
      }
      return;
    }
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
  editorDirPath: string;
  legacyMultipleDocumentTypes?: string[];
};
export function makeEditorModuleFile({
  project,
  editorDirPath,
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
  const filePath = path.join(editorDirPath, "module.ts");
  const { sourceFile: editorModuleSourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  editorModuleSourceFile.replaceWithText("");

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
    docs: [
      `Document editor module for the "${documentModelId ?? legacyMultipleDocumentTypes?.join(",")}" document type`,
    ],
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
