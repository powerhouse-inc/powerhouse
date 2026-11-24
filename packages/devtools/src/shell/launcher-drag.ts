import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { stored, useStored } from "../lib/stored.js";

/** Where the launcher can rest: the four corners and the middle of each edge. */
export const ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type Anchor = (typeof ANCHORS)[number];

const DEFAULT_ANCHOR: Anchor = "bottom-right";
/** Pointer travel before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4;
/** Distance from an anchor at which the launcher is pulled onto it while dragging. */
const SNAP_RADIUS = 64;
const SETTLE_MS = 280;
const SETTLE = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.15)`;

type Point = { x: number; y: number };
type Size = { w: number; h: number };

const ANCHOR = stored<Anchor>({
  key: "launcher-anchor",
  scope: "preference",
  fallback: DEFAULT_ANCHOR,
  parse: (json) => ANCHORS.find((a) => a === json),
});

function useViewport(): Size {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** The space an element resting on an anchor keeps from the window's edges. */
export const anchorMargin = (viewportWidth: number) =>
  viewportWidth < 640 ? 12 : 16;

/** Top-left corner of an element of `size` resting on `anchor`. */
export function anchorPoint(anchor: Anchor, size: Size, vp: Size): Point {
  const margin = anchorMargin(vp.w);
  const [v, h] = anchor.split("-");
  return {
    x:
      h === "left"
        ? margin
        : h === "right"
          ? vp.w - size.w - margin
          : (vp.w - size.w) / 2,
    y:
      v === "top"
        ? margin
        : v === "bottom"
          ? vp.h - size.h - margin
          : (vp.h - size.h) / 2,
  };
}

function nearestAnchor(p: Point, size: Size, vp: Size) {
  let best = { anchor: DEFAULT_ANCHOR as Anchor, distance: Infinity };
  for (const anchor of ANCHORS) {
    const a = anchorPoint(anchor, size, vp);
    const distance = Math.hypot(a.x - p.x, a.y - p.y);
    if (distance < best.distance) best = { anchor, distance };
  }
  return best;
}

type Drag = { point: Point; snapped: Anchor | null };

/**
 * Makes a fixed element draggable between the anchors. Close to an anchor it is pulled onto it;
 * on release it settles on the nearest one, which is saved for every tab. A press that does not
 * travel stays a click on whatever it pressed inside the element.
 */
export function useLauncherDrag() {
  const viewport = useViewport();
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [anchor, setAnchor] = useStored(ANCHOR);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const endGesture = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  useEffect(() => () => endGesture.current?.(), []);

  useEffect(() => {
    if (!settling) return;
    const t = window.setTimeout(() => setSettling(false), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [settling]);

  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const finish = (commit: boolean) => {
    const d = dragRef.current;
    if (!d || !size) return;
    if (commit) {
      const next = d.snapped ?? nearestAnchor(d.point, size, viewport).anchor;
      setAnchor(next);
    }
    update(null);
    setSettling(true);
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    // Popups the element opens are portaled elsewhere in the DOM, but their
    // React events still bubble here.
    if (e.button !== 0 || !size || !e.currentTarget.contains(e.target as Node))
      return;
    const element = e.currentTarget;
    const { pointerId } = e;
    const rect = element.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let moved = false;

    // The window, because the pointer can leave the element before the press
    // becomes a drag.
    const onMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (!moved) {
        const travel = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        );
        if (travel < DRAG_THRESHOLD) return;
        moved = true;
        // Under capture, the click that ends the drag goes to the element
        // instead of the control the press started on.
        element.setPointerCapture(pointerId);
      }
      const point = {
        x: Math.min(Math.max(event.clientX - offset.x, 0), viewport.w - size.w),
        y: Math.min(Math.max(event.clientY - offset.y, 0), viewport.h - size.h),
      };
      const near = nearestAnchor(point, size, viewport);
      update({
        point,
        snapped: near.distance < SNAP_RADIUS ? near.anchor : null,
      });
    };
    const onEnd = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      stop();
      finish(event.type === "pointerup");
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      endGesture.current = null;
    };
    endGesture.current?.();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    endGesture.current = stop;
  };

  const resting = size ? anchorPoint(anchor, size, viewport) : null;
  const point = drag
    ? drag.snapped && size
      ? anchorPoint(drag.snapped, size, viewport)
      : drag.point
    : resting;

  const style: CSSProperties = {
    transform: point ? `translate(${point.x}px, ${point.y}px)` : undefined,
    visibility: point ? undefined : "hidden",
    transition: drag?.snapped || settling ? SETTLE : "none",
    touchAction: "none",
  };

  return {
    anchor,
    attach: setEl,
    style,
    dragging: drag !== null,
    /** The anchor the launcher would land on now; highlighted among the drop targets. */
    target: drag
      ? (drag.snapped ??
        (size ? nearestAnchor(drag.point, size, viewport).anchor : null))
      : null,
    targetPoint: (a: Anchor) => (size ? anchorPoint(a, size, viewport) : null),
    size,
    handlers: { onPointerDown },
  };
}
