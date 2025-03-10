import { type BreadcrumbNode, type UiNode } from "@/connect";
import { useCallback, useMemo } from "react";

interface UseBreadcrumbsProps {
  selectedNodePath: UiNode[];
  getNodeById: (id: string) => UiNode | null;
  setSelectedNode: (node: UiNode | null) => void;
}

export function useBreadcrumbs({
  selectedNodePath,
  getNodeById,
  setSelectedNode,
}: UseBreadcrumbsProps) {
  const breadcrumbs = useMemo(
    () =>
      selectedNodePath.map((node) => ({
        id: node.id,
        name: node.name,
      })),
    [selectedNodePath],
  );

  const onBreadcrumbSelected = useCallback(
    (breadcrumb: BreadcrumbNode) => {
      const node = getNodeById(breadcrumb.id);
      if (node) {
        setSelectedNode(node);
      } else {
        console.error(`Node with id ${breadcrumb.id} not found`, breadcrumb);
      }
    },
    [getNodeById, setSelectedNode],
  );

  return {
    breadcrumbs,
    onBreadcrumbSelected,
  };
}
