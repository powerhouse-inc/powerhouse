---
to: "<%= driveEditorDir %>/components/FolderTree.tsx"
unless_exists: true
---
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
