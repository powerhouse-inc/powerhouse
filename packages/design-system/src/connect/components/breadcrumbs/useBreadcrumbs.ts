import { type BreadcrumbNode } from "#connect";
import {
  useSelectedNodePath,
  useSetSelectedNodeId,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function useBreadcrumbs() {
  const selectedNodePath = useSelectedNodePath();
  const setSelectedNodeId = useSetSelectedNodeId();
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
