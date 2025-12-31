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
  buildJsxAttributeWithoutValue,
  buildJsxElement,
  buildJsxExpression,
  buildJsxStringValueAttribute,
  buildJsxText,
  buildMethodInvocation,
  buildNull,
  buildObjectPropertyAccess,
  buildReturn,
  buildReturnIfVariableIsFalsy,
  buildSelfClosingJsxElement,
  buildStringLiteral,
  buildTernary,
} from "../syntax-builders.js";
import { getObjectLiteral, getObjectProperty } from "../syntax-getters.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import type { EditorFilePaths, EditorVariableNames } from "../types.js";
import { makeEditorsModulesFile } from "./editor-common.js";
import type { CommonGenerateEditorArgs } from "./types.js";

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

  makeEditorComponent({
    project,
    documentModelDocumentTypeName:
      documentTypeMetadata.documentModelDocumentTypeName,
    documentModelImportPath: documentTypeMetadata.documentModelImportPath,
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

type MakeEditorComponentArgs = EditorVariableNames &
  EditorFilePaths & {
    project: Project;
    documentModelDocumentTypeName: string;
    documentModelImportPath: string;
  };
export function makeEditorComponent({
  project,
  editorFilePath,
  documentModelDocumentTypeName,
  documentModelImportPath,
  useSelectedDocumentHookName,
}: MakeEditorComponentArgs) {
  const { alreadyExists, sourceFile: editorSourceFile } = getOrCreateSourceFile(
    project,
    editorFilePath,
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

  // Add imports
  editorSourceFile.addImportDeclarations([
    {
      namedImports: ["DocumentToolbar"],
      moduleSpecifier: "@powerhousedao/design-system/connect",
    },
    {
      namedImports: ["setName"],
      moduleSpecifier: "document-model",
    },
    {
      namedImports: ["useState"],
      moduleSpecifier: "react",
    },
    {
      namedImports: ["FormEvent"],
      moduleSpecifier: "react",
      isTypeOnly: true,
    },
    {
      namedImports: [useSelectedDocumentHookName],
      moduleSpecifier: documentModelImportPath,
    },
  ]);

  // Build hooks
  const useSelectedDocumentHook = buildDestructuredArrayHookCallAssignment({
    hookName: useSelectedDocumentHookName,
    destructuredElements: ["document", "dispatch"],
  });

  const isEditingUseStateHook = buildDestructuredArrayHookCallAssignment({
    hookName: "useState",
    hookArguments: [buildFalse()],
    destructuredElements: ["isEditing", "setIsEditing"],
  });

  const returnIfDocumentIsFalsy = buildReturnIfVariableIsFalsy(
    "document",
    buildNull(),
  );

  // Build handleSubmit function
  const handleSubmitFunction = buildConstAssignment({
    name: "handleSubmit",
    assignmentExpression: buildArrowFunction({
      parameters: [
        {
          name: "event",
          typeName: "FormEvent",
          typeArguments: ["HTMLFormElement"],
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
          assignmentExpression: buildMethodInvocation({
            objectName: "nameInput",
            methodName: "value.trim",
            argumentsArray: [],
          }).expression,
        }),
        buildReturnIfVariableIsFalsy("name"),
        buildFunctionCall({
          functionName: "dispatch",
          argumentsArray: [
            buildFunctionCall({
              functionName: "setName",
              argumentsArray: ["name"],
            }).expression,
          ],
        }),
        buildFunctionCall({
          functionName: "setIsEditing",
          argumentsArray: [buildFalse()],
        }),
      ],
    }),
  });

  // Build editing form JSX
  const editNameInput = buildSelfClosingJsxElement("input", [
    buildJsxStringValueAttribute("type", "text"),
    buildJsxStringValueAttribute("name", "name"),
    buildJsxAttribute("defaultValue", "document.header.name"),
    buildJsxAttributeWithoutValue("autoFocus"),
    buildClassNameAttribute(
      "w-full rounded-lg border border-gray-200 px-4 py-3 text-lg font-semibold text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
    ),
    buildJsxStringValueAttribute("placeholder", "Enter name..."),
  ]);

  const saveButton = buildJsxElement(
    "button",
    [buildJsxText("Save")],
    [
      buildJsxStringValueAttribute("type", "submit"),
      buildClassNameAttribute(
        "flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700",
      ),
    ],
  );

  const cancelButton = buildJsxElement(
    "button",
    [buildJsxText("Cancel")],
    [
      buildJsxStringValueAttribute("type", "button"),
      buildJsxAttribute("onClick", "() => setIsEditing(false)"),
      buildClassNameAttribute(
        "flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50",
      ),
    ],
  );

  const buttonsWrapper = buildJsxElement(
    "div",
    [saveButton, cancelButton],
    [buildClassNameAttribute("flex gap-2")],
  );

  const editForm = buildJsxElement(
    "form",
    [editNameInput, buttonsWrapper],
    [
      buildJsxAttribute("onSubmit", "handleSubmit"),
      buildClassNameAttribute("space-y-4"),
    ],
  );

  // Build display mode JSX
  const documentNameExpression = buildJsxExpression(
    'document.header.name || "Untitled"',
  );

  const displayHeader = buildJsxElement(
    "h2",
    [documentNameExpression],
    [buildClassNameAttribute("truncate text-xl font-semibold text-gray-900")],
  );

  const editButton = buildJsxElement(
    "button",
    [buildJsxText("Edit")],
    [
      buildJsxAttribute("onClick", "() => setIsEditing(true)"),
      buildClassNameAttribute(
        "shrink-0 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200",
      ),
    ],
  );

  const displayWrapper = buildJsxElement(
    "div",
    [displayHeader, editButton],
    [buildClassNameAttribute("flex items-center justify-between gap-4")],
  );

  // Build ternary for edit/display mode wrapped in JSX expression
  const editDisplayTernary = buildJsxExpression(
    buildTernary("isEditing", editForm, displayWrapper),
  );

  // Build document type label
  const documentTypeLabel = buildJsxElement(
    "div",
    [buildJsxText(documentModelDocumentTypeName)],
    [
      buildClassNameAttribute(
        "mb-4 text-xs font-medium uppercase tracking-wide text-gray-400",
      ),
    ],
  );

  // Build card wrapper
  const cardWrapper = buildJsxElement(
    "div",
    [documentTypeLabel, editDisplayTernary],
    [
      buildClassNameAttribute(
        "w-full max-w-md rounded-xl bg-white p-6 shadow-sm",
      ),
    ],
  );

  // Build center wrapper
  const centerWrapper = buildJsxElement(
    "div",
    [cardWrapper],
    [buildClassNameAttribute("flex justify-center px-4 py-8")],
  );

  // Build ph-default-styles wrapper
  const phDefaultStylesWrapper = buildJsxElement(
    "div",
    [centerWrapper],
    [buildClassNameAttribute("ph-default-styles")],
  );

  // Build DocumentToolbar
  const documentToolbar = buildSelfClosingJsxElement("DocumentToolbar");

  // Build outer wrapper
  const outerWrapper = buildJsxElement(
    "div",
    [documentToolbar, phDefaultStylesWrapper],
    [buildClassNameAttribute("min-h-screen bg-gray-50")],
  );

  const returnStatement = buildReturn(outerWrapper);

  const statements = [
    useSelectedDocumentHook,
    isEditingUseStateHook,
    returnIfDocumentIsFalsy,
    handleSubmitFunction,
    returnStatement,
  ].map(printNode);

  editorSourceFile.addFunction({
    name: "Editor",
    isDefaultExport: true,
    parameters: [],
    statements,
  });

  formatSourceFileWithPrettier(editorSourceFile);
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
