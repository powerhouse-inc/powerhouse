import {
  FILE,
  isFileNodeKind,
  useNodeKindForId,
} from "@powerhousedao/reactor-browser";
import { type Node } from "document-drive";
import { type DragEvent, useCallback, useMemo, useState } from "react";
import { UI_NODE_ID } from "../../constants/nodes.js";
type Props = {
  nodeId: string | null;
  driveId: string | null;
  onAddFile: (
    file: File,
    parentNodeId: string | null,
    driveId: string | null,
  ) => Promise<void>;
  onMoveNode: (
    nodeId: string,
    targetNodeId: string,
    driveId: string,
  ) => Promise<void>;
  onCopyNode: (
    nodeId: string,
    targetNodeId: string,
    driveId: string,
  ) => Promise<void>;
};
export function useDrop(props: Props) {
  const { nodeId, driveId, onAddFile, onCopyNode, onMoveNode } = props;
  const nodeKind = useNodeKindForId(nodeId);
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
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!nodeId || !driveId) return;

      const droppedFiles = getDroppedFiles(event.dataTransfer.items).filter(
        Boolean,
      );
      if (droppedFiles.length) {
        for (const file of droppedFiles) {
          if (file) {
            await onAddFile(file, nodeId, driveId);
          }
        }
      } else {
        const altOrOptionKeyPressed = event.getModifierState("Alt");
        const droppedNodeId = event.dataTransfer.getData(UI_NODE_ID);

        if (altOrOptionKeyPressed) {
          await onCopyNode(droppedNodeId, nodeId, driveId);
        } else {
          await onMoveNode(droppedNodeId, nodeId, driveId);
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
