import { UI_NODE } from "#connect";
import type { Node } from "document-drive";
import type { DragEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

type Props = {
  node: Node | undefined;
  onAddFile: (file: File, parent: Node | undefined) => Promise<void> | void;
  onMoveNode: (src: Node, target: Node | undefined) => Promise<void> | void;
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void> | void;
  /**
   * When true, uses drag depth tracking with onDragEnter/onDragLeave
   * to avoid flicker when moving across child elements.
   * Defaults to false to preserve legacy behavior.
   */
  trackNestedDrag?: boolean;
};
export function useDrop(props: Props) {
  const {
    node,
    onAddFile,
    onCopyNode,
    onMoveNode,
    trackNestedDrag = false,
  } = props;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragDepthRef = useRef(0);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDropTarget(true);
  }, []);

  const onDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDropTarget(true);
  }, []);

  const onDragLeaveDepth = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDropTarget(false);
    }
  }, []);

  const onDragLeaveSimple = useCallback(() => {
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
        if (trackNestedDrag) dragDepthRef.current = 0;
        setIsDropTarget(false);
      }
    },
    [onAddFile, onCopyNode, onMoveNode, parent, node?.id, trackNestedDrag],
  );

  return useMemo(() => {
    const baseProps: Record<string, unknown> = {
      onDragOver,
      onDrop,
      "data-drop-zone": node?.id || "root",
    };

    if (trackNestedDrag) {
      baseProps.onDragEnter = onDragEnter;
      baseProps.onDragLeave = onDragLeaveDepth;
    } else {
      baseProps.onDragLeave = onDragLeaveSimple;
    }

    return {
      isDropTarget,
      dropProps: baseProps,
    };
  }, [
    isDropTarget,
    node?.id,
    onDragEnter,
    onDragLeaveDepth,
    onDragLeaveSimple,
    onDragOver,
    onDrop,
    trackNestedDrag,
  ]);
}

function getDroppedFiles(items: DataTransferItemList) {
  const droppedFiles = Array.from(items)
    .map((item) => (item.kind === "file" ? item.getAsFile() : null))
    .filter(Boolean);

  return droppedFiles;
}
