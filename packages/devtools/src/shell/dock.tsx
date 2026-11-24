import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../lib/cn.js";
import { DevtoolsFrame } from "./frame.js";
import { clampSize, MAX_SIZE, MIN_SIZE, useShell } from "./state.js";

const KEY_STEP = 0.02;

export function DockedDevtools() {
  const { dock, size, setSize } = useShell();
  const [resizing, setResizing] = useState(false);
  const sizeBeforeDrag = useRef(size);
  const bottom = dock === "bottom";

  const sizeAt = (event: ReactPointerEvent) =>
    clampSize(
      bottom
        ? 1 - event.clientY / window.innerHeight
        : 1 - event.clientX / window.innerWidth,
    );
  const onKeyDown = (event: ReactKeyboardEvent) => {
    const grow = bottom ? "ArrowUp" : "ArrowLeft";
    const shrink = bottom ? "ArrowDown" : "ArrowRight";
    if (event.key !== grow && event.key !== shrink) return;
    event.preventDefault();
    setSize(
      clampSize(size + (event.key === grow ? KEY_STEP : -KEY_STEP)),
      true,
    );
  };

  return (
    <div
      role="region"
      aria-label="DevTools"
      className={cn(
        "fixed z-40",
        bottom
          ? "inset-x-0 bottom-0 border-t shadow-[0_-16px_48px_-16px_rgb(0_0_0/0.45)]"
          : "inset-y-0 right-0 border-l shadow-[-16px_0_48px_-16px_rgb(0_0_0/0.45)]",
        resizing && "select-none",
      )}
      style={
        bottom ? { height: `${size * 100}%` } : { width: `${size * 100}%` }
      }
    >
      <div
        role="separator"
        aria-label="Resize DevTools"
        aria-orientation={bottom ? "horizontal" : "vertical"}
        aria-valuenow={Math.round(size * 100)}
        aria-valuemin={MIN_SIZE * 100}
        aria-valuemax={MAX_SIZE * 100}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          sizeBeforeDrag.current = size;
          setResizing(true);
        }}
        onPointerMove={(event) => resizing && setSize(sizeAt(event), false)}
        onPointerUp={(event) => {
          if (!resizing) return;
          setResizing(false);
          setSize(sizeAt(event), true);
        }}
        onPointerCancel={() => {
          if (!resizing) return;
          setResizing(false);
          setSize(sizeBeforeDrag.current, true);
        }}
        className={cn(
          "group absolute z-10 flex items-center justify-center outline-none",
          bottom
            ? "inset-x-0 -top-1.5 h-3 cursor-row-resize"
            : "inset-y-0 -left-1.5 w-3 cursor-col-resize",
        )}
      >
        <span
          className={cn(
            "bg-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            bottom ? "h-0.5 w-full" : "h-full w-0.5",
            resizing && "opacity-100",
          )}
        />
      </div>
      <DevtoolsFrame mode="docked" />
    </div>
  );
}
