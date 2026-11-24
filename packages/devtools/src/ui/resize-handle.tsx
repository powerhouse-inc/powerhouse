import {
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "../lib/cn.js";
import { stored, useStored, type Stored } from "../lib/stored.js";

export type WidthLimits = { initial: number; min: number; max: number };

const KEY_STEP = 16;

const clamp = (width: number, { min, max }: WidthLimits) =>
  Math.round(Math.min(max, Math.max(min, width)));

/** A width in pixels the user can change, saved under `key` for every tab. */
export function storedWidth(
  key: string,
  { initial, min, max }: WidthLimits,
): Stored<number> {
  return stored<number>({
    key,
    scope: "preference",
    fallback: initial,
    parse: (json) =>
      typeof json === "number" && json >= min && json <= max ? json : undefined,
  });
}

/** The width to show, and a setter that saves it when `save`: a drag shows
 * each step and saves where it ends. */
export function useStoredWidth(
  width: Stored<number>,
  limits: WidthLimits,
): [number, (width: number, save: boolean) => void] {
  const [saved, setSaved] = useStored(width);
  const [dragged, setDragged] = useState<number>();
  return [
    dragged ?? saved,
    (next, save) => {
      const clamped = clamp(next, limits);
      setDragged(save ? undefined : clamped);
      if (save) setSaved(clamped);
    },
  ];
}

/**
 * A vertical separator that resizes the pane on its left: drag it, or focus
 * it and use the arrow keys. A double click restores the initial width.
 */
export function ResizeHandle({
  label,
  width,
  limits,
  onWidth,
  className,
  style,
  ...data
}: {
  label: string;
  width: number;
  limits: WidthLimits;
  onWidth: (width: number, save: boolean) => void;
  className?: string;
  style?: CSSProperties;
} & { [k: `data-${string}`]: string | undefined }) {
  const [drag, setDrag] = useState<{ x: number; width: number }>();

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, width });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag) onWidth(drag.width + e.clientX - drag.x, false);
  };
  const endDrag = () => {
    if (!drag) return;
    setDrag(undefined);
    onWidth(width, true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowLeft: width - KEY_STEP,
      ArrowRight: width + KEY_STEP,
      Home: limits.min,
      End: limits.max,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onWidth(next, true);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      {...data}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onWidth(limits.initial, true)}
      onKeyDown={onKeyDown}
      style={style}
      className={cn(
        "group z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none select-none",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mx-auto block h-full w-px transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary",
          drag && "bg-primary",
        )}
      />
    </div>
  );
}
