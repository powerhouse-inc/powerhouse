import type { CommonGenerateEditorArgs } from "@powerhousedao/codegen/ts-morph";
import {
  buildArrayLiteralWithStringElements,
  buildClassNameAttribute,
  buildFunctionCall,
  buildJsxElement,
  buildJsxSpreadAttribute,
  buildNodePrinter,
  buildReturn,
  buildSelfClosingJsxElement,
  buildTsMorphProject,
  formatSourceFileWithPrettier,
  getObjectLiteral,
  getOrCreateSourceFile,
} from "@powerhousedao/codegen/ts-morph";
import { tsx } from "@tmpl/core";
import path from "path";
import { VariableDeclarationKind, type Project } from "ts-morph";
import {
  createDocumentFileTemplate,
  driveExplorerFileTemplate,
  emptyStateFileTemplate,
  folderTreeFileTemplate,
} from "../templates/drive-editor.js";
import { makeEditorModuleFile } from "./document-editor.js";
import { makeEditorsModulesFile } from "./editor-common.js";

type GenerateDriveEditorArgs = CommonGenerateEditorArgs & {
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
export function tsMorphGenerateDriveEditor({
  projectDir,
  editorDir,
  editorName,
  editorId,
  allowedDocumentModelIds,
  isDragAndDropEnabled,
}: GenerateDriveEditorArgs) {
  const documentModelsSourceFilesPath = path.join(
    projectDir,
    "document-models/**/*",
  );
  const editorsDirPath = path.join(projectDir, "editors");
  const editorSourceFilesPath = path.join(editorsDirPath, "/**/*");
  const editorDirPath = path.join(editorsDirPath, editorDir);
  const editorComponentsDirPath = path.join(editorDirPath, "components");

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  makeNavigationBreadcrumbsFile({
    project,
    editorComponentsDirPath,
  });

  makeCreateDocumentFile({
    project,
    editorComponentsDirPath,
  });

  makeEmptyStateFile({
    project,
    editorComponentsDirPath,
  });

  makeFoldersFile({
    project,
    editorComponentsDirPath,
  });

  makeFolderTreeFile({
    project,
    editorComponentsDirPath,
  });

  makeFilesFile({
    project,
    editorComponentsDirPath,
  });

  makeDriveExplorerFile({
    project,
    editorComponentsDirPath,
  });

  makeDriveContentsFile({
    project,
    editorComponentsDirPath,
  });

  makeDriveEditorComponent({
    project,
    editorDirPath,
  });

  makeDriveEditorConfigFile({
    project,
    allowedDocumentModelIds,
    isDragAndDropEnabled,
    editorDirPath,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    editorDirPath,
    documentModelId: "powerhouse/document-drive",
  });

  makeEditorsModulesFile(project, projectDir);

  project.saveSync();
}

type MakeDriveEditorComponentArgs = {
  project: Project;
  editorDirPath: string;
};
export function makeDriveEditorComponent({
  project,
  editorDirPath,
}: MakeDriveEditorComponentArgs) {
  const filePath = path.join(editorDirPath, "editor.tsx");
  const { alreadyExists, sourceFile: driveEditorComponentSourceFile } =
    getOrCreateSourceFile(project, filePath);

  if (alreadyExists) {
    const editorFunction = driveEditorComponentSourceFile.getFunction("Editor");
    if (editorFunction) {
      if (!editorFunction.isDefaultExport()) {
        editorFunction.setIsDefaultExport(true);
      }
      return;
    }
  }

  driveEditorComponentSourceFile.replaceWithText("");

  const printNode = buildNodePrinter(driveEditorComponentSourceFile);

  const importDeclarations = [
    {
      namedImports: ["useSetPHDriveEditorConfig"],
      moduleSpecifier: "@powerhousedao/reactor-browser",
    },
    {
      namedImports: ["EditorProps"],
      moduleSpecifier: "document-model",
      isTypeOnly: true,
    },
    {
      namedImports: ["DriveExplorer"],
      moduleSpecifier: "./components/DriveExplorer.js",
    },
    {
      namedImports: ["editorConfig"],
      moduleSpecifier: "./config.js",
    },
  ];
  driveEditorComponentSourceFile.addImportDeclarations(importDeclarations);
  const useSetPHDriveEditorConfigHookCall = buildFunctionCall({
    functionName: "useSetPHDriveEditorConfig",
    argumentsArray: ["editorConfig"],
  });

  const driveExplorerComponent = buildSelfClosingJsxElement("DriveExplorer", [
    buildJsxSpreadAttribute("props"),
  ]);

  const returnStatement = buildReturn(driveExplorerComponent);

  const statements = [useSetPHDriveEditorConfigHookCall, returnStatement].map(
    printNode,
  );

  driveEditorComponentSourceFile.addFunction({
    name: "Editor",
    isDefaultExport: true,
    parameters: [{ name: "props", type: "EditorProps" }],
    statements,
    docs: ["Implement your drive explorer behavior here"],
  });

  formatSourceFileWithPrettier(driveEditorComponentSourceFile);
}

type MakeDriveEditorConfigFileArgs = {
  project: Project;
  editorDirPath: string;
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
export function makeDriveEditorConfigFile({
  project,
  editorDirPath,
  allowedDocumentModelIds,
  isDragAndDropEnabled,
}: MakeDriveEditorConfigFileArgs) {
  const filePath = path.join(editorDirPath, "config.ts");
  const { sourceFile: driveEditorConfigSourceFile } = getOrCreateSourceFile(
    project,
    filePath,
  );

  driveEditorConfigSourceFile.replaceWithText("");

  driveEditorConfigSourceFile.addImportDeclaration({
    moduleSpecifier: "@powerhousedao/reactor-browser",
    namedImports: ["PHDriveEditorConfig"],
    isTypeOnly: true,
  });

  const printNode = buildNodePrinter(driveEditorConfigSourceFile);

  const configObjectVariableStatement =
    driveEditorConfigSourceFile.addVariableStatement({
      docs: ["Editor config for the AtlasDriveExplorer"],
      declarationKind: VariableDeclarationKind.Const,
      isExported: true,
      declarations: [
        {
          name: "editorConfig",
          type: "PHDriveEditorConfig",
          initializer: "{}",
        },
      ],
    });

  const objectLiteral = getObjectLiteral(configObjectVariableStatement);

  if (!objectLiteral) {
    throw new Error("Object literal not found");
  }

  objectLiteral.addPropertyAssignment({
    name: "isDragAndDropEnabled",
    initializer: isDragAndDropEnabled ? "true" : "false",
  });

  objectLiteral.addPropertyAssignment({
    name: "allowedDocumentTypes",
    initializer: printNode(
      buildArrayLiteralWithStringElements(allowedDocumentModelIds),
    ),
  });
}

type MakeDriveContentsFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeDriveContentsFile({
  project,
  editorComponentsDirPath,
}: MakeDriveContentsFileArgs) {
  const filePath = path.join(editorComponentsDirPath, "DriveContents.tsx");
  const { alreadyExists, sourceFile: driveContentsSourceFile } =
    getOrCreateSourceFile(project, filePath);

  if (alreadyExists) return;

  const printNode = buildNodePrinter(driveContentsSourceFile);

  const importDeclarations = [
    {
      namedImports: ["CreateDocument"],
      moduleSpecifier: "./CreateDocument.js",
    },
    {
      namedImports: ["EmptyState"],
      moduleSpecifier: "./EmptyState.js",
    },
    {
      namedImports: ["Files"],
      moduleSpecifier: "./Files.js",
    },
    {
      namedImports: ["Folders"],
      moduleSpecifier: "./Folders.js",
    },
    {
      namedImports: ["NavigationBreadcrumbs"],
      moduleSpecifier: "./NavigationBreadcrumbs.js",
    },
  ];
  driveContentsSourceFile.addImportDeclarations(importDeclarations);
  const navigationBreadcrumbs = buildSelfClosingJsxElement(
    "NavigationBreadcrumbs",
  );
  const folders = buildSelfClosingJsxElement("Folders");
  const files = buildSelfClosingJsxElement("Files");
  const emptyState = buildSelfClosingJsxElement("EmptyState");
  const createDocument = buildSelfClosingJsxElement("CreateDocument");

  const wrapperDiv = buildJsxElement(
    "div",
    [navigationBreadcrumbs, folders, files, emptyState, createDocument],
    [buildClassNameAttribute("space-y-6 px-6")],
  );
  const returnStatement = buildReturn(wrapperDiv);
  const statements = [returnStatement].map(printNode);
  driveContentsSourceFile.addFunction({
    name: "DriveContents",
    isExported: true,
    docs: ["Shows the documents and folders in the selected drive"],
    parameters: [],
    statements,
  });

  formatSourceFileWithPrettier(driveContentsSourceFile);
}

type MakeNavigationBreadcrumbsFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeNavigationBreadcrumbsFile({
  project,
  editorComponentsDirPath,
}: MakeNavigationBreadcrumbsFileArgs) {
  const navigationBreadcrumbsFilePath = path.join(
    editorComponentsDirPath,
    "NavigationBreadcrumbs.tsx",
  );
  const { alreadyExists, sourceFile: navigationBreadcrumbsSourceFile } =
    getOrCreateSourceFile(project, navigationBreadcrumbsFilePath);

  if (alreadyExists) return;

  const printNode = buildNodePrinter(navigationBreadcrumbsSourceFile);

  const importDeclarations = [
    {
      namedImports: ["Breadcrumbs"],
      moduleSpecifier: "@powerhousedao/design-system/connect",
    },
  ];
  navigationBreadcrumbsSourceFile.addImportDeclarations(importDeclarations);

  const breadcrumbs = buildSelfClosingJsxElement("Breadcrumbs");
  const wrapperDiv = buildJsxElement(
    "div",
    [breadcrumbs],
    [buildClassNameAttribute("border-b border-gray-200 pb-3 space-y-3")],
  );
  const returnStatement = buildReturn(wrapperDiv);
  const statements = [returnStatement].map(printNode);
  navigationBreadcrumbsSourceFile.addFunction({
    name: "NavigationBreadcrumbs",
    isExported: true,
    docs: ["Shows the navigation breadcrumbs for the selected drive or folder"],
    parameters: [],
    statements,
  });

  formatSourceFileWithPrettier(navigationBreadcrumbsSourceFile);
}

type MakeFoldersFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeFoldersFile({
  project,
  editorComponentsDirPath,
}: MakeFoldersFileArgs) {
  const foldersFilePath = path.join(editorComponentsDirPath, "Folders.tsx");
  const { alreadyExists, sourceFile: foldersSourceFile } =
    getOrCreateSourceFile(project, foldersFilePath);

  if (alreadyExists) return;

  const importDeclarations = [
    {
      namedImports: ["FolderItem"],
      moduleSpecifier: "@powerhousedao/design-system/connect",
    },
    {
      namedImports: ["useNodesInSelectedDriveOrFolder", "isFolderNodeKind"],
      moduleSpecifier: "@powerhousedao/reactor-browser",
    },
  ];
  foldersSourceFile.addImportDeclarations(importDeclarations);

  foldersSourceFile.addFunction({
    name: "Folders",
    isExported: true,
    docs: ["Shows the folders in the selected drive or folder"],
    parameters: [],
    statements: [
      tsx`
const nodes = useNodesInSelectedDriveOrFolder();
const folderNodes = nodes.filter((n) => isFolderNodeKind(n));
const hasFolders = folderNodes.length > 0;
if (!hasFolders) return null;

return (
  <div>
    <h3 className="mb-2 text-sm font-bold text-gray-600">Folders</h3>
    <div className="flex flex-wrap gap-4">
      {folderNodes.map((folderNode) => (
        <FolderItem key={folderNode.id} folderNode={folderNode} />
      ))}
    </div>
  </div>
);`.raw,
    ],
  });

  formatSourceFileWithPrettier(foldersSourceFile);
}

type MakeFilesFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeFilesFile({
  project,
  editorComponentsDirPath,
}: MakeFilesFileArgs) {
  const filesFilePath = path.join(editorComponentsDirPath, "Files.tsx");
  const { alreadyExists, sourceFile: filesSourceFile } = getOrCreateSourceFile(
    project,
    filesFilePath,
  );

  if (alreadyExists) return;

  const importDeclarations = [
    {
      namedImports: ["FileItem"],
      moduleSpecifier: "@powerhousedao/design-system/connect",
    },
    {
      namedImports: ["useNodesInSelectedDriveOrFolder", "isFileNodeKind"],
      moduleSpecifier: "@powerhousedao/reactor-browser",
    },
  ];
  filesSourceFile.addImportDeclarations(importDeclarations);

  const statements = [
    tsx`const nodes = useNodesInSelectedDriveOrFolder();`.raw,
    tsx`const fileNodes = nodes.filter((n) => isFileNodeKind(n));`.raw,
    tsx`const hasFiles = fileNodes.length > 0;`.raw,
    tsx`if (!hasFiles) return null;`.raw,
    tsx`return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-600">Documents</h3>
      <div className="flex flex-wrap gap-4">
        {fileNodes.map((fileNode) => (
          <FileItem key={fileNode.id} fileNode={fileNode} />
        ))}
      </div>
    </div>
  );`.raw,
  ];

  filesSourceFile.addFunction({
    name: "Files",
    isExported: true,
    docs: ["Shows the files in the selected drive or folder"],
    parameters: [],
    statements,
  });

  formatSourceFileWithPrettier(filesSourceFile);
}

type MakeDriveExplorerFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
function makeDriveExplorerFile({
  project,
  editorComponentsDirPath,
}: MakeDriveExplorerFileArgs) {
  const driveExplorerFilePath = path.join(
    editorComponentsDirPath,
    "DriveExplorer.tsx",
  );
  const { alreadyExists, sourceFile: driveExplorerSourceFile } =
    getOrCreateSourceFile(project, driveExplorerFilePath);

  if (alreadyExists) return;

  driveExplorerSourceFile.replaceWithText(driveExplorerFileTemplate);

  formatSourceFileWithPrettier(driveExplorerSourceFile);
}

type MakeFolderTreeFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeFolderTreeFile({
  project,
  editorComponentsDirPath,
}: MakeFolderTreeFileArgs) {
  const folderTreeFilePath = path.join(
    editorComponentsDirPath,
    "FolderTree.tsx",
  );
  const { alreadyExists, sourceFile: folderTreeSourceFile } =
    getOrCreateSourceFile(project, folderTreeFilePath);

  if (alreadyExists) return;

  folderTreeSourceFile.replaceWithText(folderTreeFileTemplate);

  formatSourceFileWithPrettier(folderTreeSourceFile);
}

type MakeEmptyStateFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeEmptyStateFile({
  project,
  editorComponentsDirPath,
}: MakeEmptyStateFileArgs) {
  const emptyStateFilePath = path.join(
    editorComponentsDirPath,
    "EmptyState.tsx",
  );
  const { alreadyExists, sourceFile: emptyStateSourceFile } =
    getOrCreateSourceFile(project, emptyStateFilePath);

  if (alreadyExists) return;

  emptyStateSourceFile.replaceWithText(emptyStateFileTemplate);

  formatSourceFileWithPrettier(emptyStateSourceFile);
}

type MakeCreateDocumentFileArgs = {
  project: Project;
  editorComponentsDirPath: string;
};
export function makeCreateDocumentFile({
  project,
  editorComponentsDirPath,
}: MakeCreateDocumentFileArgs) {
  const createDocumentFilePath = path.join(
    editorComponentsDirPath,
    "CreateDocument.tsx",
  );
  const { alreadyExists, sourceFile: createDocumentSourceFile } =
    getOrCreateSourceFile(project, createDocumentFilePath);

  if (alreadyExists) return;

  createDocumentSourceFile.replaceWithText(createDocumentFileTemplate);

  formatSourceFileWithPrettier(createDocumentSourceFile);
}
