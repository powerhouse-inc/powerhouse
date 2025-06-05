import { type BreadcrumbNode } from "#connect";
import { type SetSelectedNodeId } from "@powerhousedao/reactor-browser/uiNodes/types";
import { type Node } from "document-drive";
import { useCallback, useMemo } from "react";

export function useBreadcrumbs(
  selectedNodePath: Node[],
  setSelectedNodeId: SetSelectedNodeId,
) {
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
      setSelectedNodeId(breadcrumb.id);
    },
    [setSelectedNodeId],
  );

  return {
    breadcrumbs,
    onBreadcrumbSelected,
  };
}
