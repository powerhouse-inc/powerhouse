import type { Node } from "@powerhousedao/shared";
import type { DragEventHandler } from "react";
import {
  allPass,
  filter,
  find,
  hasAtLeast,
  isArray,
  isDefined,
  isIncludedIn,
  isStrictEqual,
  isTruthy,
  last,
  map,
  once,
  pipe,
  split,
} from "remeda";
import { useIsDragAndDropEnabled } from "./config/editor.js";
import { useSelectedFolder } from "./selected-folder.js";
import { useDropTarget } from "./use-drop-target.js";

/* Supported file extensions, more can be added here */
const allowedExtensions = ["zip", "phd", "phdm"] as const;

const hasFilesType = (types: readonly string[]) =>
  isDefined(find(types, (type) => isStrictEqual(type, "Files")));

/* A drop is a file drop when the data transfer types array has "Files" */
const isFileDrop = (event: React.DragEvent<Element>) =>
  allPass(event.dataTransfer.types, [isArray, hasAtLeast(1), hasFilesType]);

/* Marker attribute editors set on their root element to opt out of the
 * outer DropZone, so they can handle arbitrary file drops themselves. */
export const EDITOR_FILE_DROP_OPT_OUT_ATTR = "data-accepts-files";

const isInsideEditorFileDropOptOut = (event: React.DragEvent<Element>) => {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return target.closest(`[${EDITOR_FILE_DROP_OPT_OUT_ATTR}]`) !== null;
};

const hasAllowedExtension = (file: File) =>
  pipe(
    file,
    (file) => file.name,
    split("."),
    last(),
    isIncludedIn(allowedExtensions),
  );

/* Gets uploaded files from the drop event data transfer */
const getFileItems = (event: React.DragEvent<Element>) =>
  pipe(
    [...event.dataTransfer.items],
    filter((item) => isStrictEqual(item.kind, "file")),
    map((item) => item.getAsFile()),
    filter(isTruthy),
  );

/* Allows uploading of files by drag and drop.
 * Intended for use in the drop-zone component in connect.
 */
export function useDropFile(
  handleAddFile: (file: File, parent: Node | undefined) => Promise<void>,
) {
  const { isDropTarget, setTarget, unsetTarget } = useDropTarget();
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const selectedFolder = useSelectedFolder();

  function handleDragEvent(event: React.DragEvent<Element>, cb?: () => void) {
    if (!isDragAndDropEnabled) return;
    if (!isFileDrop(event)) return;
    if (isInsideEditorFileDropOptOut(event)) {
      // Hide the DropZone overlay while the cursor is over an editor that
      // opts in to its own file drops, so the overlay doesn't strand the
      // user covering the opt-out region.
      unsetTarget();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cb?.();
  }

  const handleAddFiles = (event: React.DragEvent<Element>) =>
    Promise.all(
      pipe(
        event,
        getFileItems,
        filter(hasAllowedExtension),
        map((file) => handleAddFile(file, selectedFolder)),
      ),
    );

  const onDragEnter: DragEventHandler = (event) => handleDragEvent(event);

  const onDragOver: DragEventHandler = (event) =>
    handleDragEvent(event, setTarget);

  const onDragLeave: DragEventHandler = (event) =>
    handleDragEvent(event, unsetTarget);

  const onDrop: DragEventHandler = (event) =>
    handleDragEvent(
      event,
      once(() => {
        unsetTarget();
        handleAddFiles(event).catch(console.error);
      }),
    );

  return {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    isDropTarget,
  };
}
