// Right-click menu contents and placement; pure so the canvas only has to
// map an action id onto the editor callbacks.
import type { PointModel, WorkflowModel } from "./model.js";

export type ContextMenuTarget =
  | { kind: "step"; id: string }
  | { kind: "trigger" }
  | { kind: "edge"; id: string }
  | { kind: "pane" };

export type ContextMenuActionId =
  | "open"
  | "addBelow"
  | "duplicate"
  | "removeStep"
  | "changeTrigger"
  | "removeTrigger"
  | "insertStep"
  | "removeEdge"
  | "addStep"
  | "selectAll"
  | "fitView";

export interface ContextMenuItem {
  id: ContextMenuActionId;
  label: string;
  disabled?: boolean;
}

// Branches route through true/false, so their "next" port is never free.
function nextPortFree(model: WorkflowModel, id: string): boolean {
  const step = model.steps.find((entry) => entry.id === id);
  if (step?.blockType === "core#branch") return false;
  return !model.edges.some((edge) => edge.from === id && edge.port === "next");
}

export function contextMenuItems(
  target: ContextMenuTarget,
  model: WorkflowModel,
): ContextMenuItem[] {
  switch (target.kind) {
    case "step":
      return [
        { id: "open", label: "Open settings" },
        {
          id: "addBelow",
          label: "Add step below",
          disabled: !nextPortFree(model, target.id),
        },
        { id: "duplicate", label: "Duplicate step" },
        { id: "removeStep", label: "Remove step" },
      ];
    case "trigger":
      return [
        { id: "open", label: "Open settings" },
        {
          id: "addBelow",
          label: "Add step below",
          disabled: !model.trigger || !nextPortFree(model, model.trigger.id),
        },
        { id: "changeTrigger", label: "Change trigger" },
        { id: "removeTrigger", label: "Remove trigger" },
      ];
    case "edge":
      return [
        { id: "insertStep", label: "Insert step here" },
        { id: "removeEdge", label: "Remove edge" },
      ];
    case "pane":
      return [
        { id: "addStep", label: "Add step here" },
        {
          id: "selectAll",
          label: "Select all steps",
          disabled: model.steps.length === 0,
        },
        { id: "fitView", label: "Fit view" },
      ];
  }
}

export const MENU_WIDTH = 176;
const MENU_ITEM_HEIGHT = 28;
const MENU_PADDING = 4;
const VIEWPORT_MARGIN = 8;

export function menuHeight(items: number): number {
  return items * MENU_ITEM_HEIGHT + MENU_PADDING * 2;
}

export interface MenuSize {
  width: number;
  height: number;
}

function clampToViewport(
  at: number,
  extent: number,
  available: number,
): number {
  return Math.max(
    VIEWPORT_MARGIN,
    Math.min(at, available - extent - VIEWPORT_MARGIN),
  );
}

// Anchors the menu at the pointer, flipping it back over the pointer near the
// right/bottom edges and clamping so it always stays inside the viewport.
export function menuPosition(
  point: PointModel,
  size: MenuSize,
  viewport: MenuSize,
): PointModel {
  const place = (at: number, extent: number, available: number): number =>
    clampToViewport(
      at + extent > available - VIEWPORT_MARGIN ? at - extent : at,
      extent,
      available,
    );
  return {
    x: place(point.x, size.width, viewport.width),
    y: place(point.y, size.height, viewport.height),
  };
}

// The box a side-panel popup hangs off: only the edges placement reads.
export interface MenuAnchor {
  left: number;
  right: number;
  top: number;
}

const ANCHOR_GAP = 8;

// Places a popup beside its anchor: right edge at the anchor's left edge,
// flipped to the anchor's right side when the left has no room, top aligned
// with the anchor, and clamped into the viewport on both axes.
export function anchorLeftPosition(
  anchor: MenuAnchor,
  size: MenuSize,
  viewport: MenuSize,
): PointModel {
  const left = anchor.left - ANCHOR_GAP - size.width;
  return {
    x: clampToViewport(
      left >= VIEWPORT_MARGIN ? left : anchor.right + ANCHOR_GAP,
      size.width,
      viewport.width,
    ),
    y: clampToViewport(anchor.top, size.height, viewport.height),
  };
}
