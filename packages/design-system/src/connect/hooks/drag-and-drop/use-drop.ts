import { FILE, UI_NODE, type UiNode } from "#connect";
import { type DragEvent, useCallback, useMemo, useState } from "react";

type Props = {
  uiNode: UiNode | null;
  onAddFile: (file: File, parentNode: UiNode | null) => Promise<void>;
  onMoveNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onCopyNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
};
export function useDrop(props: Props) {
  const { uiNode, onAddFile, onCopyNode, onMoveNode } = props;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const allowedToBeDropTarget = !!uiNode && uiNode.kind !== FILE;

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
      if (!uiNode) return;

      const droppedFiles = getDroppedFiles(event.dataTransfer.items).filter(
        Boolean,
      );
      if (droppedFiles.length) {
        for (const file of droppedFiles) {
          if (file) {
            await onAddFile(file, uiNode);
          }
        }
      } else {
        const altOrOptionKeyPressed = event.getModifierState("Alt");
        const data = event.dataTransfer.getData(UI_NODE);
        const droppedNode = JSON.parse(data) as UiNode;

        if (altOrOptionKeyPressed) {
          await onCopyNode(droppedNode, uiNode);
        } else {
          await onMoveNode(droppedNode, uiNode);
        }
      }

      setIsDropTarget(false);
    },
    [onAddFile, onCopyNode, onMoveNode, uiNode],
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
