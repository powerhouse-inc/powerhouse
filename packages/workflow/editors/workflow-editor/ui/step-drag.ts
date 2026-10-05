// Dragging a step card onto an append slot re-parents it. The slots are the
// only drop targets, so a drop always names a step and a port.
import { useSyncExternalStore } from "react";
import { reachableFrom } from "./ap-layout.js";
import type { WorkflowModel } from "./model.js";

export interface StepMove {
  stepId: string;
  toParentId: string;
  port: string;
}

export type MoveRejection = "self" | "cycle" | "already-there";

// Why this move can't happen, or null when it can.
export function moveRejection(
  model: WorkflowModel,
  move: StepMove,
): MoveRejection | null {
  if (move.stepId === move.toParentId) return "self";
  if (
    model.edges.some(
      (edge) =>
        edge.from === move.toParentId &&
        edge.to === move.stepId &&
        edge.port === move.port,
    )
  ) {
    return "already-there";
  }
  // The slot's owner must not be somewhere the step already leads to.
  if (reachableFrom(move.stepId, model.edges).has(move.toParentId)) {
    return "cycle";
  }
  return null;
}

export function canMoveStep(model: WorkflowModel, move: StepMove): boolean {
  return moveRejection(model, move) === null;
}

export const MOVE_REJECTION_TEXT: Record<MoveRejection, string> = {
  self: "A step can't follow itself",
  cycle: "That slot is inside this step's own path",
  "already-there": "Already connected there",
};

// The step being dragged, shared with the slots so they can offer themselves.
let dragging: string | undefined;
const listeners = new Set<() => void>();

export function setDraggingStep(stepId: string | undefined): void {
  if (dragging === stepId) return;
  dragging = stepId;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string | undefined {
  return dragging;
}

export function useDraggingStep(): string | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
