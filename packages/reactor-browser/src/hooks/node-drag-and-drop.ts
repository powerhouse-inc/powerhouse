import { type DragEventHandler } from "react";
import {
  conditional,
  constant,
  funnel,
  isDefined,
  isNot,
  isStrictEqual,
  isTruthy,
  once,
} from "remeda";
import { moveNodeById } from "../actions/document.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { useSelectedDriveId } from "./selected-drive.js";
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

  const params = {
    driveId,
    srcId,
    parentId,
  };
  const draggable = isNodeDrag(params);

  const onDragStart: DragEventHandler = () => {
    if (!draggable) return;
    setDragging(params);
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

/* Allows a node to be a drop target */
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
    handleNodeDrop(
      event,
      once(() => {
        unsetDragging();
        moveNodeById(params).catch(console.error);
      }),
    );

  return { onDragEnter, onDragOver, onDrop };
}
