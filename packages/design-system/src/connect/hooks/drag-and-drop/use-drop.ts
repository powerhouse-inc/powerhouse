import { useCallback, useMemo, useState, type DragEvent } from "react";
import { FILE, UI_NODE_ID } from "../../constants/nodes.js";
import {
  type NodeKind,
  type OnAddFile,
  type OnCopyNode,
  type OnMoveNode,
} from "../../types/nodes.js";
type Props = {
  nodeId: string | null;
  driveId: string | null;
  nodeKind: NodeKind | null;
  onAddFile: OnAddFile;
  onMoveNode: OnMoveNode;
  onCopyNode: OnCopyNode;
};
export function useDrop(props: Props) {
  const { nodeId, driveId, nodeKind, onAddFile, onCopyNode, onMoveNode } =
    props;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const allowedToBeDropTarget = !!nodeKind && nodeKind !== FILE;
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTarget(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!nodeId || !driveId) return;

      const droppedFiles = getDroppedFiles(event.dataTransfer.items).filter(
        Boolean,
      );
      if (droppedFiles.length) {
        for (const file of droppedFiles) {
          if (file) {
            onAddFile(file, driveId, nodeId, nodeId);
          }
        }
      } else {
        const altOrOptionKeyPressed = event.getModifierState("Alt");
        const droppedNodeId = event.dataTransfer.getData(UI_NODE_ID);

        if (altOrOptionKeyPressed) {
          onCopyNode(droppedNodeId, nodeId, driveId);
        } else {
          onMoveNode(droppedNodeId, nodeId, driveId);
        }
      }

      setIsDropTarget(false);
    },
    [onAddFile, onCopyNode, onMoveNode, nodeId, driveId],
  );

  return useMemo(() => {
    const dropProps = allowedToBeDropTarget
      ? { onDragOver, onDragLeave, onDrop }
      : {
          onDragOver: undefined,
          onDragLeave: undefined,
          onDrop: undefined,
        };
    return {
      isDropTarget,
      dropProps,
    };
  }, [allowedToBeDropTarget, isDropTarget, onDragLeave, onDragOver, onDrop]);
}

function getDroppedFiles(items: DataTransferItemList) {
  const droppedFiles = Array.from(items)
    .map((item) => (item.kind === "file" ? item.getAsFile() : null))
    .filter(Boolean);

  return droppedFiles;
}
