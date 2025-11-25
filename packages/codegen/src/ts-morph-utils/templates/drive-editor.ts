import { tsx } from "@tmpl/core";

export const driveExplorerFileTemplate = tsx`
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

export const folderTreeFileTemplate = tsx`
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

export const emptyStateFileTemplate = tsx`
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

export const createDocumentFileTemplate = tsx`
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
