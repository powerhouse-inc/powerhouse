import { tsx } from "@tmpl/core";
import path from "path";
import { VariableDeclarationKind, type Project } from "ts-morph";
import {
  buildNodePrinter,
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
} from "../file-utils.js";
import {
  getDocumentModelFilePaths,
  getEditorFilePaths,
} from "../name-builders/get-file-paths.js";
import {
  buildArrayLiteralWithStringElements,
  buildClassNameAttribute,
  buildFunctionCall,
  buildJsxElement,
  buildJsxSpreadAttribute,
  buildReturn,
  buildSelfClosingJsxElement,
} from "../syntax-builders.js";
import { getObjectLiteral } from "../syntax-getters.js";
import { buildTsMorphProject } from "../ts-morph-project.js";
import { makeEditorModuleFile } from "./document-editor.js";
import { makeEditorsModulesFile } from "./editor-common.js";
import type { CommonGenerateEditorArgs } from "./types.js";

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
  const { documentModelsSourceFilesPath } =
    getDocumentModelFilePaths(projectDir);
  const { editorSourceFilesPath, ...editorFilePaths } = getEditorFilePaths(
    projectDir,
    editorDir,
  );

  const project = buildTsMorphProject(projectDir);
  project.addSourceFilesAtPaths(documentModelsSourceFilesPath);
  project.addSourceFilesAtPaths(editorSourceFilesPath);

  makeNavigationBreadcrumbsFile({
    project,
    ...editorFilePaths,
  });

  makeCreateDocumentFile({
    project,
    ...editorFilePaths,
  });

  makeEmptyStateFile({
    project,
    ...editorFilePaths,
  });

  makeFoldersFile({
    project,
    ...editorFilePaths,
  });

  makeFolderTreeFile({
    project,
    ...editorFilePaths,
  });

  makeFilesFile({
    project,
    ...editorFilePaths,
  });

  makeDriveExplorerFile({
    project,
    ...editorFilePaths,
  });

  makeDriveContentsFile({
    project,
    ...editorFilePaths,
  });

  makeDriveEditorComponent({
    project,
    ...editorFilePaths,
  });

  makeDriveEditorConfigFile({
    project,
    allowedDocumentModelIds,
    isDragAndDropEnabled,
    ...editorFilePaths,
  });

  makeEditorModuleFile({
    project,
    editorName,
    editorId,
    documentModelId: "powerhouse/document-drive",
    ...editorFilePaths,
  });

  makeEditorsModulesFile(project, projectDir);

  project.saveSync();
}

