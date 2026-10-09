// A scrolling list that mounts only the rows in view. Rows have known heights,
// so offsets are a running sum rather than a measurement.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const OVERSCAN = 6;

export function rowOffsets(heights: readonly number[]): number[] {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets.at(-1)! + height);
  return offsets;
}

// Rows [start, end) overlapping the window, plus the overscan either side.
export function visibleRange(
  offsets: readonly number[],
  scrollTop: number,
  height: number,
  overscan = OVERSCAN,
): [number, number] {
  const count = offsets.length - 1;
  let start = 0;
  while (start < count && offsets[start + 1] <= scrollTop) start++;
  let end = start;
  while (end < count && offsets[end] < scrollTop + height) end++;
  return [Math.max(0, start - overscan), Math.min(count, end + overscan)];
}

export function VirtualList<T>(props: {
  items: readonly T[];
  heightOf: (item: T) => number;
  keyOf: (item: T, index: number) => string;
  render: (item: T, index: number) => React.ReactNode;
  // Kept in view as it moves.
  activeIndex?: number;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);
  const offsets = useMemo(
    () => rowOffsets(props.items.map(props.heightOf)),
    [props.items, props.heightOf],
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  // A new list starts from its top; the scroll event syncs the state.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [props.items]);

  useEffect(() => {
    const element = ref.current;
    const index = props.activeIndex;
    if (!element || index === undefined || index < 0) return;
    const top = offsets.at(index);
    const bottom = offsets.at(index + 1);
    if (top === undefined || bottom === undefined) return;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
  }, [props.activeIndex, offsets]);

  const [start, end] = visibleRange(offsets, scrollTop, height);
  return (
    <div
      ref={ref}
      aria-label={props.label}
      className={`min-h-0 overflow-y-auto ${props.className ?? ""}`}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: offsets.at(-1), position: "relative" }}>
        {props.items.slice(start, end).map((item, i) => {
          const index = start + i;
          return (
            <div
              key={props.keyOf(item, index)}
              style={{
                position: "absolute",
                top: offsets[index],
                left: 0,
                right: 0,
                height: offsets[index + 1] - offsets[index],
              }}
            >
              {props.render(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
