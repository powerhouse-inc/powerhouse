import { type Node } from "document-drive";
import { useCallback } from "react";

interface UseBreadcrumbsProps {
  selectedNodePath: Node[];
  setSelectedNode: (node: Node | string | undefined) => void;
}

export function useBreadcrumbs({
  selectedNodePath,
  setSelectedNode,
}: UseBreadcrumbsProps) {
  const onBreadcrumbSelected = useCallback(
    (breadcrumb: Node) => {
      setSelectedNode(breadcrumb);
    },
    [setSelectedNode],
  );

  return {
    breadcrumbs: selectedNodePath,
    onBreadcrumbSelected,
  };
}
