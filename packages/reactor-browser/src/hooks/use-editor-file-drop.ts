import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type DragEventHandler,
} from "react";
import { EDITOR_FILE_DROP_OPT_OUT_ATTR } from "./file-drag-and-drop.js";

export type UseEditorFileDropOptions = {
  /** Lowercase file extensions including the dot (e.g. [".png", ".pdf"]).
   *  When omitted, all files are accepted. */
  accept?: readonly string[];
  /** Called with the files that passed the extension filter. */
  onFiles: (files: File[]) => void;
};

export type UseEditorFileDropResult = {
  /** Spread onto the editor's root element. Includes the opt-out attribute
   *  so the outer DropZone leaves file drops alone within this subtree. */
  dragProps: {
    onDragEnter: DragEventHandler<Element>;
    onDragOver: DragEventHandler<Element>;
    onDragLeave: DragEventHandler<Element>;
    onDrop: DragEventHandler<Element>;
  } & Record<typeof EDITOR_FILE_DROP_OPT_OUT_ATTR, "">;
  /** True while a file drag is hovering anywhere inside the editor root. */
  isDragOver: boolean;
};

const hasFiles = (event: DragEvent<Element>) =>
  event.dataTransfer.types.includes("Files");

const filterByExtension = (files: FileList, accept?: readonly string[]) => {
  const all = Array.from(files);
  if (!accept || accept.length === 0) return all;
  const lowerAccept = accept.map((ext) => ext.toLowerCase());
  return all.filter((file) => {
    const lower = file.name.toLowerCase();
    return lowerAccept.some((ext) => lower.endsWith(ext));
  });
};

export function useEditorFileDrop(
  options: UseEditorFileDropOptions,
): UseEditorFileDropResult {
  const { accept, onFiles } = options;
  const [isDragOver, setIsDragOver] = useState(false);
  const depthRef = useRef(0);

  const onDragOver = useCallback<DragEventHandler<Element>>((event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
  }, []);

  const onDragEnter = useCallback<DragEventHandler<Element>>((event) => {
    if (!hasFiles(event)) return;
    depthRef.current += 1;
    if (depthRef.current === 1) setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback<DragEventHandler<Element>>((event) => {
    if (!hasFiles(event)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setIsDragOver(false);
  }, []);

  const onDrop = useCallback<DragEventHandler<Element>>(
    (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depthRef.current = 0;
      setIsDragOver(false);
      const accepted = filterByExtension(event.dataTransfer.files, accept);
      if (accepted.length === 0) return;
      onFiles(accepted);
    },
    [accept, onFiles],
  );

  return {
    dragProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
      [EDITOR_FILE_DROP_OPT_OUT_ATTR]: "",
    },
    isDragOver,
  };
}