type MakeDriveEditorComponentArgs = {
  project: Project;
  editorFilePath: string;
};
export function makeDriveEditorComponent({
  project,
  editorFilePath,
}: MakeDriveEditorComponentArgs) {
  const { sourceFile: driveEditorComponentSourceFile } = getOrCreateSourceFile(
    project,
    editorFilePath,
  );

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
  editorConfigFilePath: string;
  allowedDocumentModelIds: string[];
  isDragAndDropEnabled: boolean;
};
export function makeDriveEditorConfigFile({
  project,
  editorConfigFilePath,
  allowedDocumentModelIds,
  isDragAndDropEnabled,
}: MakeDriveEditorConfigFileArgs) {
  const { sourceFile: driveEditorConfigSourceFile } = getOrCreateSourceFile(
    project,
    editorConfigFilePath,
  );

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
  driveContentsFilePath: string;
};
export function makeDriveContentsFile({
  project,
  driveContentsFilePath,
}: MakeDriveContentsFileArgs) {
  const { alreadyExists, sourceFile: driveContentsSourceFile } =
    getOrCreateSourceFile(project, driveContentsFilePath);

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

  const printNode = buildNodePrinter(foldersSourceFile);

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
      `const nodes = useNodesInSelectedDriveOrFolder();
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
  );`,
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
    tsx`const nodes = useNodesInSelectedDriveOrFolder();`,
    tsx`const fileNodes = nodes.filter((n) => isFileNodeKind(n));`,
    tsx`const hasFiles = fileNodes.length > 0;`,
    tsx`if (!hasFiles) return null;`,
    tsx`return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-600">Documents</h3>
      <div className="flex flex-wrap gap-4">
        {fileNodes.map((fileNode) => (
          <FileItem key={fileNode.id} fileNode={fileNode} />
        ))}
      </div>
    </div>
  );`,
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

  const driveExplorerFileTemplate = tsx`
import type { EditorProps } from "document-model";
import { FolderTree } from "./FolderTree.js";
import { DriveContents } from "./DriveContents.js";

/**
 * Main drive explorer component with sidebar navigation and content area.
 * Layout: Left sidebar (folder tree) + Right content area (files/folders + document editor)
 */
export function DriveExplorer({ children }: EditorProps) {
  // if a document is selected then it's editor will be passed as children
  const showDocumentEditor = !!children;

  return (
    <div className="flex h-full">
      <FolderTree />
      <div className="flex-1 overflow-y-auto p-4">
        {/* Conditional rendering: Document editor or folder contents */}
        {showDocumentEditor ? (
          /* Document editor view */
          children
        ) : (
          /* Folder contents view */
          <DriveContents />
        )}
      </div>
    </div>
  );
}
`;

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

  const folderTreeFileTemplate = tsx`
  import {
  Sidebar,
  SidebarProvider,
  type SidebarNode,
} from "@powerhousedao/document-engineering";
import {
  setSelectedNode,
  useNodesInSelectedDrive,
  useSelectedDrive,
  useSelectedNode,
} from "@powerhousedao/reactor-browser";
import type { Node } from "document-drive";
import { useMemo } from "react";

function buildSidebarNodes(
  nodes: Node[],
  parentId: string | null | undefined,
): SidebarNode[] {
  return nodes
    .filter((n) => {
      if (parentId == null) {
        return n.parentFolder == null;
      }
      return n.parentFolder === parentId;
    })
    .map((node): SidebarNode => {
      if (node.kind === "folder") {
        return {
          id: node.id,
          title: node.name,
          icon: "FolderClose" as const,
          expandedIcon: "FolderOpen" as const,
          children: buildSidebarNodes(nodes, node.id),
        };
      }
      return {
        id: node.id,
        title: node.name,
        icon: "File" as const,
      };
    });
}

function transformNodesToSidebarNodes(
  nodes: Node[],
  driveName: string,
): SidebarNode[] {
  return [
    {
      id: "root",
      title: driveName,
      icon: "Drive" as const,
      children: buildSidebarNodes(nodes, null),
    },
  ];
}

/**
 * Hierarchical folder tree navigation component using Sidebar from document-engineering.
 * Displays folders and files in a tree structure with expand/collapse functionality, search, and resize support.
 */
export function FolderTree() {
  const [selectedDrive] = useSelectedDrive();
  const nodes = useNodesInSelectedDrive();
  const selectedNode = useSelectedNode();
  const driveName = selectedDrive.header.name;
  // Transform Node[] to hierarchical SidebarNode structure
  const sidebarNodes = useMemo(
    () => transformNodesToSidebarNodes(nodes || [], driveName),
    [nodes, driveName],
  );

  const handleActiveNodeChange = (node: SidebarNode) => {
    // If root node is selected, pass undefined to match existing behavior
    if (node.id === "root") {
      setSelectedNode(undefined);
    } else {
      setSelectedNode(node.id);
    }
  };
  // Map selectedNodeId to activeNodeId (use "root" when undefined)
  const activeNodeId =
    !selectedNode || selectedNode.id === selectedDrive.header.id
      ? "root"
      : selectedNode.id;

  return (
    <SidebarProvider nodes={sidebarNodes}>
      <Sidebar
        className="pt-1"
        nodes={sidebarNodes}
        activeNodeId={activeNodeId}
        onActiveNodeChange={handleActiveNodeChange}
        sidebarTitle="Drive Explorer"
        showSearchBar={true}
        resizable={true}
        allowPinning={false}
        showStatusFilter={false}
        initialWidth={256}
        defaultLevel={2}
      />
    </SidebarProvider>
  );
}
`;

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

  const emptyStateFileTemplate = tsx`
import { useNodesInSelectedDriveOrFolder } from "@powerhousedao/reactor-browser";

/** Shows a message when the selected drive or folder is empty */
export function EmptyState() {
  const nodes = useNodesInSelectedDriveOrFolder();
  const hasNodes = nodes.length > 0;
  if (hasNodes) return null;

  return (
    <div className="py-12 text-center text-gray-500">
      <p className="text-lg">This folder is empty</p>
      <p className="mt-2 text-sm">Create your first document or folder below</p>
    </div>
  );
}
`;

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

  const createDocumentFileTemplate = tsx`
import type { VetraDocumentModelModule } from "@powerhousedao/reactor-browser";
import {
  showCreateDocumentModal,
  useAllowedDocumentModelModules,
} from "@powerhousedao/reactor-browser";

/**
 * Document creation UI component.
 * Displays available document types as clickable buttons.
 */
export function CreateDocument() {
  const allowedDocumentModelModules = useAllowedDocumentModelModules();

  return (
    <div>
      {/* Customize section title here */}
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        Create document
      </h3>
      {/* Customize layout by changing flex-wrap, gap, or grid layout */}
      <div className="flex w-full flex-wrap gap-4">
        {allowedDocumentModelModules?.map((documentModelModule) => {
          return (
            <CreateDocumentButton
              key={documentModelModule.documentModel.global.id}
              documentModelModule={documentModelModule}
            />
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  documentModelModule: VetraDocumentModelModule;
};
function CreateDocumentButton({ documentModelModule }: Props) {
  const documentType = documentModelModule.documentModel.global.id;
  const documentModelName =
    documentModelModule.documentModel.global.name || documentType;
  const documentModelDescription =
    documentModelModule.documentModel.global.description;
  return (
    <button
      className="cursor-pointer rounded-md bg-gray-200 py-2 px-3 hover:bg-gray-300"
      title={documentModelName}
      aria-description={documentModelDescription}
      onClick={() => showCreateDocumentModal(documentType)}
    >
      {documentModelName}
    </button>
  );
}
`;

  createDocumentSourceFile.replaceWithText(createDocumentFileTemplate);

  formatSourceFileWithPrettier(createDocumentSourceFile);
}
