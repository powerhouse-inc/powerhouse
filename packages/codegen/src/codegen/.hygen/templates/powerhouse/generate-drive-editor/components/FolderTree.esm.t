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

function transformNodesToSidebarNodes(nodes: Node[]): SidebarNode[] {
  return [
    {
      id: "root",
      title: "Root",
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
  nodes,
  selectedNodeId,
  onSelectNode,
}: FolderTreeProps) {
  // Transform Node[] to hierarchical SidebarNode structure
  const sidebarNodes = useMemo(
    () => transformNodesToSidebarNodes(nodes),
    [nodes],
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
  const activeNodeId = selectedNodeId || "root";

  return (
    <SidebarProvider nodes={sidebarNodes}>
      <Sidebar
        nodes={sidebarNodes}
        activeNodeId={activeNodeId}
        onActiveNodeChange={handleActiveNodeChange}
        sidebarTitle="Drive Explorer"
        showSearchBar={true}
        resizable={true}
        allowPinning={false}
        showStatusFilter={false}
        initialWidth={256}
        defaultLevel={1}
      />
    </SidebarProvider>
  );
}
