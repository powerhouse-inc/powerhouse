import { UI_NODE } from "#connect";
import { type Node } from "document-drive";
import { type DragEvent, useCallback, useMemo, useState } from "react";

type Props = {
  node: Node | undefined;
  onAddFile: (file: File, parent: Node | undefined) => Promise<void> | void;
  onMoveNode: (src: Node, target: Node | undefined) => Promise<void> | void;
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void> | void;
};
export function useDrop(props: Props) {
  const { node, onAddFile, onCopyNode, onMoveNode } = props;
  const [isDropTarget, setIsDropTarget] = useState(false);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropTarget(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const onDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const dropTarget = event.target as HTMLElement;
      const closestDropZone = dropTarget.closest("[data-drop-zone]");

      const dropZoneId = node?.id || "root";
      const closestDropZoneId =
        closestDropZone?.getAttribute("data-drop-zone") || "root";

      if (closestDropZoneId !== dropZoneId) {
        setIsDropTarget(false);
        return;
      }

      try {
        const droppedFiles = getDroppedFiles(event.dataTransfer.items).filter(
          Boolean,
        );
        if (droppedFiles.length) {
          for (const file of droppedFiles) {
            if (file) {
              await onAddFile(file, node);
            }
          }
          return;
        }
        const altOrOptionKeyPressed = event.getModifierState("Alt");
        const data = event.dataTransfer.getData(UI_NODE);
        const droppedNode = JSON.parse(data) as Node;

        if (altOrOptionKeyPressed) {
          await onCopyNode(droppedNode, node);
        } else {
          await onMoveNode(droppedNode, node);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsDropTarget(false);
      }
    },
    [onAddFile, onCopyNode, onMoveNode, parent, node?.id],
  );

  return useMemo(() => {
    return {
      isDropTarget,
      dropProps: {
        onDragOver,
        onDragLeave,
        onDrop,
        "data-drop-zone": node?.id || "root",
      },
    };
  }, [isDropTarget, onDragLeave, onDragOver, onDrop, node?.id]);
}

function getDroppedFiles(items: DataTransferItemList) {
  const droppedFiles = Array.from(items)
    .map((item) => (item.kind === "file" ? item.getAsFile() : null))
    .filter(Boolean);

  return droppedFiles;
}
