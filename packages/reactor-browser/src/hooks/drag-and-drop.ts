import type { Node } from "@powerhousedao/shared";
import { useState, type DragEventHandler } from "react";
import {
  allPass,
  conditional,
  constant,
  filter,
  find,
  hasAtLeast,
  isArray,
  isDefined,
  isIncludedIn,
  isNot,
  isStrictEqual,
  isTruthy,
  last,
  map,
  pipe,
  split,
} from "remeda";
import { moveNodeById } from "../actions/document.js";
import { useIsDragAndDropEnabled } from "./config/editor.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { useSelectedDriveId } from "./selected-drive.js";
import { useSelectedFolder } from "./selected-folder.js";
export type DraggingNode = {
  srcId: string;
  parentId: string | null | undefined;
};

const draggingNodeEventFunctions = makePHEventFunctions("draggingNode");

export const useDraggingNode = draggingNodeEventFunctions.useValue;

export const setDraggingNode = draggingNodeEventFunctions.setValue;
export const addDraggingNodeEventHandler =
  draggingNodeEventFunctions.addEventHandler;

/* Decide if a node is being dragged based on its id, parent and drive */
const isNodeDrag = (params: {
  srcId: string | undefined;
  driveId: string | undefined;
  parentId: string | null | undefined;
}): params is {
  srcId: string;
  driveId: string;
  parentId: string | null | undefined;
} =>
  conditional(
    params,
    // no drag if no src
    [({ srcId }) => isNot(isTruthy)(srcId), constant(false)],
    // no drag if no drive
    [({ driveId }) => isNot(isTruthy)(driveId), constant(false)],
    // no drag drive
    [({ driveId, srcId }) => isStrictEqual(driveId, srcId), constant(false)],
    constant(true),
  );

export function useDragNode(args: {
  srcId: string | undefined;
  parentId: string | null | undefined;
}) {
  const { srcId, parentId } = args;
  const driveId = useSelectedDriveId();
  const params = {
    driveId,
    srcId,
    parentId,
  };
  const draggable = isNodeDrag(params);
  const onDragStart: DragEventHandler = () => {
    if (!draggable) return;
    setDraggingNode(params);
  };

  return {
    draggable,
    onDragStart,
  };
}

/* Decide if a node can and should be dropped on the target based on the
 * dragged node's id, the target node's id, the dragged node's current parent, 
and the drive id. */
const isNodeDrop = (params: {
  driveId: string | undefined;
  parentId: string | undefined | null;
  targetId: string | undefined;
  srcId: string | undefined;
}): params is {
  driveId: string;
  srcId: string;
  parentId: string | undefined | null;
  targetId: string | undefined;
} =>
  conditional(
    params,
    // no drop if no src
    [({ srcId }) => isNot(isTruthy)(srcId), constant(false)],
    // no drop if no drive
    [({ driveId }) => isNot(isDefined)(driveId), constant(false)],
    // no drop into self
    [({ srcId, targetId }) => isStrictEqual(srcId, targetId), constant(false)],
    // no drop into drive if already in top level of drive
    [
      ({ driveId, parentId, targetId }) =>
        isNot(isTruthy)(parentId) && isStrictEqual(targetId, driveId),
      constant(false),
    ],
    // no drop into current parent
    [
      ({ targetId, parentId }) => isStrictEqual(targetId, parentId),
      constant(false),
    ],
    constant(true),
  );

export function useDropNode(targetId: string | undefined) {
  const driveId = useSelectedDriveId();
  const { srcId, parentId } = useDraggingNode() ?? {};

  const params = {
    driveId,
    parentId,
    targetId,
    srcId,
  };

  function handleNodeDrop(event: React.DragEvent<Element>, cb?: () => void) {
    if (!isNodeDrop(params)) return;

    event.preventDefault();
    event.stopPropagation();

    cb?.();
  }

  const onDragOver: DragEventHandler = (event) => handleNodeDrop(event);
  const onDragEnter: DragEventHandler = (event) => handleNodeDrop(event);

  const onDrop: DragEventHandler = (event) =>
    handleNodeDrop(event, () => {
      setDraggingNode(undefined);
      moveNodeById(params).catch(console.error);
    });

  return { onDragEnter, onDragOver, onDrop };
}

const allowedExtentions = ["zip", "phd", "phdm"] as const;

const hasFilesType = (types: readonly string[]) =>
  isDefined(find(types, (type) => isStrictEqual(type, "Files")));

const isFileDrop = (event: React.DragEvent<Element>) =>
  allPass(event.dataTransfer.types, [isArray, hasAtLeast(1), hasFilesType]);

const hasAllowedExtension = (file: File) =>
  pipe(
    file,
    (file) => file.name,
    split("."),
    last(),
    isIncludedIn(allowedExtentions),
  );

const getFileItems = (event: React.DragEvent<Element>) =>
  pipe(
    Array.from(event.dataTransfer.items),
    filter((item) => isStrictEqual(item.kind, "file")),
    map((item) => item.getAsFile()),
    filter(isTruthy),
  );

export function useDropFile(
  handleAddFile: (file: File, parent: Node | undefined) => Promise<void>,
) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const selectedFolder = useSelectedFolder();

  function handleDragEvent(event: React.DragEvent<Element>, cb?: () => void) {
    if (!isDragAndDropEnabled) return;
    if (!isFileDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    cb?.();
  }

  const handleAddFiles = (files: File[]) =>
    map(files, (file) => handleAddFile(file, selectedFolder));

  const onDragEnter: DragEventHandler = (event) => handleDragEvent(event);

  const onDragOver: DragEventHandler = (event) =>
    handleDragEvent(event, () => setIsDropTarget(true));

  const onDragLeave: DragEventHandler = (event) =>
    handleDragEvent(event, () => setIsDropTarget(false));

  const onDrop: DragEventHandler = (event) =>
    handleDragEvent(event, () => {
      setIsDropTarget(false);
      Promise.all(
        pipe(event, getFileItems, filter(hasAllowedExtension), handleAddFiles),
      ).catch(console.error);
    });

  return {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    isDropTarget,
  };
}
