// Canvas right-click menu, in the spirit of the Activepieces builder step and
// edge context menus; the step pickers reuse the add-button BlockSelector.
import { useEffect, useRef, useState } from "react";
import { BlockSelector } from "./BlockSelector.js";
import { STEP_PRESETS, TRIGGER_PRESETS, type BlockPreset } from "./blocks.js";
import {
  contextMenuItems,
  menuHeight,
  menuPosition,
  MENU_WIDTH,
  type ContextMenuActionId,
  type ContextMenuTarget,
} from "./canvas-menu.js";
import type { PointModel, WorkflowModel } from "./model.js";

export interface CanvasMenuState {
  target: ContextMenuTarget;
  point: PointModel;
}

// Actions that pick a block first; the rest fire straight away.
const PICKERS: Partial<Record<ContextMenuActionId, string>> = {
  addBelow: "Add step",
  addStep: "Add step",
  insertStep: "Insert step",
  changeTrigger: "Choose a trigger",
};

const PICKER_SIZE = { width: 320, height: 400 };

export function CanvasContextMenu(props: {
  state: CanvasMenuState;
  model: WorkflowModel;
  onAction: (action: ContextMenuActionId, preset?: BlockPreset) => void;
  onClose: () => void;
}) {
  const [picker, setPicker] = useState<ContextMenuActionId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) {
        props.onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", props.onClose, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", props.onClose, true);
    };
  }, [props]);

  const items = contextMenuItems(props.state.target, props.model);
  const size = picker
    ? PICKER_SIZE
    : { width: MENU_WIDTH, height: menuHeight(items.length) };
  const position = menuPosition(props.state.point, size, {
    width: window.innerWidth,
    height: window.innerHeight,
  });

  return (
    <div
      ref={containerRef}
      className="workflow-context-menu nodrag nopan fixed"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {picker ? (
        <BlockSelector
          title={PICKERS[picker] ?? ""}
          presets={picker === "changeTrigger" ? TRIGGER_PRESETS : STEP_PRESETS}
          showPieces
          pieceMode={picker === "changeTrigger" ? "triggers" : "actions"}
          onPick={(preset) => props.onAction(picker, preset)}
          onClose={props.onClose}
        />
      ) : (
        <div
          style={{ width: MENU_WIDTH }}
          className="rounded-md border border-solid border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 ${
                item.disabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-slate-50"
              }`}
              disabled={item.disabled}
              onClick={() => {
                if (PICKERS[item.id]) setPicker(item.id);
                else props.onAction(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
