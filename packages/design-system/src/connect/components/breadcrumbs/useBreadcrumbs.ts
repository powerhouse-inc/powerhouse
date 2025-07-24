import { type BreadcrumbNode } from "#connect";
import { useCallback } from "react";

interface UseBreadcrumbsProps {
  selectedNodePath: BreadcrumbNode[];
  setSelectedNode: (id: string | undefined) => void;
}

export function useBreadcrumbs({
  selectedNodePath,
  setSelectedNode,
}: UseBreadcrumbsProps) {
  const onBreadcrumbSelected = useCallback(
    (breadcrumb: BreadcrumbNode) => {
      setSelectedNode(breadcrumb.id);
    },
    [setSelectedNode],
  );

  return {
    breadcrumbs: selectedNodePath,
    onBreadcrumbSelected,
  };
}
