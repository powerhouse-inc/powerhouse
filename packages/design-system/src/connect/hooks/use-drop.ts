import { useNodeActions } from "@powerhousedao/reactor-browser";
import type { Node } from "document-drive";
import type { DragEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

type Props = {
  target?: Node | undefined;
  onAddFileOverride?: (file: File, parent: Node | undefined) => Promise<void>;
  /**
   * When true, uses drag depth tracking with onDragEnter/onDragLeave
   * to avoid flicker when moving across child elements.
   * Defaults to false to preserve legacy behavior.
   */
  trackNestedDrag?: boolean;
  /**
   * Array of accepted file extensions (e.g., ['.zip', '.phd', '.phdm'])
   * If not provided, all files are accepted
   */
  acceptedFileExtensions?: string[];
};
export function useDrop(props?: Props) {
  const {
    target,
    onAddFileOverride,
    trackNestedDrag = false,
    acceptedFileExtensions,
  } = props ?? {};
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragDepthRef = useRef(0);
  const {
    onMoveNode,
    onCopyNode,
    onAddFile: defaultOnAddFile,
  } = useNodeActions();
  const onAddFile = onAddFileOverride ?? defaultOnAddFile;

  /**
   * Check if the dragged content is valid based on accepted file extensions
   */
  const isValidDropContent = useCallback(
    (dataTransfer: DataTransfer): boolean => {
      if (!acceptedFileExtensions || acceptedFileExtensions.length === 0) {
        return true;
      }

      // Always allow internal node dragging
      if (dataTransfer.types.includes("UI_NODE")) {
        return true;
      }

      // Check if dragging files
      if (dataTransfer.types.includes("Files")) {
        const items = Array.from(dataTransfer.items);

        return items.some((item) => {
          if (item.kind === "file") {
            // Check MIME types for zip files
            if (
              item.type === "application/zip" ||
              item.type === "application/x-zip-compressed"
            ) {
              return acceptedFileExtensions.includes(".zip");
            }

            // For custom extensions (.phd, .phdm), browsers might not report
            // a specific MIME type (they show as '' or 'application/octet-stream')
            // We allow these through and do stricter validation on drop
            if (item.type === "" || item.type === "application/octet-stream") {
              return true;
            }
          }
          return false;
        });
      }

      return false;
    },
    [acceptedFileExtensions],
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const isValid = isValidDropContent(event.dataTransfer);

      if (isValid) {
        setIsDropTarget(true);
      } else {
        // Visual feedback that dropping is not allowed
        event.dataTransfer.dropEffect = "none";
      }
    },
    [isValidDropContent],
  );

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const isValid = isValidDropContent(event.dataTransfer);

      if (isValid) {
        dragDepthRef.current += 1;
        setIsDropTarget(true);
      }
    },
    [isValidDropContent],
  );

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

      const dropZoneId = target?.id || "root";
      const closestDropZoneId =
        closestDropZone?.getAttribute("data-drop-zone") || "root";

      if (closestDropZoneId !== dropZoneId) {
        setIsDropTarget(false);
        return;
      }

      try {
        let droppedFiles = getDroppedFiles(event.dataTransfer.items).filter(
          Boolean,
        );

        // Filter files by accepted extensions if specified
        if (acceptedFileExtensions && acceptedFileExtensions.length > 0) {
          droppedFiles = droppedFiles.filter((file) => {
            if (!file) return false;
            const fileName = file.name.toLowerCase();
            return acceptedFileExtensions.some((ext) =>
              fileName.endsWith(ext.toLowerCase()),
            );
          });
        }

        if (droppedFiles.length) {
          for (const file of droppedFiles) {
            if (file) {
              await onAddFile(file, target);
            }
          }
          return;
        }
        const altOrOptionKeyPressed = event.getModifierState("Alt");
        const data = event.dataTransfer.getData("UI_NODE");
        const droppedNode = JSON.parse(data) as Node;

        if (altOrOptionKeyPressed) {
          await onCopyNode(droppedNode, target);
        } else {
          await onMoveNode(droppedNode, target);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (trackNestedDrag) dragDepthRef.current = 0;
        setIsDropTarget(false);
      }
    },
    [onAddFile, onCopyNode, onMoveNode, target, trackNestedDrag],
  );

  return useMemo(() => {
    const baseProps: Record<string, unknown> = {
      onDragOver,
      onDrop,
      "data-drop-zone": target?.id || "root",
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
    target?.id,
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
