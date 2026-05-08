import { type DragEventHandler } from "react";
import {
  allPass,
  conditional,
  constant,
  funnel,
  isDefined,
  isNot,
  isStrictEqual,
  isString,
  isTruthy,
  once,
} from "remeda";
import { moveNodeById } from "../actions/document.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { useSelectedDriveId } from "./selected-drive.js";
import { useDropTarget } from "./use-drop-target.js";
export type DraggingNode = {
  srcId: string;
  parentId: string | null | undefined;
};

const draggingNodeEventFunctions = makePHEventFunctions("draggingNode");
const useDraggingNode = draggingNodeEventFunctions.useValue;
const setDraggingNode = draggingNodeEventFunctions.setValue;
export const addDraggingNodeEventHandler =
  draggingNodeEventFunctions.addEventHandler;

const draggingNodeSetter = funnel(
  (node: DraggingNode) => setDraggingNode(node),
  {
    reducer: (_, newNode: DraggingNode) => newNode,
    triggerAt: "start",
    minQuietPeriodMs: 100,
  },
);

const draggingNodeUnsetter = funnel(() => setDraggingNode(undefined), {
  triggerAt: "start",
  minQuietPeriodMs: 100,
});

function setDragging(node: DraggingNode) {
  draggingNodeUnsetter.cancel();
  draggingNodeSetter.call(node);
}

function unsetDragging() {
  draggingNodeSetter.cancel();
  draggingNodeUnsetter.call();
}

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

/* Allows a node to be dragged */
export function useDragNode(args: {
  srcId: string | undefined;
  parentId: string | null | undefined;
}) {
  const { srcId, parentId } = args;
  const driveId = useSelectedDriveId();
  const draggingNodeId = useDraggingNode()?.srcId;

  const params = {
    driveId,
    srcId,
    parentId,
  };
  const draggable = isNodeDrag(params);

  const isDragging = allPass({ srcId, draggingNodeId }, [
    () => draggable,
    ({ srcId }) => isString(srcId),
    ({ draggingNodeId }) => isString(draggingNodeId),
    ({ srcId, draggingNodeId }) => isStrictEqual(srcId, draggingNodeId),
  ]);

  const onDragStart: DragEventHandler = () => {
    if (!draggable) return;
    setDragging(params);
  };

  const onDragEnd: DragEventHandler = () => {
    if (!draggable) return;
    unsetDragging();
  };

  return {
    isDragging,
    draggable,
    onDragStart,
    onDragEnd,
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

/* Allows a node to be a drop target */
export function useDropNode(targetId: string | undefined) {
  const driveId = useSelectedDriveId();
  const { srcId, parentId } = useDraggingNode() ?? {};
  const { isDropTarget, setTarget, unsetTarget } = useDropTarget();

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

  const onDragEnter: DragEventHandler = (event) => handleNodeDrop(event);

  const onDragOver: DragEventHandler = (event) =>
    handleNodeDrop(event, once(setTarget));

  const onDragLeave: DragEventHandler = (event) =>
    handleNodeDrop(event, once(unsetTarget));

  const onDrop: DragEventHandler = (event) =>
    handleNodeDrop(
      event,
      once(() => {
        unsetDragging();
        unsetTarget();
        moveNodeById(params).catch(console.error);
      }),
    );

  return { isDropTarget, onDragEnter, onDragOver, onDragLeave, onDrop };
}
