---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/FolderTree.tsx"
unless_exists: true
---
import {
  Sidebar,
  SidebarProvider,
  type SidebarNode,
} from "@powerhousedao/document-engineering";
import type { Node } from "document-drive";
import { useMemo } from "react";

interface FolderTreeProps {
  driveId: string;
  driveName: string;
  nodes: Node[];
  selectedNodeId?: string;
  onSelectNode: (nodeId: string | undefined) => void;
}

function isFolder(node: Node): boolean {
  return node.kind === "folder";
}

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
      if (isFolder(node)) {
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
export function FolderTree({
  driveId,
  driveName,
  nodes,
  selectedNodeId,
  onSelectNode,
}: FolderTreeProps) {
  // Transform Node[] to hierarchical SidebarNode structure
  const sidebarNodes = useMemo(
    () => transformNodesToSidebarNodes(nodes, driveName),
    [nodes, driveName],
  );

  const handleActiveNodeChange = (node: SidebarNode) => {
    // If root node is selected, pass undefined to match existing behavior
    if (node.id === "root") {
      onSelectNode(undefined);
    } else {
      onSelectNode(node.id);
    }
  };
  // Map selectedNodeId to activeNodeId (use "root" when undefined)
  const activeNodeId =
    !selectedNodeId || selectedNodeId === driveId ? "root" : selectedNodeId;

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