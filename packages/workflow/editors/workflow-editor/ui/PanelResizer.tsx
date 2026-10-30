import { useState, type KeyboardEvent, type PointerEvent } from "react";

export const PANEL_MIN_WIDTH = 352;
const PANEL_DEFAULT_WIDTH = 416;
// Leaves the canvas this share of the window at least.
const PANEL_MAX_SHARE = 0.7;
const KEY_STEP = 16;
const STORAGE_KEY = "workflow-editor:panel-width";

function clampWidth(width: number): number {
  const max = Math.max(
    PANEL_MIN_WIDTH,
    Math.floor(window.innerWidth * PANEL_MAX_SHARE),
  );
  return Math.min(max, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

function storedWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return stored > 0 ? clampWidth(stored) : PANEL_DEFAULT_WIDTH;
  } catch {
    return PANEL_DEFAULT_WIDTH;
  }
}

function storeWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Without storage the width lasts until reload.
  }
}

/** The side panel's width, remembered per browser. */
export function usePanelWidth() {
  const [width, setWidth] = useState(storedWidth);
  const resize = (next: number, persist: boolean) => {
    const clamped = clampWidth(next);
    setWidth(clamped);
    if (persist) storeWidth(clamped);
  };
  return { width, resize };
}

/** A drag handle on the panel's left edge; arrow keys resize it too. */
export function PanelResizer(props: {
  width: number;
  onResize: (width: number, persist: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = props.width;
    const widthAt = (x: number) => startWidth + (startX - x);
    const move = (e: globalThis.PointerEvent) =>
      props.onResize(widthAt(e.clientX), false);
    const up = (e: globalThis.PointerEvent) => {
      props.onResize(widthAt(e.clientX), true);
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    setDragging(true);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowLeft"
        ? KEY_STEP
        : event.key === "ArrowRight"
          ? -KEY_STEP
          : 0;
    if (!delta) return;
    event.preventDefault();
    props.onResize(props.width + delta, true);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={props.width}
      aria-valuemin={PANEL_MIN_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => props.onResize(PANEL_DEFAULT_WIDTH, true)}
      className={`absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:transition-colors hover:after:bg-ring/60 focus-visible:after:bg-ring ${dragging ? "after:bg-ring" : ""}`}
    />
  );
}
